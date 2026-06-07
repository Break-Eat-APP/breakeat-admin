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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

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

// ─── Groups (cross-tenant read) ────────────────────────────────────────────────

export async function apiListGroups(): Promise<GroupListItem[]> {
  return req<GroupListItem[]>('GET', '/backoffice/groups');
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

/** Integer cents → "1 234,56 €" (French formatting). */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
