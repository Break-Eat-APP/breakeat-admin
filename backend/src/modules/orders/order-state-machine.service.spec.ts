import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { ALLOWED_TRANSITIONS, OrderStateMachineService } from './order-state-machine.service';

describe('OrderStateMachineService', () => {
  let service: OrderStateMachineService;

  beforeEach(() => {
    service = new OrderStateMachineService();
  });

  // ─── ALLOWED_TRANSITIONS map structure ───────────────────────

  describe('ALLOWED_TRANSITIONS map', () => {
    it('covers exactly 17 transitions in total', () => {
      const count = Object.values(ALLOWED_TRANSITIONS).reduce(
        (sum, arr) => sum + (arr?.length ?? 0),
        0,
      );
      expect(count).toBe(17);
    });

    it('PAID has 4 outgoing transitions', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.PAID]).toHaveLength(4);
    });

    it('ACCEPTED has 4 outgoing transitions', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED]).toHaveLength(4);
    });

    // Le board opérateur n'a que trois colonnes : ces deux raccourcis SONT le
    // parcours normal. Les casser rendrait le bouton « En préparation »
    // inopérant sur une commande neuve — sans autre signe qu'un refus 400.
    it('PAID → PREPARING : « En préparation » depuis une commande neuve', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.PAID]).toContain(OrderStatus.PREPARING);
    });

    it('ACCEPTED → READY : une commande acceptée peut être marquée prête', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED]).toContain(OrderStatus.READY);
    });

    it('PREPARING has 3 outgoing transitions', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.PREPARING]).toHaveLength(3);
    });

    it('READY has 2 outgoing transitions', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.READY]).toHaveLength(2);
    });

    it('PICKED_UP has 1 outgoing transition', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.PICKED_UP]).toHaveLength(1);
    });

    it('RECOVERED has 3 outgoing transitions', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.RECOVERED]).toHaveLength(3);
    });

    it('COMPLETED is a terminal state (no outgoing transitions)', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.COMPLETED]).toBeUndefined();
    });

    it('CANCELLED is a terminal state (no outgoing transitions)', () => {
      expect(ALLOWED_TRANSITIONS[OrderStatus.CANCELLED]).toBeUndefined();
    });
  });

  // ─── assertTransition — all 15 unique valid paths ────────────

  describe('assertTransition — valid paths (no throw)', () => {
    const validTransitions: [OrderStatus, OrderStatus][] = [
      // Normal flow
      [OrderStatus.PAID, OrderStatus.ACCEPTED],
      [OrderStatus.ACCEPTED, OrderStatus.PREPARING],
      [OrderStatus.PREPARING, OrderStatus.READY],
      [OrderStatus.READY, OrderStatus.PICKED_UP],
      [OrderStatus.PICKED_UP, OrderStatus.COMPLETED],
      // Cancellations
      [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      // Recovery entry
      [OrderStatus.PAID, OrderStatus.RECOVERED],
      [OrderStatus.ACCEPTED, OrderStatus.RECOVERED],
      [OrderStatus.PREPARING, OrderStatus.RECOVERED],
      [OrderStatus.READY, OrderStatus.RECOVERED],
      // Recovery exit (re-enter flow at any non-terminal point)
      [OrderStatus.RECOVERED, OrderStatus.ACCEPTED],
      [OrderStatus.RECOVERED, OrderStatus.PREPARING],
      [OrderStatus.RECOVERED, OrderStatus.READY],
    ];

    test.each(validTransitions)('%s → %s is allowed', (from, to) => {
      expect(() => service.assertTransition(from, to)).not.toThrow();
    });
  });

  // ─── assertTransition — illegal paths throw BadRequestException

  describe('assertTransition — invalid paths (throw BadRequestException)', () => {
    const invalidTransitions: [OrderStatus, OrderStatus][] = [
      // Terminal states have no outgoing transitions
      [OrderStatus.COMPLETED, OrderStatus.PAID],
      [OrderStatus.COMPLETED, OrderStatus.ACCEPTED],
      [OrderStatus.COMPLETED, OrderStatus.PREPARING],
      [OrderStatus.CANCELLED, OrderStatus.ACCEPTED],
      [OrderStatus.CANCELLED, OrderStatus.PAID],
      // Sauts INTERDITS. PAID → PREPARING et ACCEPTED → READY n'y sont plus :
      // le board a trois colonnes, ces deux-la sont le parcours normal.
      [OrderStatus.PAID, OrderStatus.READY],
      [OrderStatus.PAID, OrderStatus.COMPLETED],
      [OrderStatus.PREPARING, OrderStatus.PICKED_UP],
      // READY cannot be cancelled (missed that window)
      [OrderStatus.READY, OrderStatus.CANCELLED],
      // Going backwards without recovery
      [OrderStatus.PICKED_UP, OrderStatus.PAID],
      [OrderStatus.PREPARING, OrderStatus.ACCEPTED],
    ];

    test.each(invalidTransitions)('%s → %s throws BadRequestException', (from, to) => {
      expect(() => service.assertTransition(from, to)).toThrow(BadRequestException);
    });

    it('includes both states in the error message', () => {
      try {
        service.assertTransition(OrderStatus.COMPLETED, OrderStatus.PAID);
        fail('Expected BadRequestException');
      } catch (e) {
        expect((e as BadRequestException).message).toMatch(/COMPLETED/);
        expect((e as BadRequestException).message).toMatch(/PAID/);
      }
    });
  });

  // ─── isAllowed ────────────────────────────────────────────────

  describe('isAllowed', () => {
    it('returns true for valid transitions', () => {
      expect(service.isAllowed(OrderStatus.PAID, OrderStatus.ACCEPTED)).toBe(true);
      expect(service.isAllowed(OrderStatus.READY, OrderStatus.PICKED_UP)).toBe(true);
      expect(service.isAllowed(OrderStatus.PICKED_UP, OrderStatus.COMPLETED)).toBe(true);
      expect(service.isAllowed(OrderStatus.PREPARING, OrderStatus.RECOVERED)).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(service.isAllowed(OrderStatus.COMPLETED, OrderStatus.PAID)).toBe(false);
      expect(service.isAllowed(OrderStatus.CANCELLED, OrderStatus.ACCEPTED)).toBe(false);
      expect(service.isAllowed(OrderStatus.PAID, OrderStatus.COMPLETED)).toBe(false);
      expect(service.isAllowed(OrderStatus.READY, OrderStatus.CANCELLED)).toBe(false);
    });
  });

  // ─── allowedFrom ──────────────────────────────────────────────

  describe('allowedFrom', () => {
    it('returns all 4 allowed states from PAID', () => {
      const allowed = service.allowedFrom(OrderStatus.PAID);
      expect(allowed).toHaveLength(4);
      expect(allowed).toContain(OrderStatus.PREPARING);
      expect(allowed).toContain(OrderStatus.ACCEPTED);
      expect(allowed).toContain(OrderStatus.CANCELLED);
      expect(allowed).toContain(OrderStatus.RECOVERED);
    });

    it('returns all 3 allowed states from RECOVERED', () => {
      const allowed = service.allowedFrom(OrderStatus.RECOVERED);
      expect(allowed).toHaveLength(3);
      expect(allowed).toContain(OrderStatus.ACCEPTED);
      expect(allowed).toContain(OrderStatus.PREPARING);
      expect(allowed).toContain(OrderStatus.READY);
    });

    it('returns [COMPLETED] from PICKED_UP', () => {
      expect(service.allowedFrom(OrderStatus.PICKED_UP)).toEqual([OrderStatus.COMPLETED]);
    });

    it('returns empty array for terminal state COMPLETED', () => {
      expect(service.allowedFrom(OrderStatus.COMPLETED)).toEqual([]);
    });

    it('returns empty array for terminal state CANCELLED', () => {
      expect(service.allowedFrom(OrderStatus.CANCELLED)).toEqual([]);
    });
  });
});
