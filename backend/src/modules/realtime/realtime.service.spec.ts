import { Test, TestingModule } from '@nestjs/testing';
import {
  RealtimeService,
  NewOrderPayload,
  OrderUpdatedPayload,
  OrderReadyPayload,
  CustomerArrivedPayload,
} from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Mock server with a chainable to() ───────────────────────────

function makeServerMock() {
  const emitSpy = jest.fn();
  const toSpy = jest.fn().mockReturnValue({ emit: emitSpy, to: jest.fn().mockReturnValue({ emit: emitSpy }) });
  return { to: toSpy, emit: emitSpy, _toSpy: toSpy, _emitSpy: emitSpy };
}

const ORDER_ID = 'order-1';
const ORG_ID = 'org-1';
const EVENT_ID = 'event-1';
const SUPPLIER_ID = 'supplier-1';
const PICKUP_ID = 'pp-1';
const VENUE_ID = 'venue-1';

function makeNewOrderPayload(): NewOrderPayload {
  return {
    orderId: ORDER_ID,
    publicOrderNumber: 'BE-00000001',
    organizationId: ORG_ID,
    venueId: VENUE_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_ID,
  };
}

function makeOrderUpdatedPayload(): OrderUpdatedPayload {
  return {
    orderId: ORDER_ID,
    organizationId: ORG_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    previousStatus: 'PAID',
    nextStatus: 'ACCEPTED',
    actorType: 'OPERATOR',
    reason: null,
  };
}

function makeOrderReadyPayload(): OrderReadyPayload {
  return {
    orderId: ORDER_ID,
    publicOrderNumber: 'BE-00000001',
    organizationId: ORG_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_ID,
  };
}

const ARRIVED_AT = '2026-08-12T18:30:00.000Z';

function makeCustomerArrivedPayload(): CustomerArrivedPayload {
  return {
    orderId: ORDER_ID,
    publicOrderNumber: 'BE-00000001',
    organizationId: ORG_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_ID,
    arrivedAt: ARRIVED_AT,
  };
}

/**
 * L'emission DEPOSE d'abord la ligne dans l'outbox, puis emet — c'est ce
 * qui fait qu'un evenement rate se rejoue au lieu de disparaitre. Elle
 * part donc au tour de boucle suivant, et chaque test doit le laisser
 * passer AVANT de lire le mock : sinon il observe un serveur qui n'a
 * encore rien recu.
 */
const vider = () => new Promise((r) => setImmediate(r));

describe('RealtimeService', () => {
  let service: RealtimeService;
  let serverMock: ReturnType<typeof makeServerMock>;

  beforeEach(async () => {
    serverMock = makeServerMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        {
          provide: RealtimeGateway,
          useValue: { server: serverMock },
        },
        // L'outbox est doublee : ce fichier juge le CIBLAGE et l'enveloppe.
        // Ce qu'elle garantit se teste dans `outbox.service.spec.ts`.
        {
          provide: OutboxService,
          useValue: {
            deposer: jest.fn().mockResolvedValue(undefined),
            marquerLivre: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get(RealtimeService);
  });

  // ─── emitNewOrder ─────────────────────────────────────────────

  describe('emitNewOrder', () => {
    it('emits to organization, event, and supplier rooms', async () => {
      service.emitNewOrder(makeNewOrderPayload());
      await vider();

      const rooms = serverMock._toSpy.mock.calls.map(([r]: [string]) => r);
      expect(rooms).toContain(`organization:${ORG_ID}`);
      expect(rooms).toContain(`event:${EVENT_ID}`);
      expect(rooms).toContain(`supplier:${SUPPLIER_ID}`);
    });

    it('envelope has eventName, eventId (UUID), occurredAt, and all order fields', async () => {
      service.emitNewOrder(makeNewOrderPayload());
      await vider();

      const [, emittedEvent, envelope] = serverMock._toSpy.mock.results[0]
        ? (serverMock._emitSpy.mock.calls[0] as [string, string, unknown])
        : ['', '', {}];
      const firstEmit = serverMock._emitSpy.mock.calls[0] as [string, Record<string, unknown>];
      const [evtName, payload] = firstEmit;

      expect(evtName).toBe('new_order');
      expect(payload.eventName).toBe('new_order');
      expect(typeof payload.eventId).toBe('string');
      expect((payload.eventId as string).length).toBe(36); // UUID
      expect(typeof payload.occurredAt).toBe('string');
      expect(payload.orderId).toBe(ORDER_ID);
      expect(payload.supplierIds).toEqual([SUPPLIER_ID]);
      void emittedEvent; void envelope;
    });

    it('generates a unique eventId per call (idempotency key for clients)', async () => {
      service.emitNewOrder(makeNewOrderPayload());
      service.emitNewOrder(makeNewOrderPayload());
      await vider();

      const firstId = (serverMock._emitSpy.mock.calls[0] as [string, Record<string, unknown>])[1].eventId;
      // Each call emits 3 rooms; events[3] belongs to the second emitNewOrder call
      const secondId = (serverMock._emitSpy.mock.calls[3] as [string, Record<string, unknown>])[1].eventId;
      expect(firstId).not.toBe(secondId);
    });
  });

  // ─── emitOrderUpdated ─────────────────────────────────────────

  describe('emitOrderUpdated', () => {
    it('emits to order, organization, and event rooms', async () => {
      service.emitOrderUpdated(makeOrderUpdatedPayload());
      await vider();

      const rooms = serverMock._toSpy.mock.calls.map(([r]: [string]) => r);
      expect(rooms).toContain(`order:${ORDER_ID}`);
      expect(rooms).toContain(`organization:${ORG_ID}`);
      expect(rooms).toContain(`event:${EVENT_ID}`);
    });

    it('envelope includes previousStatus, nextStatus, actorType, reason', async () => {
      service.emitOrderUpdated(makeOrderUpdatedPayload());
      await vider();

      const [, payload] = serverMock._emitSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload.eventName).toBe('order_updated');
      expect(payload.previousStatus).toBe('PAID');
      expect(payload.nextStatus).toBe('ACCEPTED');
      expect(payload.actorType).toBe('OPERATOR');
      expect(payload.reason).toBeNull();
    });
  });

  // ─── emitOrderReady ───────────────────────────────────────────

  describe('emitOrderReady', () => {
    it('emits to order, pickup-point, organization, and event rooms', async () => {
      service.emitOrderReady(makeOrderReadyPayload());
      await vider();

      const rooms = serverMock._toSpy.mock.calls.map(([r]: [string]) => r);
      expect(rooms).toContain(`order:${ORDER_ID}`);
      expect(rooms).toContain(`pickup-point:${PICKUP_ID}`);
      expect(rooms).toContain(`organization:${ORG_ID}`);
      expect(rooms).toContain(`event:${EVENT_ID}`);
    });

    it('envelope has eventName=order_ready and pickupPointId', async () => {
      service.emitOrderReady(makeOrderReadyPayload());
      await vider();

      const [, payload] = serverMock._emitSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload.eventName).toBe('order_ready');
      expect(payload.pickupPointId).toBe(PICKUP_ID);
      expect(payload.publicOrderNumber).toBe('BE-00000001');
    });
  });

  // ─── emitCustomerArrived (phase 19) ───────────────────────────
  //
  // Événement DISTINCT d'`order_updated`, volontairement : le board opérateur
  // applique une mise à jour optimiste sur `nextStatus` en recevant
  // `order_updated`. Réutiliser ce canal pour une simple présence ferait donc
  // sauter la carte d'une colonne à l'autre alors que le statut n'a pas bougé.

  describe('emitCustomerArrived', () => {
    it('émet vers les rooms organisation, événement et point de vente', async () => {
      service.emitCustomerArrived(makeCustomerArrivedPayload());
      await vider();

      const rooms = serverMock._toSpy.mock.calls.map(([r]: [string]) => r);
      expect(rooms).toContain(`organization:${ORG_ID}`);
      expect(rooms).toContain(`event:${EVENT_ID}`);
      expect(rooms).toContain(`supplier:${SUPPLIER_ID}`);
    });

    it('n’émet PAS vers la room de la commande — le client n’a rien à apprendre', async () => {
      service.emitCustomerArrived(makeCustomerArrivedPayload());
      await vider();

      const rooms = serverMock._toSpy.mock.calls.map(([r]: [string]) => r);
      expect(rooms).not.toContain(`order:${ORDER_ID}`);
    });

    it('enveloppe : eventName=customer_arrived, eventId UUID, horodatage d’arrivée', async () => {
      service.emitCustomerArrived(makeCustomerArrivedPayload());
      await vider();

      const [evtName, payload] = serverMock._emitSpy.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(evtName).toBe('customer_arrived');
      expect(payload.eventName).toBe('customer_arrived');
      expect((payload.eventId as string).length).toBe(36);
      expect(typeof payload.occurredAt).toBe('string');
      expect(payload.orderId).toBe(ORDER_ID);
      expect(payload.publicOrderNumber).toBe('BE-00000001');
      expect(payload.pickupPointId).toBe(PICKUP_ID);
      expect(payload.arrivedAt).toBe(ARRIVED_AT);
    });

    it('ne porte aucun statut : la présence ne pilote pas le cycle de vie', async () => {
      service.emitCustomerArrived(makeCustomerArrivedPayload());
      await vider();

      const [, payload] = serverMock._emitSpy.mock.calls[0] as [string, Record<string, unknown>];
      expect(payload).not.toHaveProperty('nextStatus');
      expect(payload).not.toHaveProperty('previousStatus');
      expect(payload).not.toHaveProperty('status');
    });

    it('génère un eventId par appel — clé d’idempotence côté client', async () => {
      service.emitCustomerArrived(makeCustomerArrivedPayload());
      service.emitCustomerArrived(makeCustomerArrivedPayload());
      await vider();

      const calls = serverMock._emitSpy.mock.calls as [string, Record<string, unknown>][];
      // 3 rooms par appel : on compare la 1re émission de chaque appel.
      expect(calls[0][1].eventId).not.toBe(calls[3][1].eventId);
    });
  });
});
