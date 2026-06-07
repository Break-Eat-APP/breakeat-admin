/**
 * OrdersApiClient — REST wrapper for the operator dashboard.
 *
 * Reads NEXT_PUBLIC_API_URL from the environment.
 * All calls include Authorization: Bearer <token>.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface OrderItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  lineTotalCents: number;
  /** Phase 11.4 — resolved server-side so screens can filter by category. */
  categoryId?: string | null;
  /** Phase 11.4 — readable category label for the Récap produits panel. */
  categoryName?: string | null;
}

export interface Order {
  id: string;
  publicOrderNumber: string;
  status: string;
  supplierId: string;
  pickupPointId: string;
  eventId: string;
  organizationId: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  slotId?: string | null;
  /** Phase 11.4 — slot kind flattened server-side (IMMEDIATE when no slot). */
  slotKind?: SlotKind;
  /** Phase 11.4 — customer display name (for pickup callouts + name search). */
  customerName?: string | null;
  items: OrderItem[];
}

export interface DashboardData {
  eventId: string;
  counts: Record<string, number>;
  orders: Record<string, Order[]>;
}

// ─── Operator screens (Phase 11.4) ─────────────────────────────────────────────

export type OperatorScreenKind = 'ORDERS_QUEUE' | 'READY' | 'RECOVERED' | 'GENERAL';
export type SlotKind = 'IMMEDIATE' | 'PAUSE_1' | 'PAUSE_2' | 'GENERAL' | 'CUSTOM';

export interface ScreenFilters {
  categoryIds?: string[];
  excludeCategoryIds?: string[];
  productIds?: string[];
  excludeProductIds?: string[];
  showRecap?: boolean;
}

/**
 * A fully-resolved operator screen for one event, as returned by
 * GET /events/:eventId/operator-screens/resolved.
 * Defaults (statuses, sortOrder, enabled) are already merged server-side.
 */
export interface ResolvedOperatorScreen {
  eventScreenId: string;
  templateId: string;
  name: string;
  kind: OperatorScreenKind;
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
  slotKinds: SlotKind[];
  statuses: string[];
  supplierIds: string[];
  filters: ScreenFilters;
}

export interface ResolvedScreensResponse {
  eventId: string;
  supplierId: string | null;
  screens: ResolvedOperatorScreen[];
}

// ─── Me + memberships ─────────────────────────────────────────────────────────

export interface OperatorMembership {
  id: string;
  organizationId: string;
  orgRole: string;
  supplierId: string | null;
  organization: { id: string; name: string; slug: string; status: string };
  supplier: { id: string; name: string; status: string } | null;
}

export interface MeWithMemberships {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  memberships: OperatorMembership[];
}

export async function fetchMeWithMemberships(token: string): Promise<MeWithMemberships> {
  return apiFetch<MeWithMemberships>('/auth/me/memberships', token);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * Fetches the operator dashboard snapshot.
 * Phase 12.9: pass supplierId to filter orders to a specific supplier.
 */
export async function fetchDashboard(
  eventId: string,
  token: string,
  supplierId?: string | null,
): Promise<DashboardData> {
  const qs = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : '';
  return apiFetch<DashboardData>(`/orders/event/${eventId}/dashboard${qs}`, token);
}

/**
 * Fetches the configurable operator screens resolved for this event.
 * When the operator's membership is pinned to a supplier the backend ignores
 * the supplierId param and scopes to the pinned supplier automatically.
 */
export async function fetchResolvedScreens(
  eventId: string,
  token: string,
  supplierId?: string | null,
): Promise<ResolvedScreensResponse> {
  const qs = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : '';
  return apiFetch<ResolvedScreensResponse>(
    `/events/${eventId}/operator-screens/resolved${qs}`,
    token,
  );
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export async function acceptOrder(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/accept`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function startPreparingOrder(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/start-preparing`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function markOrderReady(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/mark-ready`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function markOrderPickedUp(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/mark-picked-up`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function recoverOrder(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/recover`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export async function cancelOrder(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/cancel`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error('Identifiants incorrects');
  }
  return res.json() as Promise<LoginResponse>;
}
