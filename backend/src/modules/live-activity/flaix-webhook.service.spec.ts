import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FlaixWebhookService, type FlaixWebhookPayload } from './flaix-webhook.service';
import { LiveActivityService } from './live-activity.service';

const SECRET = 'test-secret';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function sign(body: Buffer): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

function makePayload(over: Partial<FlaixWebhookPayload> = {}): FlaixWebhookPayload {
  return {
    eventId: 'evt-1',
    event: 'ORDER_STATUS_CHANGED',
    orderId: ORDER_ID,
    status: 'PREPARING',
    timestamp: new Date().toISOString(),
    ...over,
  };
}

describe('FlaixWebhookService', () => {
  let service: FlaixWebhookService;
  let prisma: {
    flaixWebhookEvent: { create: jest.Mock; update: jest.Mock };
    order: { findUnique: jest.Mock };
  };
  let liveActivity: { applyOperationalUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      flaixWebhookEvent: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      order: { findUnique: jest.fn().mockResolvedValue({ id: ORDER_ID }) },
    };
    liveActivity = { applyOperationalUpdate: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlaixWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(SECRET) } },
        { provide: LiveActivityService, useValue: liveActivity },
      ],
    }).compile();

    service = module.get(FlaixWebhookService);
  });

  // ─── Signature ───────────────────────────────────────────────

  describe('verifySignature', () => {
    it('accepte une signature valide du corps brut', () => {
      const body = Buffer.from(JSON.stringify(makePayload()));
      expect(() => service.verifySignature(body, sign(body))).not.toThrow();
    });

    it('accepte le préfixe sha256= (convention courante)', () => {
      const body = Buffer.from(JSON.stringify(makePayload()));
      expect(() => service.verifySignature(body, `sha256=${sign(body)}`)).not.toThrow();
    });

    it('rejette une signature absente', () => {
      const body = Buffer.from('{}');
      expect(() => service.verifySignature(body, undefined)).toThrow(UnauthorizedException);
    });

    it('rejette une signature qui ne correspond pas au corps (corps altéré)', () => {
      const original = Buffer.from(JSON.stringify(makePayload()));
      const signature = sign(original);
      const tampered = Buffer.from(JSON.stringify(makePayload({ orderId: 'autre' })));
      expect(() => service.verifySignature(tampered, signature)).toThrow(UnauthorizedException);
    });

    it('rejette une signature de longueur différente sans lever d’erreur technique', () => {
      const body = Buffer.from('{}');
      expect(() => service.verifySignature(body, 'trop-court')).toThrow(UnauthorizedException);
    });
  });

  // ─── Anti-rejeu / forme ──────────────────────────────────────

  describe('parsePayload', () => {
    it('rejette un JSON invalide', () => {
      expect(() => service.parsePayload(Buffer.from('pas du json'))).toThrow(BadRequestException);
    });

    it('exige eventId, event et orderId', () => {
      const body = Buffer.from(JSON.stringify({ event: 'ORDER_READY', timestamp: new Date().toISOString() }));
      expect(() => service.parsePayload(body)).toThrow(BadRequestException);
    });

    it('rejette un événement trop ancien (protection contre le rejeu)', () => {
      const old = makePayload({ timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
      expect(() => service.parsePayload(Buffer.from(JSON.stringify(old)))).toThrow(
        UnauthorizedException,
      );
    });

    it('accepte un événement récent', () => {
      const payload = makePayload();
      expect(service.parsePayload(Buffer.from(JSON.stringify(payload))).eventId).toBe('evt-1');
    });
  });

  // ─── Idempotence ─────────────────────────────────────────────

  describe('handle — idempotence', () => {
    it('traite un événement neuf et le marque traité', async () => {
      const res = await service.handle(makePayload());

      expect(res.duplicate).toBe(false);
      expect(liveActivity.applyOperationalUpdate).toHaveBeenCalledTimes(1);
      expect(prisma.flaixWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ processedAt: expect.any(Date) }) }),
      );
    });

    it('ignore un événement déjà reçu SANS re-déclencher de mise à jour', async () => {
      // P2002 = violation d'unicité sur event_id → doublon.
      prisma.flaixWebhookEvent.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const res = await service.handle(makePayload());

      expect(res.duplicate).toBe(true);
      // Le point critique : aucune seconde mise à jour de Live Activity.
      expect(liveActivity.applyOperationalUpdate).not.toHaveBeenCalled();
    });

    it('journalise l’erreur et laisse l’événement rejouable en cas d’échec', async () => {
      liveActivity.applyOperationalUpdate.mockRejectedValueOnce(new Error('APNs indisponible'));

      await expect(service.handle(makePayload())).rejects.toThrow('APNs indisponible');

      // Trace de l'échec, mais PAS de processedAt : l'événement reste à rejouer.
      expect(prisma.flaixWebhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { error: 'APNs indisponible' } }),
      );
    });

    it('refuse un événement visant une commande inconnue', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(service.handle(makePayload())).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Traduction des événements ───────────────────────────────

  describe('mapping des événements vers l’affichage', () => {
    const cases: Array<[FlaixWebhookPayload['event'], string]> = [
      ['ORDER_READY', 'READY'],
      ['ORDER_DELAYED', 'DELAYED'],
      ['ORDER_CANCELLED', 'CANCELLED'],
      ['ORDER_COLLECTED', 'COLLECTED'],
    ];

    it.each(cases)('%s → statut affiché %s', async (event, expected) => {
      await service.handle(makePayload({ event, eventId: `evt-${event}` }));
      expect(liveActivity.applyOperationalUpdate).toHaveBeenCalledWith(
        ORDER_ID,
        expect.any(Object),
        expected,
      );
    });

    it('un changement de créneau transmet le nouveau créneau', async () => {
      await service.handle(
        makePayload({ event: 'PICKUP_SLOT_CHANGED', eventId: 'evt-slot', slotId: 'slot-9', status: undefined }),
      );
      expect(liveActivity.applyOperationalUpdate).toHaveBeenCalledWith(
        ORDER_ID,
        expect.objectContaining({ slotId: 'slot-9' }),
        undefined,
      );
    });

    it('une nouvelle estimation est transmise telle quelle', async () => {
      const eta = '2026-08-11T19:46:00.000Z';
      await service.handle(makePayload({ eventId: 'evt-eta', estimatedReadyAt: eta }));
      expect(liveActivity.applyOperationalUpdate).toHaveBeenCalledWith(
        ORDER_ID,
        expect.objectContaining({ estimatedReadyAt: new Date(eta) }),
        'PREPARING',
      );
    });

    it('n’écrase PAS les champs absents de l’événement', async () => {
      await service.handle(makePayload({ eventId: 'evt-partial' }));
      const [, patch] = liveActivity.applyOperationalUpdate.mock.calls[0] as [string, object];
      // Ni estimation ni créneau fournis ⇒ aucune clé, donc rien n'est effacé.
      expect(patch).toEqual({});
    });
  });
});
