import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

/**
 * OrderStateMachineService — pure transition guard.
 *
 * Source of truth: /brain/ORDER_STATE_MACHINE.md
 *
 * Allowed transitions (15 total):
 *   PAID        → ACCEPTED | CANCELLED | RECOVERED
 *   ACCEPTED    → PREPARING | CANCELLED | RECOVERED
 *   PREPARING   → READY | CANCELLED | RECOVERED
 *   READY       → PICKED_UP | RECOVERED
 *   PICKED_UP   → COMPLETED
 *   RECOVERED   → ACCEPTED | PREPARING | READY
 *
 * Terminal states (no outgoing transitions):
 *   COMPLETED, CANCELLED
 */

type TransitionMap = Partial<Record<OrderStatus, OrderStatus[]>>;

export const ALLOWED_TRANSITIONS: TransitionMap = {
  [OrderStatus.PAID]: [
    OrderStatus.ACCEPTED,
    OrderStatus.CANCELLED,
    OrderStatus.RECOVERED,
  ],
  [OrderStatus.ACCEPTED]: [
    OrderStatus.PREPARING,
    OrderStatus.CANCELLED,
    OrderStatus.RECOVERED,
  ],
  [OrderStatus.PREPARING]: [
    OrderStatus.READY,
    OrderStatus.CANCELLED,
    OrderStatus.RECOVERED,
  ],
  [OrderStatus.READY]: [OrderStatus.PICKED_UP, OrderStatus.RECOVERED],
  [OrderStatus.PICKED_UP]: [OrderStatus.COMPLETED],
  [OrderStatus.RECOVERED]: [
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
  ],
};

@Injectable()
export class OrderStateMachineService {
  /**
   * Throws BadRequestException if the transition is not allowed.
   * Call this before any DB write.
   */
  assertTransition(from: OrderStatus, to: OrderStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Order transition ${from} → ${to} is not allowed. Allowed from ${from}: [${allowed.join(', ') || 'none'}]`,
      );
    }
  }

  isAllowed(from: OrderStatus, to: OrderStatus): boolean {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
  }

  allowedFrom(status: OrderStatus): OrderStatus[] {
    return ALLOWED_TRANSITIONS[status] ?? [];
  }
}
