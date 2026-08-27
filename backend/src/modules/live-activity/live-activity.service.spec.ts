import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LiveActivityStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LiveActivityService } from './live-activity.service';
import { ApnsService } from './apns.service';

const USER_A = 'user-a';
const USER_B = 'user-b';
const ORDER_A = 'order-a';
const ORDER_B = 'order-b';

function okSend() {
  return { ok: true, status: 200, tokenInvalid: false };
}

describe('LiveActivityService', () => {
  let service: LiveActivityService;
  let prisma: {
    order: { findUnique: jest.Mock; update: jest.Mock };
    pickupPoint: { findUnique: jest.Mock };
    liveActivity: {
      upsert: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let apns: { sendLiveActivityUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_A,
          userId: USER_A,
          status: OrderStatus.PREPARING,
          publicOrderNumber: 'BE-1024',
          estimatedReadyAt: new Date('2026-08-11T19:42:00Z'),
          pickupPointId: 'pp-1',
          slot: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      pickupPoint: { findUnique: jest.fn().mockResolvedValue({ name: 'Buvette 4' }) },
      liveActivity: {
        upsert: jest.fn().mockResolvedValue({ id: 'la-1', orderId: ORDER_A, status: 'ACTIVE' }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    apns = { sendLiveActivityUpdate: jest.fn().mockResolvedValue(okSend()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveActivityService,
        { provide: PrismaService, useValue: prisma },
        { provide: ApnsService, useValue: apns },
      ],
    }).compile();

    service = module.get(LiveActivityService);
  });

  // ─── Isolation : le point le plus important ──────────────────

  describe('register — isolation entre clients et commandes', () => {
    it('refuse d’enregistrer une activité sur la commande d’un AUTRE client', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: ORDER_B,
        userId: USER_B,
        status: OrderStatus.PAID,
      });

      await expect(
        service.register({
          userId: USER_A, // ← usurpation
          orderId: ORDER_B,
          activityId: 'act-1',
          pushToken: 'aa'.repeat(20),
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.liveActivity.upsert).not.toHaveBeenCalled();
    });

    it('refuse une commande inexistante', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.register({ userId: USER_A, orderId: 'inconnu', activityId: 'a', pushToken: 'bb'.repeat(20) }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('enregistre pour le propriétaire, en clé (commande, activité)', async () => {
      await service.register({
        userId: USER_A,
        orderId: ORDER_A,
        activityId: 'act-1',
        pushToken: 'cc'.repeat(20),
      });

      expect(prisma.liveActivity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId_activityId: { orderId: ORDER_A, activityId: 'act-1' } },
        }),
      );
    });

    it('un second appel met à jour le token (rotation) au lieu de dupliquer', async () => {
      await service.register({
        userId: USER_A,
        orderId: ORDER_A,
        activityId: 'act-1',
        pushToken: 'dd'.repeat(20),
      });
      const call = prisma.liveActivity.upsert.mock.calls[0][0] as { update: { pushToken: string } };
      expect(call.update.pushToken).toBe('dd'.repeat(20));
    });
  });

  describe('unregister', () => {
    it('refuse de terminer l’activité d’un autre client', async () => {
      // findFirst filtre sur (activityId, userId) → rien pour cet utilisateur.
      prisma.liveActivity.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.unregister({ userId: USER_B, activityId: 'act-de-user-a' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── Diffusion ───────────────────────────────────────────────

  describe('pushOrderUpdate', () => {
    it('n’envoie rien quand la commande n’a aucune activité active', async () => {
      prisma.liveActivity.findMany.mockResolvedValueOnce([]);
      expect(await service.pushOrderUpdate(ORDER_A)).toBe(0);
      expect(apns.sendLiveActivityUpdate).not.toHaveBeenCalled();
    });

    it('envoie un update avec l’état construit (numéro, buvette, estimation)', async () => {
      prisma.liveActivity.findMany.mockResolvedValueOnce([
        { id: 'la-1', pushToken: 'tok-1', orderId: ORDER_A },
      ]);

      expect(await service.pushOrderUpdate(ORDER_A)).toBe(1);

      const [token, event, state] = apns.sendLiveActivityUpdate.mock.calls[0];
      expect(token).toBe('tok-1');
      expect(event).toBe('update');
      expect(state).toEqual(
        expect.objectContaining({
          status: 'PREPARING',
          statusLabel: 'En préparation',
          orderNumber: 'BE-1024',
          pickupPoint: 'Buvette 4',
          estimatedReadyAt: '2026-08-11T19:42:00.000Z',
        }),
      );
    });

    it('porte l’arrivée du client — c’est elle qui pilote le bouton du widget', async () => {
      prisma.liveActivity.findMany.mockResolvedValue([
        { id: 'la-1', pushToken: 'tok-1', orderId: ORDER_A },
      ]);

      // Personne au comptoir : le widget doit proposer « Je suis arrivé ».
      prisma.order.findUnique.mockResolvedValueOnce({
        publicOrderNumber: 'BE-1024',
        status: OrderStatus.READY,
        estimatedReadyAt: null,
        pickupPointId: 'pp-1',
        customerArrivedAt: null,
        slot: null,
      });
      await service.pushOrderUpdate(ORDER_A);
      expect(apns.sendLiveActivityUpdate.mock.calls[0][2]).toMatchObject({
        customerArrived: false,
      });

      // Présence annoncée : le bouton cède la place à la confirmation.
      prisma.order.findUnique.mockResolvedValueOnce({
        publicOrderNumber: 'BE-1024',
        status: OrderStatus.READY,
        estimatedReadyAt: null,
        pickupPointId: 'pp-1',
        customerArrivedAt: new Date('2026-08-27T18:10:00Z'),
        slot: null,
      });
      await service.pushOrderUpdate(ORDER_A);
      expect(apns.sendLiveActivityUpdate.mock.calls[1][2]).toMatchObject({
        customerArrived: true,
      });
    });

    it('diffuse à TOUTES les activités actives (plusieurs appareils)', async () => {
      prisma.liveActivity.findMany.mockResolvedValueOnce([
        { id: 'la-1', pushToken: 'tok-1', orderId: ORDER_A },
        { id: 'la-2', pushToken: 'tok-2', orderId: ORDER_A },
      ]);
      expect(await service.pushOrderUpdate(ORDER_A)).toBe(2);
    });

    it('sur commande récupérée : envoie un « end » et clôt l’activité', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        publicOrderNumber: 'BE-1024',
        status: OrderStatus.PICKED_UP,
        estimatedReadyAt: null,
        pickupPointId: 'pp-1',
        slot: null,
      });
      prisma.liveActivity.findMany.mockResolvedValueOnce([
        { id: 'la-1', pushToken: 'tok-1', orderId: ORDER_A },
      ]);

      await service.pushOrderUpdate(ORDER_A);

      const [, event, state] = apns.sendLiveActivityUpdate.mock.calls[0];
      expect(event).toBe('end');
      expect(state).toEqual(expect.objectContaining({ status: 'COLLECTED' }));
      expect(prisma.liveActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: LiveActivityStatus.ENDED }),
        }),
      );
    });

    it('marque STALE un token rejeté par APNs (410) au lieu de réessayer', async () => {
      prisma.liveActivity.findMany.mockResolvedValueOnce([
        { id: 'la-1', pushToken: 'mort', orderId: ORDER_A },
      ]);
      apns.sendLiveActivityUpdate.mockResolvedValueOnce({
        ok: false,
        status: 410,
        reason: 'Unregistered',
        tokenInvalid: true,
      });

      expect(await service.pushOrderUpdate(ORDER_A)).toBe(0);
      expect(prisma.liveActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: LiveActivityStatus.STALE }),
        }),
      );
    });

    it('une panne réseau ne marque PAS le token comme mort', async () => {
      prisma.liveActivity.findMany.mockResolvedValueOnce([
        { id: 'la-1', pushToken: 'tok-1', orderId: ORDER_A },
      ]);
      apns.sendLiveActivityUpdate.mockResolvedValueOnce({
        ok: false,
        status: 0,
        reason: 'ECONNRESET',
        tokenInvalid: false,
      });

      await service.pushOrderUpdate(ORDER_A);
      expect(prisma.liveActivity.update).not.toHaveBeenCalled();
    });
  });

  // ─── Source 1 : transitions Break Eat ────────────────────────

  describe('onOrderStatusChanged', () => {
    it('clôt les activités restantes quand la commande atteint un état final', async () => {
      prisma.liveActivity.findMany.mockResolvedValue([]);
      await service.onOrderStatusChanged(ORDER_A, OrderStatus.PICKED_UP);
      expect(prisma.liveActivity.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: ORDER_A, status: LiveActivityStatus.ACTIVE },
        }),
      );
    });

    it('n’explose jamais : une erreur interne reste absorbée', async () => {
      prisma.liveActivity.findMany.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        service.onOrderStatusChanged(ORDER_A, OrderStatus.PREPARING),
      ).resolves.toBeUndefined();
    });
  });

  describe('mapWidgetStatus', () => {
    it.each([
      [OrderStatus.PAID, 'CREATED'],
      [OrderStatus.ACCEPTED, 'CREATED'],
      [OrderStatus.PREPARING, 'PREPARING'],
      [OrderStatus.READY, 'READY'],
      [OrderStatus.PICKED_UP, 'COLLECTED'],
      [OrderStatus.COMPLETED, 'COLLECTED'],
      [OrderStatus.CANCELLED, 'CANCELLED'],
      [OrderStatus.RECOVERED, 'CANCELLED'],
    ])('%s → %s', (status, expected) => {
      expect(service.mapWidgetStatus(status)).toBe(expected);
    });
  });
});
