/**
 * OrdersApiClient — REST wrapper for the operator dashboard.
 *
 * Reads NEXT_PUBLIC_API_URL from the environment.
 * All calls include Authorization: Bearer <token>.
 */

const LOCAL_PAR_DEFAUT = 'http://localhost:3000/api/v1';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? LOCAL_PAR_DEFAUT;

// Une app SERVIE en ligne qui vise localhost ne joindra jamais rien : elle
// tape sur la machine du visiteur. `NEXT_PUBLIC_API_URL` est inlinee a la
// COMPILATION — absente ce jour-la, le repli local part en production et
// chaque appel echoue. L'echec se deguise alors en « identifiant
// incorrect », et on cherche des heures du cote des comptes.
//
// L'adresse est gravee dans vercel.json ; ce controle est le filet.
if (
  typeof window !== 'undefined' &&
  BASE === LOCAL_PAR_DEFAUT &&
  !['localhost', '127.0.0.1'].includes(window.location.hostname)
) {
  // eslint-disable-next-line no-console
  console.error(
    `[Break Eat] NEXT_PUBLIC_API_URL est absente de cette build : l'app vise ` +
      `${LOCAL_PAR_DEFAUT}, injoignable depuis ${window.location.hostname}. ` +
      `Toute connexion echouera. Definir la variable puis redeployer.`,
  );
}

/**
 * Emis quand le serveur refuse le jeton. La page ecoute et revient au
 * formulaire de connexion — une seule fois, sans rechargement.
 */
export const SESSION_EXPIREE = 'breakeat:session-expiree';

/**
 * Echange le jeton de renouvellement (7 jours) contre un nouveau jeton d'acces.
 * Renvoie le nouveau jeton, ou null si le renouvellement est impossible.
 */
async function renouvelerSession(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refresh = localStorage.getItem('operator_refresh');
  if (!refresh) return null;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken) return null;
    localStorage.setItem('operator_token', data.accessToken);
    if (data.refreshToken) localStorage.setItem('operator_refresh', data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  // Session expirée ou invalidée : le jeton stocké ne vaut plus rien.
  //
  // Arrive notamment après une rotation de `JWT_SECRET` côté serveur — tous les
  // jetons émis avant deviennent invalides d'un coup.
  //
  // ⚠️ SURTOUT PAS de `window.location.reload()` ici. La version précédente le
  // faisait, et se déconnectait en boucle : le tableau lance plusieurs appels au
  // montage, le premier 401 rechargeait la page, qui relançait les mêmes appels,
  // qui rechargeaient encore. L'écran paraissait « se connecter puis sauter »,
  // sans jamais laisser le temps de rien.
  //
  // On signale par un événement : la page décide, une seule fois, de revenir au
  // formulaire de connexion.
  // On RENOUVELLE avant de renvoyer au formulaire.
  //
  // Le jeton d'acces ne vit que 15 minutes ; un service dure des heures. Sans
  // cette reprise, l'operatrice etait ejectee en plein coup de feu, toutes les
  // quinze minutes, sans autre explication qu'un ecran de connexion.
  //
  // Une seule tentative, jamais sur la route de renouvellement : un jeton mort
  // relancerait sinon la reprise a l'infini.
  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    const nouveau = await renouvelerSession();
    if (nouveau) return apiFetch<T>(path, nouveau, init);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('operator_token');
      localStorage.removeItem('operator_refresh');
      window.dispatchEvent(new Event(SESSION_EXPIREE));
    }
    throw new Error('Session expirée — reconnectez-vous.');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Nature du créneau de retrait, aplatie par le serveur (IMMEDIATE sans créneau). */
export type SlotKind = 'IMMEDIATE' | 'PAUSE_1' | 'PAUSE_2' | 'GENERAL' | 'CUSTOM';

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
  /**
   * Phase 19 — le client a appuyé sur « Je suis arrivé » dans l'app.
   * Non nul ⇒ il attend au point de retrait, la carte est mise en évidence.
   */
  customerArrivedAt?: string | null;
  items: OrderItem[];
}

export interface DashboardData {
  eventId: string;
  counts: Record<string, number>;
  orders: Record<string, Order[]>;
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

// ─── Transitions ─────────────────────────────────────────────────────────────

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

export async function cancelOrder(id: string, token: string, reason?: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${id}/cancel`, token, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

// ─── Ouverture de la buvette ──────────────────────────────────────────────────

/** Les quatre états d'une buvette. Seuls OPEN et CLOSED se pilotent d'ici. */
export type SupplierStatus = 'OPEN' | 'CLOSED' | 'PAUSED' | 'OFFLINE';

/** Lit l'état courant de la buvette — le tableau de commandes ne le porte pas. */
export async function fetchSupplier(
  organizationId: string,
  supplierId: string,
  token: string,
): Promise<{ id: string; name: string; status: SupplierStatus }> {
  return apiFetch<{ id: string; name: string; status: SupplierStatus }>(
    `/organizations/${organizationId}/suppliers/${supplierId}`,
    token,
  );
}

/**
 * Ouvre ou ferme la buvette.
 *
 * C'est l'ÉQUIPIER qui décide, depuis son poste : lui seul sait s'il a du monde,
 * du stock et de quoi servir. Le backend l'autorise explicitement — `updateStatus`
 * accepte le rôle OPERATOR au même titre que le responsable.
 *
 * Fermer n'efface rien : les commandes déjà passées restent à préparer, seule la
 * prise de nouvelles commandes s'arrête.
 */
export async function setSupplierStatus(
  organizationId: string,
  supplierId: string,
  status: SupplierStatus,
  token: string,
): Promise<{ id: string; status: SupplierStatus }> {
  return apiFetch<{ id: string; status: SupplierStatus }>(
    `/organizations/${organizationId}/suppliers/${supplierId}/status`,
    token,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  );
}

// ─── Créneaux de récupération ─────────────────────────────────────────────────

export type SlotStatusValue = 'OPEN' | 'FULL' | 'CLOSED';

export interface PickupSlot {
  id: string;
  label: string | null;
  startAt: string;
  endAt: string;
  capacity: number;
  currentLoad: number;
  status: SlotStatusValue;
  supplierId: string | null;
}

/** Les créneaux de l'événement. Ceux du jour sont matérialisés côté serveur. */
export async function fetchSlots(eventId: string, token: string): Promise<PickupSlot[]> {
  return apiFetch<PickupSlot[]>(`/events/${eventId}/slots`, token);
}

/**
 * Ouvre ou ferme un créneau.
 *
 * Route distincte de la configuration : horaires et capacités restent décidés
 * par le club, mais l'ouverture se juge devant la file d'attente — c'est
 * l'équipier qui la voit.
 *
 * Fermer n'annule rien : les commandes déjà placées sur ce créneau restent
 * dues, seule la prise de nouvelles s'arrête.
 */
export async function setSlotStatus(
  eventId: string,
  slotId: string,
  status: SlotStatusValue,
  token: string,
): Promise<PickupSlot> {
  return apiFetch<PickupSlot>(`/events/${eventId}/slots/${slotId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Connexion opérateur.
 *
 * Chaque échec doit se nommer. « Identifiants incorrects » était renvoyé pour
 * TOUT : mot de passe faux, serveur en panne, et surtout **rejet CORS** — une
 * adresse absente de `CORS_ORIGINS` fait echouer `fetch` avant même d'atteindre
 * l'API. C'est arrivé sur l'app opérateur, et le diagnostic a coûté une
 * journée : on cherchait un mot de passe alors que le navigateur bloquait tout.
 *
 * L'e-mail est normalisé ici (minuscules, sans espaces) : les comptes sont
 * créés ainsi côté serveur, et une majuscule suffisait à faire échouer la
 * comparaison.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
  } catch {
    // `fetch` ne lève que pour un problème RÉSEAU — jamais pour un 401. La
    // cause la plus fréquente ici est un rejet CORS, invisible autrement.
    throw new Error(
      `Impossible de joindre le serveur (${BASE}). ` +
        `Cette adresse (${typeof window !== 'undefined' ? window.location.origin : '?'}) ` +
        `est peut-être absente de CORS_ORIGINS, ou l'API est hors ligne.`,
    );
  }

  if (res.status === 401) {
    throw new Error('E-mail ou mot de passe incorrect.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Connexion refusée (HTTP ${res.status}). ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<LoginResponse>;
}
