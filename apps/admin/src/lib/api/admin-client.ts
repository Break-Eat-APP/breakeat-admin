/**
 * admin-client.ts — centralised API client for the BREAK EAT admin panel.
 *
 * All requests are authenticated via Bearer token stored in localStorage.
 * A 401 response auto-redirects to /login and clears stored credentials.
 *
 * localStorage keys:
 *   admin_token   — JWT access token
 *   admin_user    — JSON-serialised AdminUser (id, email, displayName, globalRole)
 *   admin_org_id  — UUID of the current working organisation
 *   admin_org_name — Display name of the current working organisation
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_token') ?? '';
}

export function getOrgId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_org_id') ?? '';
}

export function getOrgName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_org_name') ?? '';
}

export function getStoredUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('admin_user');
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  localStorage.removeItem('admin_org_id');
  localStorage.removeItem('admin_org_name');
}

// ─── Base fetch ────────────────────────────────────────────────────────────────

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  noAuth = false,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!noAuth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expirée — veuillez vous reconnecter');
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data['message'] as string | undefined) ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  organizationId: string;
  orgRole: string;
  organization: { id: string; name: string; slug: string; status: string };
}

export interface MeWithMemberships extends AdminUser {
  memberships: Membership[];
}

export interface AuthResponse {
  user: AdminUser;
  accessToken: string;
  refreshToken: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  members?: OrgMember[];
}

export interface OrgMember {
  id: string;
  userId: string;
  organizationId: string;
  orgRole: string;
  supplierId: string | null;
  createdAt: string;
}

/** Member row enriched with user + supplier details (from GET /members or POST /invite) */
export interface OrgMemberWithUser extends OrgMember {
  user: {
    id: string;
    email: string;
    displayName: string;
    globalRole: string;
  };
  supplier: {
    id: string;
    name: string;
    status: string;
  } | null;
}

export type EventVisibility = 'PUBLIC' | 'PRIVATE';

export interface AdminEvent {
  id: string;
  name: string;
  slug?: string;
  startAt: string;
  endAt: string;
  status: string;
  organizationId: string;
  venueId: string;
  description?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  // Phase 14.7 — access & visibility
  visibility?: EventVisibility;
  /** Present on single-event reads (GET /events/:id): groups granted access. */
  groups?: { groupId: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  slug?: string;
  status: string;
  preparationZone?: string | null;
  organizationId: string;
  createdAt: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  scope: 'GLOBAL' | 'ORGANIZATION' | 'EVENT';
  scopeId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSetting {
  id: string;
  key: string;
  value: unknown;
  scope: 'GLOBAL' | 'ORGANIZATION' | 'EVENT';
  scopeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulatorStats {
  eventId: string;
  stats: Record<string, number>;
  total: number;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return req<AuthResponse>('POST', '/auth/login', { email, password }, true);
}

export async function apiMeWithMemberships(): Promise<MeWithMemberships> {
  return req<MeWithMemberships>('GET', '/auth/me/memberships');
}

// ─── Organizations ─────────────────────────────────────────────────────────────

export async function apiGetOrganization(id: string): Promise<Organization> {
  return req<Organization>('GET', `/organizations/${id}`);
}

export async function apiCreateOrganization(data: {
  name: string;
  slug: string;
}): Promise<Organization> {
  return req<Organization>('POST', '/organizations', data);
}

export async function apiAddMember(
  orgId: string,
  data: { userId: string; role: string },
): Promise<OrgMember> {
  return req<OrgMember>('POST', `/organizations/${orgId}/members`, data);
}

/** PATCH /organizations/:id/branding — update logo, color, description */
export async function apiUpdateOrgBranding(
  orgId: string,
  data: { logoUrl?: string; primaryColor?: string; description?: string },
): Promise<Organization> {
  return req<Organization>('PATCH', `/organizations/${orgId}/branding`, data);
}

/** PATCH /organizations/:orgId/events/:id — update event fields (name, dates, branding, access) */
export async function apiUpdateEvent(
  orgId: string,
  eventId: string,
  data: {
    name?: string;
    startAt?: string;
    endAt?: string;
    description?: string;
    logoUrl?: string;
    primaryColor?: string;
    // Phase 14.7 — access & visibility. groupIds REPLACES the event's group
    // set when provided (send [] to clear); omit to leave links unchanged.
    visibility?: EventVisibility;
    groupIds?: string[];
  },
): Promise<AdminEvent> {
  return req<AdminEvent>('PATCH', `/organizations/${orgId}/events/${eventId}`, data);
}

/** GET /organizations/:id/members — enriched with user + supplier info */
export async function apiGetOrgMembers(orgId: string): Promise<OrgMemberWithUser[]> {
  return req<OrgMemberWithUser[]>('GET', `/organizations/${orgId}/members`);
}

/** POST /organizations/:id/invite — invite by email, optionally assign to supplier */
export async function apiInviteMember(
  orgId: string,
  data: { email: string; role: string; supplierId?: string },
): Promise<OrgMemberWithUser> {
  return req<OrgMemberWithUser>('POST', `/organizations/${orgId}/invite`, data);
}

/** DELETE /organizations/:id/members/:memberId */
export async function apiRemoveMember(orgId: string, memberId: string): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/members/${memberId}`);
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function apiGetEvents(orgId: string): Promise<AdminEvent[]> {
  return req<AdminEvent[]>('GET', `/organizations/${orgId}/events`);
}

export async function apiGetEvent(orgId: string, id: string): Promise<AdminEvent> {
  return req<AdminEvent>('GET', `/organizations/${orgId}/events/${id}`);
}

export async function apiCreateEvent(
  orgId: string,
  data: { venueId: string; name: string; startAt: string; endAt: string },
): Promise<AdminEvent> {
  return req<AdminEvent>('POST', `/organizations/${orgId}/events`, data);
}

export async function apiUpdateEventStatus(
  orgId: string,
  id: string,
  status: string,
): Promise<AdminEvent> {
  return req<AdminEvent>('PATCH', `/organizations/${orgId}/events/${id}/status`, { status });
}

export async function apiAttachSupplier(
  orgId: string,
  eventId: string,
  supplierId: string,
): Promise<void> {
  return req<void>('POST', `/organizations/${orgId}/events/${eventId}/suppliers`, { supplierId });
}

export async function apiDetachSupplier(
  orgId: string,
  eventId: string,
  supplierId: string,
): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/events/${eventId}/suppliers/${supplierId}`);
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export async function apiGetSuppliers(orgId: string): Promise<Supplier[]> {
  return req<Supplier[]>('GET', `/organizations/${orgId}/suppliers`);
}

export async function apiCreateSupplier(
  orgId: string,
  data: { name: string; preparationZone?: string },
): Promise<Supplier> {
  return req<Supplier>('POST', `/organizations/${orgId}/suppliers`, data);
}

// ─── Groups (Phase 14.7) ────────────────────────────────────────────────────────

export type GroupMemberSource = 'MANUAL' | 'DOMAIN';

export interface Group {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  /** Lowercased domain (no leading @) that auto-joins matching users, or null. */
  emailDomain?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { members: number; events: number };
}

export interface GroupMember {
  groupId: string;
  userId: string;
  source: GroupMemberSource;
  createdAt: string;
  user: { id: string; email: string; displayName: string };
}

export async function apiGetGroups(orgId: string): Promise<Group[]> {
  return req<Group[]>('GET', `/organizations/${orgId}/groups`);
}

export async function apiGetGroup(orgId: string, groupId: string): Promise<Group> {
  return req<Group>('GET', `/organizations/${orgId}/groups/${groupId}`);
}

export async function apiCreateGroup(
  orgId: string,
  data: { name: string; description?: string; emailDomain?: string },
): Promise<Group> {
  return req<Group>('POST', `/organizations/${orgId}/groups`, data);
}

export async function apiUpdateGroup(
  orgId: string,
  groupId: string,
  data: { name?: string; description?: string; emailDomain?: string },
): Promise<Group> {
  return req<Group>('PATCH', `/organizations/${orgId}/groups/${groupId}`, data);
}

export async function apiDeleteGroup(orgId: string, groupId: string): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/groups/${groupId}`);
}

export async function apiGetGroupMembers(
  orgId: string,
  groupId: string,
): Promise<GroupMember[]> {
  return req<GroupMember[]>('GET', `/organizations/${orgId}/groups/${groupId}/members`);
}

export async function apiAddGroupMember(
  orgId: string,
  groupId: string,
  email: string,
): Promise<GroupMember> {
  return req<GroupMember>('POST', `/organizations/${orgId}/groups/${groupId}/members`, {
    email,
  });
}

export async function apiRemoveGroupMember(
  orgId: string,
  groupId: string,
  userId: string,
): Promise<void> {
  return req<void>(
    'DELETE',
    `/organizations/${orgId}/groups/${groupId}/members/${userId}`,
  );
}

// ─── Operator Screens (Phase 11) ──────────────────────────────────────────────

export type OperatorScreenKind = 'ORDERS_QUEUE' | 'READY' | 'RECOVERED' | 'GENERAL';
export type SlotKind = 'IMMEDIATE' | 'PAUSE_1' | 'PAUSE_2' | 'GENERAL' | 'CUSTOM';
export type OperatorOrderStatus =
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RECOVERED';

/** Fine-grained display filters persisted on a screen template (server-sanitised). */
export interface ScreenFilters {
  categoryIds?: string[];
  excludeCategoryIds?: string[];
  productIds?: string[];
  excludeProductIds?: string[];
  showRecap?: boolean;
}

/** Org-level, reusable operator-dashboard screen definition. */
export interface OperatorScreenTemplate {
  id: string;
  organizationId: string;
  name: string;
  kind: OperatorScreenKind;
  icon?: string | null;
  sortOrder: number;
  enabled: boolean;
  slotKinds: SlotKind[];
  statuses: OperatorOrderStatus[];
  supplierIds: string[];
  filters: ScreenFilters;
  createdAt: string;
  updatedAt: string;
  /** Present on list responses: number of events this template is applied to. */
  _count?: { eventScreens: number };
}

/** A template applied to one event (per-event order + enable override). */
export interface EventOperatorScreen {
  id: string;
  eventId: string;
  templateId: string;
  /** Per-event order override; null ⇒ falls back to template.sortOrder. */
  sortOrder: number | null;
  enabled: boolean;
  createdAt: string;
  /** Included on apply/list/update responses. */
  template?: OperatorScreenTemplate;
}

export interface CreateOperatorScreenInput {
  name: string;
  kind?: OperatorScreenKind;
  icon?: string;
  sortOrder?: number;
  enabled?: boolean;
  slotKinds?: SlotKind[];
  statuses?: OperatorOrderStatus[];
  supplierIds?: string[];
  filters?: ScreenFilters;
}

export type UpdateOperatorScreenInput = Partial<CreateOperatorScreenInput>;

// Templates (org-scoped) --------------------------------------------------------

export async function apiGetOperatorScreens(orgId: string): Promise<OperatorScreenTemplate[]> {
  return req<OperatorScreenTemplate[]>('GET', `/organizations/${orgId}/operator-screens`);
}

export async function apiGetOperatorScreen(
  orgId: string,
  screenId: string,
): Promise<OperatorScreenTemplate> {
  return req<OperatorScreenTemplate>('GET', `/organizations/${orgId}/operator-screens/${screenId}`);
}

export async function apiCreateOperatorScreen(
  orgId: string,
  data: CreateOperatorScreenInput,
): Promise<OperatorScreenTemplate> {
  return req<OperatorScreenTemplate>('POST', `/organizations/${orgId}/operator-screens`, data);
}

export async function apiUpdateOperatorScreen(
  orgId: string,
  screenId: string,
  data: UpdateOperatorScreenInput,
): Promise<OperatorScreenTemplate> {
  return req<OperatorScreenTemplate>(
    'PATCH',
    `/organizations/${orgId}/operator-screens/${screenId}`,
    data,
  );
}

export async function apiDeleteOperatorScreen(orgId: string, screenId: string): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/operator-screens/${screenId}`);
}

// Per-event application ---------------------------------------------------------

export async function apiGetEventScreens(eventId: string): Promise<EventOperatorScreen[]> {
  return req<EventOperatorScreen[]>('GET', `/events/${eventId}/operator-screens`);
}

export async function apiApplyEventScreen(
  eventId: string,
  data: { templateId: string; sortOrder?: number; enabled?: boolean },
): Promise<EventOperatorScreen> {
  return req<EventOperatorScreen>('POST', `/events/${eventId}/operator-screens`, data);
}

export async function apiUpdateEventScreen(
  eventId: string,
  linkId: string,
  data: { sortOrder?: number; enabled?: boolean },
): Promise<EventOperatorScreen> {
  return req<EventOperatorScreen>('PATCH', `/events/${eventId}/operator-screens/${linkId}`, data);
}

export async function apiRemoveEventScreen(eventId: string, linkId: string): Promise<void> {
  return req<void>('DELETE', `/events/${eventId}/operator-screens/${linkId}`);
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

export interface FlagListResponse {
  flags: FeatureFlag[];
}

export async function apiGetFeatureFlags(params?: {
  scope?: string;
  scopeId?: string;
}): Promise<FeatureFlag[]> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.scopeId) qs.set('scopeId', params.scopeId);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const data = await req<FeatureFlag[] | FlagListResponse>('GET', `/feature-flags${query}`);
  // Backend may return array directly or wrapped in { flags }
  return Array.isArray(data) ? data : (data as FlagListResponse).flags ?? [];
}

export async function apiSetFeatureFlag(data: {
  key: string;
  scope: string;
  scopeId?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}): Promise<FeatureFlag> {
  return req<FeatureFlag>('POST', '/feature-flags', data);
}

export async function apiDeleteFeatureFlag(id: string): Promise<void> {
  return req<void>('DELETE', `/feature-flags/${id}`);
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface SettingListResponse {
  settings: AppSetting[];
}

export async function apiGetAppSettings(params?: {
  scope?: string;
  scopeId?: string;
}): Promise<AppSetting[]> {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set('scope', params.scope);
  if (params?.scopeId) qs.set('scopeId', params.scopeId);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const data = await req<AppSetting[] | SettingListResponse>('GET', `/app-settings${query}`);
  return Array.isArray(data) ? data : (data as SettingListResponse).settings ?? [];
}

export async function apiSetAppSetting(data: {
  key: string;
  scope: string;
  scopeId?: string;
  value: unknown;
}): Promise<AppSetting> {
  return req<AppSetting>('POST', '/app-settings', data);
}

export async function apiDeleteAppSetting(id: string): Promise<void> {
  return req<void>('DELETE', `/app-settings/${id}`);
}

// ─── Venues ───────────────────────────────────────────────────────────────────

export interface Venue {
  id: string;
  name: string;
  address: string;
  timezone?: string | null;
  status: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export async function apiGetVenues(orgId: string): Promise<Venue[]> {
  return req<Venue[]>('GET', `/organizations/${orgId}/venues`);
}

export async function apiCreateVenue(
  orgId: string,
  data: { name: string; address: string; timezone?: string },
): Promise<Venue> {
  return req<Venue>('POST', `/organizations/${orgId}/venues`, data);
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  organizationId: string;
  createdAt: string;
}

export async function apiGetCategories(orgId: string): Promise<Category[]> {
  return req<Category[]>('GET', `/organizations/${orgId}/categories`);
}

export async function apiCreateCategory(
  orgId: string,
  data: { name: string; sortOrder?: number },
): Promise<Category> {
  return req<Category>('POST', `/organizations/${orgId}/categories`, data);
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number; // cents
  imageUrl?: string | null;
  status: string;
  categoryId: string;
  supplierId: string;
  organizationId: string;
  createdAt: string;
}

export async function apiGetProducts(orgId: string, supplierId: string): Promise<Product[]> {
  return req<Product[]>('GET', `/organizations/${orgId}/suppliers/${supplierId}/products`);
}

export async function apiCreateProduct(
  orgId: string,
  supplierId: string,
  data: { name: string; price: number; categoryId: string; description?: string },
): Promise<Product> {
  return req<Product>('POST', `/organizations/${orgId}/suppliers/${supplierId}/products`, data);
}

export async function apiDeleteProduct(
  orgId: string,
  supplierId: string,
  productId: string,
): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/suppliers/${supplierId}/products/${productId}`);
}

// ─── Pickup Points ────────────────────────────────────────────────────────────

export interface PickupPoint {
  id: string;
  name: string;
  venueId: string;
  eventId?: string | null;
  supplierId?: string | null;
  status: string;
  organizationId: string;
  createdAt: string;
}

export async function apiGetPickupPoints(
  orgId: string,
  filters?: { eventId?: string; venueId?: string },
): Promise<PickupPoint[]> {
  const qs = new URLSearchParams();
  if (filters?.eventId) qs.set('eventId', filters.eventId);
  if (filters?.venueId) qs.set('venueId', filters.venueId);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return req<PickupPoint[]>('GET', `/organizations/${orgId}/pickup-points${query}`);
}

export async function apiCreatePickupPoint(
  orgId: string,
  data: { name: string; venueId: string; eventId?: string; supplierId?: string },
): Promise<PickupPoint> {
  return req<PickupPoint>('POST', `/organizations/${orgId}/pickup-points`, data);
}

// ─── Slots ────────────────────────────────────────────────────────────────────

export interface Slot {
  id: string;
  eventId: string;
  supplierId?: string | null;
  pickupPointId?: string | null;
  startAt: string;
  endAt: string;
  capacity: number;
  label?: string | null;
  status: string;
  /** Phase 11 — pickup-moment kind (portable across events for screen templates). */
  kind?: SlotKind;
  createdAt: string;
}

export async function apiGetSlots(eventId: string): Promise<Slot[]> {
  return req<Slot[]>('GET', `/events/${eventId}/slots`);
}

export async function apiCreateSlot(
  eventId: string,
  data: { startAt: string; endAt: string; capacity: number; label?: string },
): Promise<Slot> {
  return req<Slot>('POST', `/events/${eventId}/slots`, data);
}

export async function apiDeleteSlot(eventId: string, slotId: string): Promise<void> {
  return req<void>('DELETE', `/events/${eventId}/slots/${slotId}`);
}

// ─── Simulator ────────────────────────────────────────────────────────────────

export async function apiSimulatorSeed(
  eventId: string,
  count = 20,
): Promise<{ created: number; eventId: string }> {
  return req('POST', `/internal/simulator/events/${eventId}/seed?count=${count}`);
}

export async function apiSimulatorRush(
  eventId: string,
  count = 10,
): Promise<{ created: number; eventId: string }> {
  return req('POST', `/internal/simulator/events/${eventId}/rush?count=${count}`);
}

export async function apiSimulatorProgress(
  eventId: string,
): Promise<{ progressed: number; eventId: string }> {
  return req('POST', `/internal/simulator/events/${eventId}/progress`);
}

export async function apiSimulatorRandomFailures(
  eventId: string,
  failRate = 0.2,
): Promise<{ cancelled: number; recovered: number; eventId: string }> {
  return req('POST', `/internal/simulator/events/${eventId}/random-failures?failRate=${failRate}`);
}

export async function apiSimulatorClear(
  eventId: string,
): Promise<{ deleted: number; eventId: string }> {
  return req('DELETE', `/internal/simulator/events/${eventId}`);
}

export async function apiSimulatorStats(eventId: string): Promise<SimulatorStats> {
  return req<SimulatorStats>('GET', `/internal/simulator/events/${eventId}/stats`);
}

// ─── Stats (Phase 15 — Manager dashboard) ───────────────────────────────────────
// Read-only analytics, gated server-side to MANAGE_ROLES (ORG_ADMIN, MANAGER);
// SUPER_ADMIN bypasses. All money is integer cents; TTC is tax-inclusive and
// caHtCents = round(caTtcCents / (1 + vatRate)) — reconciles with the back office.

/** Revenue rollup for a scope (org or event). */
export interface RevenueBlock {
  caTtcCents: number;
  caHtCents: number;
  /** VAT rate used to derive HT from TTC (e.g. 0.1 for 10%). */
  vatRate: number;
}

export interface BasketBlock {
  htCents: number;
  ttcCents: number;
}

/** One event row inside an org overview, with its own revenue rollup. */
export interface OrgEventStat {
  id: string;
  name: string;
  status: string;
  startAt: string;
  endAt: string;
  caTtcCents: number;
  caHtCents: number;
  ordersCount: number;
}

export interface OrgStatsOverview {
  organizationId: string;
  revenue: RevenueBlock;
  ordersCount: number;
  averageBasket: BasketBlock;
  eventsCount: number;
  /** Events currently in progress (startAt <= now <= endAt). */
  activeEventsCount: number;
  events: OrgEventStat[];
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface EventStats {
  event: {
    id: string;
    name: string;
    status: string;
    startAt: string;
    endAt: string;
    organizationId: string;
  };
  revenue: RevenueBlock;
  ordersCount: number;
  averageBasket: BasketBlock;
  /** Revenue-qualifying orders per lifecycle status (every status seeded to 0). */
  ordersByStatus: Record<OperatorOrderStatus, number>;
  /** Best sellers by quantity (max 10). */
  topProducts: TopProduct[];
}

/** GET /organizations/:orgId/stats — org KPIs + per-event revenue rollup. */
export async function apiGetOrgStats(orgId: string): Promise<OrgStatsOverview> {
  return req<OrgStatsOverview>('GET', `/organizations/${orgId}/stats`);
}

/** GET /events/:eventId/stats — single-event analytics (status breakdown + top products). */
export async function apiGetEventStats(eventId: string): Promise<EventStats> {
  return req<EventStats>('GET', `/events/${eventId}/stats`);
}
