/**
 * Screen filtering (Phase 11.4).
 *
 * The operator board fetches every live order once (grouped by status) and then
 * renders one tab per configured operator screen. These pure helpers decide
 * which orders belong on a given screen, so they can be unit-tested in isolation
 * and reused by both the tab badges and the column rendering.
 *
 * A screen narrows the order stream on three independent axes:
 *   1. status     — only orders whose DB status is in `screen.statuses`
 *   2. slot kind  — only orders whose slot kind is in `screen.slotKinds`
 *                   (empty `slotKinds` = no slot constraint → all kinds pass)
 *   3. filters    — category / product include + exclude lists
 *                   (no filters = every item passes → order passes)
 */

import type {
  Order,
  OrderItem,
  ResolvedOperatorScreen,
  ScreenFilters,
  SlotKind,
} from '@/lib/api/orders-client';

/** True when an item passes the screen's category/product include+exclude lists. */
export function itemMatchesFilters(item: OrderItem, filters: ScreenFilters): boolean {
  const categoryId = item.categoryId ?? null;

  if (filters.categoryIds?.length) {
    if (!categoryId || !filters.categoryIds.includes(categoryId)) return false;
  }
  if (filters.excludeCategoryIds?.length && categoryId) {
    if (filters.excludeCategoryIds.includes(categoryId)) return false;
  }
  if (filters.productIds?.length) {
    if (!filters.productIds.includes(item.productId)) return false;
  }
  if (filters.excludeProductIds?.length) {
    if (filters.excludeProductIds.includes(item.productId)) return false;
  }
  return true;
}

/** True when `filters` carries at least one include/exclude constraint. */
export function hasActiveFilters(filters: ScreenFilters | undefined | null): boolean {
  if (!filters) return false;
  return Boolean(
    filters.categoryIds?.length ||
      filters.excludeCategoryIds?.length ||
      filters.productIds?.length ||
      filters.excludeProductIds?.length,
  );
}

/**
 * True when an order belongs on the screen.
 * Status is NOT checked here — the caller already iterates the screen's
 * statuses against the dashboard groups. This gates on slot kind + filters.
 */
export function orderMatchesScreen(order: Order, screen: ResolvedOperatorScreen): boolean {
  // Slot-kind gate (empty list = every slot kind allowed).
  if (screen.slotKinds.length > 0) {
    const kind: SlotKind = order.slotKind ?? 'IMMEDIATE';
    if (!screen.slotKinds.includes(kind)) return false;
  }

  // Filter gate: the order needs ≥1 item passing the include/exclude filters.
  const filters = screen.filters ?? {};
  if (!hasActiveFilters(filters)) return true;
  return order.items.some((item) => itemMatchesFilters(item, filters));
}

/**
 * Builds the per-status order groups for one screen from the dashboard snapshot.
 * The result is keyed by the screen's `statuses` (in declared order), so the UI
 * can render a mini-Kanban scoped to that screen. Statuses the dashboard does
 * not provide simply yield an empty column.
 */
export function buildScreenColumns(
  dashboard: Record<string, Order[]>,
  screen: ResolvedOperatorScreen,
): Array<{ status: string; orders: Order[] }> {
  return screen.statuses.map((status) => ({
    status,
    orders: (dashboard[status] ?? []).filter((order) => orderMatchesScreen(order, screen)),
  }));
}

/** Total live orders on a screen across all its statuses (for the tab badge). */
export function countScreenOrders(
  dashboard: Record<string, Order[]>,
  screen: ResolvedOperatorScreen,
): number {
  return screen.statuses.reduce(
    (sum, status) =>
      sum + (dashboard[status] ?? []).filter((o) => orderMatchesScreen(o, screen)).length,
    0,
  );
}
