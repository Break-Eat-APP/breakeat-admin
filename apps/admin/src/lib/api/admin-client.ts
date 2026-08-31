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

const LOCAL_PAR_DEFAUT = 'http://localhost:3000/api/v1';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? LOCAL_PAR_DEFAUT;

// Une app SERVIE en ligne qui vise localhost ne joindra jamais rien : elle
// tape sur la machine du visiteur. `NEXT_PUBLIC_API_URL` est inlinee a la
// COMPILATION — absente ce jour-la, le repli local part en production et
// chaque appel echoue. L'echec se deguise alors en « identifiant
// incorrect », et on cherche des heures du cote des comptes.
//
// L'adresse est gravee dans vercel.json ; ce controle est le filet.
if (
  typeof window !== 'undefined' &&
  API_URL === LOCAL_PAR_DEFAUT &&
  !['localhost', '127.0.0.1'].includes(window.location.hostname)
) {
  // eslint-disable-next-line no-console
  console.error(
    `[Break Eat] NEXT_PUBLIC_API_URL est absente de cette build : l'app vise ` +
      `${LOCAL_PAR_DEFAUT}, injoignable depuis ${window.location.hostname}. ` +
      `Toute connexion echouera. Definir la variable puis redeployer.`,
  );
}

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

/** Jeton de renouvellement (7 jours) — sert a prolonger la session sans ressaisie. */
export function getRefreshToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_refresh') ?? '';
}

export function setSessionTokens(accessToken: string, refreshToken?: string): void {
  localStorage.setItem('admin_token', accessToken);
  if (refreshToken) localStorage.setItem('admin_refresh', refreshToken);
}

export function clearSession(): void {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh');
  localStorage.removeItem('admin_user');
  localStorage.removeItem('admin_org_id');
  localStorage.removeItem('admin_org_name');
}

// ─── Base fetch ────────────────────────────────────────────────────────────────

/**
 * Échange le jeton de renouvellement contre un nouveau jeton d'accès.
 *
 * Renvoie faux si le renouvellement est impossible (pas de jeton, ou expiré) :
 * l'appelant déconnecte alors pour de bon.
 */
async function renouvelerSession(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken) return false;
    setSessionTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  noAuth = false,
  /**
   * Vrai quand la session a DEJA ete renouvelee pour cette requete.
   *
   * Sans ce drapeau, un 401 qui persiste apres renouvellement relançait la
   * reprise indefiniment : chaque tentative reussissait a renouveler, echouait
   * de nouveau, et repartait. L'API recevait des dizaines d'appels par clic.
   */
  dejaRenouvele = false,
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

  // 401 : on RENOUVELLE avant de déconnecter.
  //
  // Le jeton d'accès ne vit que 15 minutes ; le jeton de renouvellement, 7
  // jours. Sans cette reprise, un manager qui passe un quart d'heure sur une
  // page — le temps d'aller chercher une information ailleurs, par exemple sur
  // Stripe — était éjecté au clic suivant, sans comprendre pourquoi. Le geste
  // avait l'air de « faire sauter le dashboard ».
  //
  // Une seule tentative, et jamais sur la route de renouvellement elle-même :
  // un jeton mort relancerait sinon la reprise à l'infini.
  if (res.status === 401 && !noAuth && !dejaRenouvele && !path.startsWith('/auth/refresh')) {
    const renouvele = await renouvelerSession();
    if (renouvele) return req<T>(method, path, body, noAuth, true);
  }

  // 401 APRES un renouvellement reussi : le jeton est bon, c'est l'ACTION qui
  // est refusee. Deconnecter serait trompeur — on le dit tel quel.
  if (res.status === 401 && dejaRenouvele) {
    throw new Error(
      "Ton compte n'a pas le droit d'effectuer cette action. " +
        'Vérifie ton rôle dans l’organisation.',
    );
  }

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

/**
 * Réponse d'une invitation. `accountCreated` vaut true quand le compte vient
 * d'être créé : le mot de passe provisoire envoyé est alors actif et doit être
 * transmis. Sinon le compte existait déjà et ce mot de passe a été ignoré.
 */
export interface InviteResult extends OrgMemberWithUser {
  accountCreated: boolean;
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
  /** Plan d'accès propre à cette buvette (null ⇒ plan général du lieu). */
  planUrl?: string | null;
  /** Compte Stripe Connect de la buvette — c'est là que l'argent arrive. */
  stripeAccountId?: string | null;
  stripeAccountStatus?: 'NOT_ONBOARDED' | 'PENDING' | 'ACTIVE' | 'RESTRICTED' | 'REJECTED';
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  isExternal?: boolean;
  referralCode?: string | null;
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

/**
 * POST /organizations/:id/invite — invite par e-mail, sans connaître d'UUID.
 *
 * `temporaryPassword` permet d'intégrer quelqu'un qui n'a pas encore de compte :
 * il est alors créé à la volée. Sans lui, le backend répond 404 si l'e-mail est
 * inconnu.
 */
export async function apiInviteMember(
  orgId: string,
  data: { email: string; role: string; supplierId?: string; temporaryPassword?: string },
): Promise<InviteResult> {
  return req<InviteResult>('POST', `/organizations/${orgId}/invite`, data);
}

/**
 * POST /organizations/:id/members/:memberId/reset-password
 *
 * Redefinit le mot de passe d'un membre. Le mot de passe est genere par le
 * NAVIGATEUR et envoye, exactement comme a l'invitation : c'est ce qui permet
 * de l'afficher une fois a l'ecran. Le serveur ne renvoie que l'e-mail.
 *
 * Comble un trou du modele : l'invitation ne pose un mot de passe qu'a la
 * creation du compte, et reinviter un membre existant echoue sur « deja
 * membre ». Un mot de passe perdu rendait donc le compte inaccessible pour
 * toujours.
 */
export async function apiResetMemberPassword(
  orgId: string,
  memberId: string,
  newPassword: string,
): Promise<{ email: string }> {
  return req<{ email: string }>(
    'POST',
    `/organizations/${orgId}/members/${memberId}/reset-password`,
    { newPassword },
  );
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

/**
 * DELETE /organizations/:orgId/events/:id
 *
 * Le serveur refuse dès qu'une commande y est rattachée : archiver (statut
 * ENDED) est le geste qui sort l'événement de la circulation en conservant
 * tout. Supprimer ne vaut que pour un événement créé par erreur.
 */
export async function apiDeleteEvent(orgId: string, eventId: string): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/events/${eventId}`);
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

/**
 * DELETE /organizations/:orgId/suppliers/:id
 *
 * Le serveur refuse dès qu'une commande y est rattachée : supprimer un point
 * de vente qui a vendu effacerait son chiffre d'affaires. Il se ferme alors
 * plutôt qu'il ne se supprime.
 */
export async function apiDeleteSupplier(orgId: string, supplierId: string): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/suppliers/${supplierId}`);
}

export async function apiCreateSupplier(
  orgId: string,
  data: { name: string; preparationZone?: string; isExternal?: boolean },
): Promise<Supplier> {
  return req<Supplier>('POST', `/organizations/${orgId}/suppliers`, data);
}

/** (Re)génère le code de parrainage d'un exploitant externe. */
export async function apiRegenerateReferral(
  orgId: string,
  supplierId: string,
): Promise<Supplier> {
  return req<Supplier>('POST', `/organizations/${orgId}/suppliers/${supplierId}/referral`, {});
}

// ─── Push programmés & campagnes (C2/C3) ────────────────────────────────────────

export interface ScheduledPush {
  id: string;
  organizationId: string;
  eventId: string | null;
  kind: 'PUSH' | 'DISCOUNT_CAMPAIGN';
  title: string;
  body: string;
  discountPercent: number | null;
  scheduledAt: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'CANCELLED' | 'FAILED';
  sentAt: string | null;
  sentCount: number;
  createdAt: string;
}

export async function apiGetScheduledPushes(orgId: string): Promise<ScheduledPush[]> {
  return req<ScheduledPush[]>('GET', `/organizations/${orgId}/scheduled-pushes`);
}

export async function apiCreateScheduledPush(
  orgId: string,
  data: { eventId?: string; kind?: 'PUSH' | 'DISCOUNT_CAMPAIGN'; title: string; body?: string; discountPercent?: number; scheduledAt: string },
): Promise<ScheduledPush> {
  return req<ScheduledPush>('POST', `/organizations/${orgId}/scheduled-pushes`, data);
}

export async function apiCancelScheduledPush(orgId: string, id: string): Promise<ScheduledPush> {
  return req<ScheduledPush>('DELETE', `/organizations/${orgId}/scheduled-pushes/${id}`);
}

export async function apiUpdateSupplier(
  orgId: string,
  supplierId: string,
  data: { name?: string; preparationZone?: string; planUrl?: string | null },
): Promise<Supplier> {
  return req<Supplier>('PATCH', `/organizations/${orgId}/suppliers/${supplierId}`, data);
}

/**
 * Ouvre (ou reprend) l'inscription Stripe d'une buvette.
 *
 * Le compte Connect est créé au premier appel, puis l'adresse renvoyée mène au
 * formulaire de Stripe. Cette adresse est à USAGE UNIQUE et expire vite : on la
 * redemande à chaque clic plutôt que de la conserver.
 */
export async function apiStripeOnboardingLink(
  orgId: string,
  supplierId: string,
): Promise<{ accountId: string; url: string; expiresAt: number }> {
  return req('POST', `/organizations/${orgId}/suppliers/${supplierId}/stripe/onboarding-link`, {});
}

/** Relit l'état du compte chez Stripe et le recopie sur la buvette. */
export async function apiStripeStatus(orgId: string, supplierId: string): Promise<Supplier> {
  return req('GET', `/organizations/${orgId}/suppliers/${supplierId}/stripe/status`);
}

export async function apiUpdateSupplierStatus(
  orgId: string,
  supplierId: string,
  status: string,
): Promise<Supplier> {
  return req<Supplier>('PATCH', `/organizations/${orgId}/suppliers/${supplierId}/status`, { status });
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
  latitude?: number | null;
  longitude?: number | null;
  searchTerms?: string | null;
  /** URL de l'image du plan des buvettes (affichée dans l'app mobile). */
  buvettePlanUrl?: string | null;
  /**
   * Intégration Flaix : quand true, l'app passe la main à Flaix au lieu du
   * parcours de commande Break Eat.
   */
  flaixEnabled?: boolean;
  flaixVenueId?: string | null;
  /** Phase 20 — programme de fidélité activé par le club sur ce lieu. */
  loyaltyEnabled?: boolean;
  /** Points gagnés par euro dépensé. */
  loyaltyPointsPerEuro?: number;
  /** Valeur d'un point en centimes à l'utilisation. */
  loyaltyPointValueCents?: number;
  /** Phase 22 — voir {@link VenueOperatingMode}. */
  operatingMode?: VenueOperatingMode;
  timezone?: string | null;
  status: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface VenueInput {
  name?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  searchTerms?: string | null;
  buvettePlanUrl?: string | null;
  flaixEnabled?: boolean;
  flaixVenueId?: string | null;
  loyaltyEnabled?: boolean;
  loyaltyPointsPerEuro?: number;
  loyaltyPointValueCents?: number;
  operatingMode?: VenueOperatingMode;
  timezone?: string;
}

/**
 * Rythme d'exploitation d'un lieu.
 *
 * EVENT_BASED — stade, arena, concert : on vend par match, chacun avec sa
 * programmation. PERMANENT — restaurant, cantine d'entreprise, aéroport :
 * ouvert tous les jours, aucun événement à créer ni à dater.
 */
export type VenueOperatingMode = 'EVENT_BASED' | 'PERMANENT';

/**
 * Adresse du poste opérateur.
 *
 * Codée en dur sur localhost, elle ne menait nulle part depuis un dashboard
 * déployé : le club cliquait sur « ouvrir le dashboard opérateur » et
 * atterrissait sur une page morte. `NEXT_PUBLIC_OPERATOR_URL` permet de la
 * pointer ailleurs (préproduction, développement local).
 */
export const OPERATOR_URL =
  process.env.NEXT_PUBLIC_OPERATOR_URL ?? 'https://breakeat-operator.vercel.app';

/** Lien vers le tableau de commandes d'un événement donné. */
export function operatorDashboardUrl(eventId: string): string {
  return `${OPERATOR_URL}/dashboard/${eventId}`;
}

/**
 * Contenant d'un lieu ouvert en continu.
 *
 * Absent de la liste des événements par conception — mais les outils de
 * configuration ont besoin de son identifiant pour y rattacher buvettes et
 * points de retrait. 404 sur un lieu événementiel.
 */
export async function apiGetPermanentContainer(
  orgId: string,
  venueId: string,
): Promise<{ id: string; name: string }> {
  return req<{ id: string; name: string }>(
    'GET',
    `/organizations/${orgId}/venues/${venueId}/container`,
  );
}

export async function apiGetVenues(orgId: string): Promise<Venue[]> {
  return req<Venue[]>('GET', `/organizations/${orgId}/venues`);
}

export async function apiCreateVenue(
  orgId: string,
  data: VenueInput & { name: string; address: string },
): Promise<Venue> {
  return req<Venue>('POST', `/organizations/${orgId}/venues`, data);
}

export async function apiUpdateVenue(
  orgId: string,
  venueId: string,
  data: VenueInput,
): Promise<Venue> {
  return req<Venue>('PATCH', `/organizations/${orgId}/venues/${venueId}`, data);
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

/**
 * Une catégorie appartient à une BUVETTE, pas à l'organisation : deux buvettes
 * peuvent nommer « Boissons » des cartes différentes, et chacune range la
 * sienne. Le `supplierId` est donc obligatoire — sans lui la route n'existe pas.
 */
export async function apiGetCategories(orgId: string, supplierId: string): Promise<Category[]> {
  return req<Category[]>('GET', `/organizations/${orgId}/suppliers/${supplierId}/categories`);
}

export async function apiCreateCategory(
  orgId: string,
  supplierId: string,
  data: { name: string; sortOrder?: number },
): Promise<Category> {
  return req<Category>(
    'POST',
    `/organizations/${orgId}/suppliers/${supplierId}/categories`,
    data,
  );
}

/**
 * Toutes les catégories de l'organisation, buvette par buvette.
 *
 * Il n'existe pas de route « catégories de l'org » côté serveur, parce qu'une
 * catégorie n'appartient pas à l'org : chaque buvette a sa carte. Les écrans
 * qui raisonnent à l'échelle du club (les écrans opérateur configurables)
 * doivent donc agréger eux-mêmes.
 *
 * `label` préfixe le nom de la buvette : sans lui, deux « Boissons » venant de
 * buvettes différentes seraient impossibles à distinguer dans une liste de
 * cases à cocher, alors qu'elles filtrent des produits distincts.
 */
export async function apiGetAllCategories(
  orgId: string,
): Promise<(Category & { supplierName: string; label: string })[]> {
  const suppliers = await apiGetSuppliers(orgId);
  const lists = await Promise.all(
    (Array.isArray(suppliers) ? suppliers : []).map(async (s) => {
      // Une buvette sans catégorie — ou momentanément illisible — ne doit pas
      // vider toute la liste : on l'ignore et on garde les autres.
      const cats = await apiGetCategories(orgId, s.id).catch(() => [] as Category[]);
      return cats.map((c) => ({
        ...c,
        supplierName: s.name,
        label: `${c.name} — ${s.name}`,
      }));
    }),
  );
  return lists.flat();
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
  data: { name: string; price: number; categoryId: string; description?: string; imageUrl?: string },
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

export async function apiDeletePickupPoint(
  orgId: string,
  pickupPointId: string,
): Promise<{ deleted: string }> {
  return req<{ deleted: string }>('DELETE', `/organizations/${orgId}/pickup-points/${pickupPointId}`);
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

export type PeriodGranularity = 'day' | 'week' | 'month';

export interface PeriodBucket {
  /** Début de la tranche, en ISO. Le libellé se compose ici, côté interface. */
  startAt: string;
  caTtcCents: number;
  caHtCents: number;
  ordersCount: number;
}

export interface PeriodStats {
  organizationId: string;
  granularity: PeriodGranularity;
  from: string;
  to: string;
  revenue: RevenueBlock;
  ordersCount: number;
  averageBasket: BasketBlock;
  /** Tranches triées, y compris les vides — un jour sans vente reste visible. */
  buckets: PeriodBucket[];
  topProducts: TopProduct[];
}

/**
 * GET /organizations/:orgId/stats/periods — chiffre d'affaires dans le temps.
 *
 * La lecture des lieux ouverts en continu, où « par événement » n'a pas de
 * sens. L'agrégation porte sur la date de commande, donc elle vaut aussi pour
 * un stade qui voudrait voir ses ventes jour par jour.
 */
export async function apiGetPeriodStats(
  orgId: string,
  params: { granularity?: PeriodGranularity; from?: string; to?: string } = {},
): Promise<PeriodStats> {
  const q = new URLSearchParams();
  if (params.granularity) q.set('granularity', params.granularity);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const suffix = q.toString() ? `?${q}` : '';
  return req<PeriodStats>('GET', `/organizations/${orgId}/stats/periods${suffix}`);
}

/** GET /events/:eventId/stats — single-event analytics (status breakdown + top products). */
export async function apiGetEventStats(eventId: string): Promise<EventStats> {
  return req<EventStats>('GET', `/events/${eventId}/stats`);
}

// ─── Créneaux récurrents (phase 23) ──────────────────────────────────────────

export type SlotKindValue = 'IMMEDIATE' | 'PAUSE_1' | 'PAUSE_2' | 'GENERAL' | 'CUSTOM';

export interface SlotTemplate {
  id: string;
  venueId: string;
  supplierId: string;
  kind: SlotKindValue;
  label: string;
  /** Minutes depuis minuit. 1065 = 17h45. */
  startMinutes: number;
  endMinutes: number;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
  supplier?: { id: string; name: string };
}

/**
 * Créneaux de récupération RÉCURRENTS d'un lieu.
 *
 * Décrits une fois, rejoués chaque jour : le serveur matérialise le créneau du
 * jour à la première visite d'un client. Rattachés à une BUVETTE — deux
 * comptoirs d'un même lieu peuvent servir à des heures différentes.
 */
export async function apiGetSlotTemplates(venueId: string): Promise<SlotTemplate[]> {
  return req<SlotTemplate[]>('GET', `/venues/${venueId}/slot-templates`);
}

export async function apiCreateSlotTemplate(
  venueId: string,
  data: {
    supplierId: string;
    label: string;
    kind: SlotKindValue;
    startMinutes: number;
    endMinutes: number;
    capacity?: number;
  },
): Promise<SlotTemplate> {
  return req<SlotTemplate>('POST', `/venues/${venueId}/slot-templates`, data);
}

export async function apiUpdateSlotTemplate(
  venueId: string,
  id: string,
  data: Partial<{
    label: string;
    kind: SlotKindValue;
    startMinutes: number;
    endMinutes: number;
    capacity: number;
    isActive: boolean;
  }>,
): Promise<SlotTemplate> {
  return req<SlotTemplate>('PATCH', `/venues/${venueId}/slot-templates/${id}`, data);
}

/**
 * Supprime le motif. Les créneaux DÉJÀ engendrés survivent — ils portent
 * peut-être des commandes. Pour cesser d'en produire sans rien perdre,
 * préférer `isActive: false`.
 */
export async function apiDeleteSlotTemplate(venueId: string, id: string): Promise<void> {
  return req<void>('DELETE', `/venues/${venueId}/slot-templates/${id}`);
}

/** « 17:45 » ⇄ 1065 — les deux sens, pour les champs horaires du formulaire. */
export function minutesVersHeure(m: number): string {
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function heureVersMinutes(v: string): number | null {
  const m = /^(\d{1,2})[:h.](\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}
