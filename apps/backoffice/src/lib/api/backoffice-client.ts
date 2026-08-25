/**
 * backoffice-client.ts — centralised API client for the BREAK EAT back office.
 *
 * The back office is SUPER_ADMIN only and cross-tenant: there is NO org context
 * (unlike the admin panel). All requests are authenticated via a Bearer token
 * stored in localStorage. A 401 auto-redirects to /login and clears credentials.
 *
 * localStorage keys (namespaced to avoid clashing with the admin panel):
 *   backoffice_token — JWT access token
 *   backoffice_user  — JSON-serialised BackofficeUser
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
  return localStorage.getItem('backoffice_token') ?? '';
}

export function getStoredUser(): BackofficeUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('backoffice_user');
    return raw ? (JSON.parse(raw) as BackofficeUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: BackofficeUser): void {
  localStorage.setItem('backoffice_token', token);
  localStorage.setItem('backoffice_user', JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem('backoffice_token');
  localStorage.removeItem('backoffice_user');
}

/** True only for a logged-in SUPER_ADMIN — the sole role allowed in here. */
export function isSuperAdmin(user: BackofficeUser | null): boolean {
  return user?.globalRole === 'SUPER_ADMIN';
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

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data['message'] as string | undefined) ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BackofficeUser {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: BackofficeUser;
  accessToken: string;
  refreshToken: string;
}

/** Platform-wide KPIs (GET /backoffice/kpis). All money values are integer cents. */
export interface GlobalKpis {
  revenue: {
    caTtcCents: number;
    caHtCents: number;
    vatRate: number;
  };
  ordersCount: number;
  averageBasket: {
    htCents: number;
    ttcCents: number;
  };
  accountsCount: number;
  organizationsCount: number;
}

export interface OrgCounts {
  members: number;
  events: number;
  suppliers: number;
  groups: number;
}

/** Row from GET /backoffice/organizations. */
export interface OrgListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  primaryColor: string | null;
  createdAt: string;
  _count: OrgCounts;
}

export interface OrgMemberWithUser {
  id: string;
  userId: string;
  organizationId: string;
  orgRole: string;
  supplierId: string | null;
  createdAt: string;
  user: { id: string; email: string; displayName: string; globalRole: string };
}

/** Full org from GET /backoffice/organizations/:id. */
export interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  primaryColor: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  members: OrgMemberWithUser[];
  _count: OrgCounts;
}

/** Row from GET /backoffice/groups (cross-tenant). */
export interface GroupListItem {
  id: string;
  name: string;
  description: string | null;
  emailDomain: string | null;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
  _count: { members: number; events: number };
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return req<AuthResponse>('POST', '/auth/login', { email, password }, true);
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export async function apiGetKpis(): Promise<GlobalKpis> {
  return req<GlobalKpis>('GET', '/backoffice/kpis');
}

// ─── Organisations (cross-tenant) ──────────────────────────────────────────────

export async function apiListOrganizations(): Promise<OrgListItem[]> {
  return req<OrgListItem[]>('GET', '/backoffice/organizations');
}

export async function apiGetOrganization(id: string): Promise<OrgDetail> {
  return req<OrgDetail>('GET', `/backoffice/organizations/${id}`);
}

export async function apiCreateOrganization(data: {
  name: string;
  slug: string;
}): Promise<OrgListItem> {
  return req<OrgListItem>('POST', '/backoffice/organizations', data);
}

export async function apiUpdateOrganization(
  id: string,
  data: {
    name?: string;
    slug?: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    description?: string | null;
  },
): Promise<OrgDetail> {
  return req<OrgDetail>('PATCH', `/backoffice/organizations/${id}`, data);
}

export async function apiActivateOrganization(id: string): Promise<OrgListItem> {
  return req<OrgListItem>('PATCH', `/backoffice/organizations/${id}/activate`);
}

export async function apiDeactivateOrganization(id: string): Promise<OrgListItem> {
  return req<OrgListItem>('PATCH', `/backoffice/organizations/${id}/deactivate`);
}

// ─── Lieux (config plateforme — un club = un lieu) ──────────────────────────────
// Endpoints org-scopés ; le token back office est SUPER_ADMIN → accès à toute org.

export interface Venue {
  id: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  searchTerms?: string | null;
  buvettePlanUrl?: string | null;
  flaixEnabled?: boolean;
  flaixVenueId?: string | null;
  /**
   * Fidélité : réglée sur le LIEU parce que c'est le club qui décide de son
   * programme et de son taux. Le solde des clients, lui, vit au niveau de
   * l'organisation — les points suivent le club, pas le bâtiment.
   */
  loyaltyEnabled?: boolean;
  loyaltyPointsPerEuro?: number;
  loyaltyPointValueCents?: number;
  operatingMode?: VenueOperatingMode;
  timezone?: string | null;
  status: string;
}

/**
 * Rythme d'exploitation d'un lieu.
 *
 * EVENT_BASED — stade, arena, salle de concert : on vend par match ou par
 * concert, chacun avec sa programmation.
 *
 * PERMANENT — restaurant, cantine d'entreprise, aéroport, parc : ouvert tous
 * les jours, la carte bouge peu. Aucun événement à créer ni à dater.
 */
export type VenueOperatingMode = 'EVENT_BASED' | 'PERMANENT';

/** Libellés et explications du mode, partagés par les écrans de configuration. */
export const VENUE_MODE_OPTIONS: {
  value: VenueOperatingMode;
  label: string;
  hint: string;
}[] = [
  {
    value: 'EVENT_BASED',
    label: 'Par événement',
    hint: 'Stade, arena, salle de concert : on vend par match ou par concert, chacun avec ses horaires et sa carte.',
  },
  {
    value: 'PERMANENT',
    label: 'Ouvert en continu',
    hint: 'Restaurant, restauration d’entreprise, aéroport, parc : ouvert tous les jours. Aucun événement à créer ni à dater — la configuration se fait une seule fois.',
  },
];

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

export async function apiGetVenues(orgId: string): Promise<Venue[]> {
  return req<Venue[]>('GET', `/organizations/${orgId}/venues`);
}

/**
 * Réponse d'une invitation. `accountCreated` vaut true quand le compte vient
 * d'être créé : le mot de passe provisoire est alors actif et doit être
 * transmis. Sinon la personne conserve le sien.
 */
export interface InviteResult extends OrgMemberWithUser {
  accountCreated: boolean;
}

/**
 * POST /organizations/:id/invite — donne un accès à un club.
 *
 * `temporaryPassword` crée le compte quand l'e-mail est inconnu : c'est le cas
 * courant d'un responsable de club qu'on intègre, qui n'a jamais utilisé l'app.
 */
export async function apiInviteMember(
  orgId: string,
  data: { email: string; role: string; temporaryPassword?: string },
): Promise<InviteResult> {
  return req<InviteResult>('POST', `/organizations/${orgId}/invite`, data);
}

/**
 * DELETE /organizations/:id/members/:memberId — retire l'accès d'une personne
 * à ce club.
 *
 * Le compte Break Eat lui-même n'est pas supprimé : la personne garde son accès
 * client à l'application, elle perd seulement ce club. Supprimer un compte
 * effacerait aussi son historique de commandes.
 */
export async function apiRemoveMember(orgId: string, memberId: string): Promise<void> {
  return req<void>('DELETE', `/organizations/${orgId}/members/${memberId}`);
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

// ─── Utilisateurs (cross-tenant) ──────────────────────────────────────────────

export interface UserMembership {
  orgRole: string;
  organization: { id: string; name: string; slug: string };
}

export interface BackofficeUserListItem {
  id: string;
  email: string;
  displayName: string;
  globalRole: string;
  isActive: boolean;
  createdAt: string;
  memberships: UserMembership[];
}

export async function apiListUsers(): Promise<BackofficeUserListItem[]> {
  return req<BackofficeUserListItem[]>('GET', '/backoffice/users');
}

/**
 * Archive ou réactive un compte (`isActive`).
 *
 * Le compte et son historique de commandes sont conservés — c'est un archivage
 * réversible, pas une suppression. L'effet est immédiat : le serveur relit
 * `isActive` à chaque requête, une session ouverte cesse donc de fonctionner.
 */
export async function apiSetUserArchived(
  userId: string,
  archived: boolean,
): Promise<BackofficeUserListItem> {
  return req<BackofficeUserListItem>(
    'PATCH',
    `/backoffice/users/${userId}/${archived ? 'archive' : 'unarchive'}`,
  );
}

// ─── Groups (cross-tenant CRUD) ────────────────────────────────────────────────

export interface CreateGroupInput {
  orgId: string;
  name: string;
  description?: string;
  emailDomain?: string;
}

export async function apiListGroups(): Promise<GroupListItem[]> {
  return req<GroupListItem[]>('GET', '/backoffice/groups');
}

export async function apiCreateGroup(data: CreateGroupInput): Promise<GroupListItem> {
  return req<GroupListItem>('POST', '/backoffice/groups', data);
}

export async function apiDeleteGroup(id: string): Promise<{ deleted: boolean }> {
  return req<{ deleted: boolean }>('DELETE', `/backoffice/groups/${id}`);
}

// ─── Notifications push ────────────────────────────────────────────────────────

export interface SendNotificationInput {
  title: string;
  body?: string;
  orgId?: string;
}

export interface SendNotificationResult {
  sent: number;
  failed: number;
  recipients: number;
}

export async function apiSendNotification(
  data: SendNotificationInput,
): Promise<SendNotificationResult> {
  return req<SendNotificationResult>('POST', '/backoffice/notifications/send', data);
}

// ─── Notifications programmées ────────────────────────────────────────────────

export interface ScheduleNotificationInput {
  title: string;
  body?: string;
  scheduledAt: string; // ISO 8601
  orgId?: string;
}

export interface ScheduledPush {
  id: string;
  title: string;
  body: string;
  scheduledAt: string;
  status: string;
  sentCount: number;
  sentAt: string | null;
  organizationId: string | null;
  organization: { id: string; name: string } | null;
  createdAt: string;
}

export async function apiScheduleNotification(data: ScheduleNotificationInput): Promise<ScheduledPush> {
  return req<ScheduledPush>('POST', '/backoffice/notifications/schedule', data);
}

export async function apiListScheduledNotifications(): Promise<ScheduledPush[]> {
  return req<ScheduledPush[]>('GET', '/backoffice/notifications/scheduled');
}

export async function apiCancelScheduledNotification(id: string): Promise<ScheduledPush> {
  return req<ScheduledPush>('DELETE', `/backoffice/notifications/scheduled/${id}`);
}

// ─── Suppression organisation ─────────────────────────────────────────────────

export async function apiDeleteOrganization(id: string): Promise<{ deleted: boolean }> {
  return req<{ deleted: boolean }>('DELETE', `/backoffice/organizations/${id}`);
}

/** Ce que la remise à zéro a effacé, poste par poste. */
export interface ResetOrgDataResult {
  organization: string;
  supprime: {
    commandes: number;
    fidelite: number;
    notifications: number;
    comptoirs: number;
    evenements: number;
    buvettes: number;
  };
}

/**
 * POST /backoffice/organizations/:id/reset-data — vide les données
 * d'exploitation en conservant l'organisation.
 *
 * `confirmation` doit reproduire EXACTEMENT le nom de l'organisation ; le
 * serveur refuse sinon. Le lieu (GPS, mots-clés), les accès et les groupes
 * survivent — sans eux, plus personne ne pourrait se reconnecter ensuite.
 */
export async function apiResetOrgData(
  id: string,
  confirmation: string,
): Promise<ResetOrgDataResult> {
  return req<ResetOrgDataResult>('POST', `/backoffice/organizations/${id}/reset-data`, {
    confirmation,
  });
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

/** Integer cents → "1 234,56 €" (French formatting). */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
