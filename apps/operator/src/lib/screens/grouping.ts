/**
 * Order grouping (Phase 11.4c).
 *
 * During a rush the same basket is ordered over and over (ten plain
 * "Burger + Frites"). Preparing those one card at a time wastes motion — the
 * prep team would rather batch identical baskets and cook them together.
 *
 * `groupSimilarOrders` clusters a column's orders by the exact composition of
 * their lines (same products, same quantities), preserving the incoming order
 * so the oldest basket's group still surfaces first (the snapshot is sorted
 * createdAt asc). Orders with a unique basket simply form a group of one, so a
 * grouped board is a strict *superset* of the flat board — nothing is hidden
 * and no order is merged: each stays an independent entity with its own
 * lifecycle.
 *
 * Grouping is intentionally a DISPLAY concern owned by Break. Flaix's
 * difficulty grouping (easy/medium/hard, Phase 11.5) is a separate, richer
 * axis layered on top later — this helper does not pre-empt it.
 */

import type { Order } from '@/lib/api/orders-client';

export interface GroupedLine {
  productId: string;
  productNameSnapshot: string;
  /** Quantity per single order (NOT multiplied by the group size). */
  quantity: number;
}

export interface OrderGroup {
  /** Stable identity of the basket composition (unique within a column). */
  signature: string;
  orders: Order[];
  /** The shared line-up, shown once for the whole group. */
  composition: GroupedLine[];
  size: number;
}

/**
 * Normalized signature for an order's basket: each product and its quantity,
 * sorted by productId so line ordering never affects identity.
 */
export function compositionSignature(order: Order): string {
  return order.items
    .map((it) => `${it.productId}:${it.quantity}`)
    .sort()
    .join('|');
}

/**
 * Clusters orders that share an identical basket. Groups appear in the order
 * their first member appears in the input (FIFO-preserving). Singletons are
 * returned as groups of size 1.
 */
export function groupSimilarOrders(orders: Order[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();

  for (const order of orders) {
    const signature = compositionSignature(order);
    const existing = groups.get(signature);
    if (existing) {
      existing.orders.push(order);
      existing.size += 1;
    } else {
      groups.set(signature, {
        signature,
        orders: [order],
        composition: order.items.map((it) => ({
          productId: it.productId,
          productNameSnapshot: it.productNameSnapshot,
          quantity: it.quantity,
        })),
        size: 1,
      });
    }
  }

  return [...groups.values()];
}
