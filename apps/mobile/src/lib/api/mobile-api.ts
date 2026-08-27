/**
 * Mobile API client — Phase 13
 *
 * All calls inject the auth token from the auth store.
 * Uses the base api-client fetch wrapper.
 */

import { ENV } from '@lib/config/env';
import { useAuthStore } from '@store/auth.store';

const BASE = ENV.API_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // Jeton refusé : la session est morte, il faut la jeter.
  //
  // Sans ça, l'app restait « connectée » avec un jeton que le serveur ne
  // reconnaît plus : chaque appel authentifié échouait, y compris le paiement,
  // et rien ne ramenait vers l'écran de connexion. Le client voyait un
  // « status 401 » au moment de payer, sans aucun moyen d'en sortir.
  //
  // Arrive typiquement après une rotation de `JWT_SECRET` côté serveur — tous
  // les jetons émis avant deviennent invalides d'un coup — ou simplement à
  // l'expiration (7 jours par défaut).
  //
  // On ne nettoie QUE si un jeton était présent : un 401 sur une route publique
  // ne concerne pas la session.
  if (res.status === 401 && token) {
    await useAuthStore.getState().clearAuth();
    throw new ApiError(401, 'Session expirée. Reconnectez-vous pour continuer.');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

// ─── Notifications push (fondation Expo — C1/C2/C3) ──────────────────────────────
// Enregistre / désenregistre le jeton de push de l'appareil auprès du backend.
// Le jeton Expo est obtenu via expo-notifications côté natif (voir docs : la mise
// en place native est requise dans cette app bare RN avant que ceci ne soit appelé).

export async function apiRegisterPushToken(token: string, platform?: string): Promise<void> {
  await req<{ ok: boolean }>('/push-tokens', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
}

export async function apiUnregisterPushToken(token: string): Promise<void> {
  await req<{ ok: boolean }>('/push-tokens', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  });
}

// ─── « Apparence de l'app » (config white-label éditée côté dashboard) ───────────

export interface AppCardAction {
  type: 'none' | 'supplier' | 'orders' | 'scan' | 'url' | 'page';
  supplierId?: string;
  url?: string;
  pageId?: string;
}
export interface AppCard {
  id: string;
  title: string;
  icon: string;
  iconColor?: string;
  imageUrl?: string;
  textColor?: string;
  action?: AppCardAction;
}
export interface AppPage {
  id: string;
  name: string;
  cards: AppCard[];
}
export interface HomeAppearance {
  preset: string;
  /** Lorsque true : l'interface standard est masquée, Flaix prend le dessus (plan du lieu + sélection de place). */
  flaixTakeover?: boolean;
  header: { showLogo: boolean; title: string; subtitle: string; titleColor: string; subtitleColor: string };
  theme: {
    primaryColor: string;
    textColor: string;
    iconColor: string;
    background: string;
    columns: 1 | 2;
    cardSize: 'sm' | 'md' | 'lg';
  };
  cards: AppCard[];
  pages?: AppPage[];
}

export interface PublicEvent {
  id: string;
  name: string;
  status: string;
  /**
   * Contenant technique d’un lieu ouvert en continu (phase 22).
   *
   * Ses dates n’ont aucun sens pour le client : sa fin est fixee en 2099.
   * L’app doit le savoir pour ne pas afficher d’horaires inventes.
   */
  isPermanentContainer?: boolean;
  startAt: string;
  endAt: string;
  venue: { id: string; name: string; address: string; buvettePlanUrl?: string | null } | null;
  branding?: { primaryColor: string | null; logoUrl: string | null } | null;
  appearance?: HomeAppearance | null;
  suppliers: Array<{
    id: string;
    name: string;
    description: string | null; // maps to preparationZone
    status: string;
  }>;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  price: number; // cents
  imageUrl: string | null;
  status: string;
  category: { id: string; name: string; sortOrder: number } | null;
}

export interface ProductGroup {
  category: { id: string; name: string; sortOrder: number };
  products: PublicProduct[];
}

export interface ProductsResponse {
  supplierId: string;
  eventId: string;
  groups: ProductGroup[];
}

export interface PublicSlot {
  id: string;
  label: string | null;
  startAt: string;
  endAt: string;
  capacity: number;
  currentLoad: number;
  status: string;
}

export interface BackendCart {
  id: string;
  userId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string | null;
  status: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  totalCents: number;
  currency: string;
  /** Fidélité appliquée à ce panier (phase 20). */
  loyalty?: {
    enabled: boolean;
    balance: number;
    pointsUsed: number;
    discountCents: number;
    pointValueCents: number;
  };
}

export interface DemoCheckoutResponse {
  orderId: string;
  publicOrderNumber: string;
  totalCents: number;
  status: string;
}

/** Créneau de retrait tel qu'exposé au client (peut être réassigné en cours de service). */
export interface OrderSlot {
  id: string;
  startAt: string;
  endAt: string;
  label: string | null;
  status: string;
}

export interface Order {
  id: string;
  publicOrderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
  /** Dernière transition de statut — sert d'horodatage « mis à jour à ». */
  updatedAt?: string;
  /** Créneau de retrait (null si retrait immédiat / pas de créneau). */
  slot?: OrderSlot | null;
  /** Horodatage du « Je suis arrivé » (null tant que le client n'a rien signalé). */
  customerArrivedAt?: string | null;
  items: Array<{
    productId: string;
    productNameSnapshot: string;
    unitPriceCentsSnapshot: number;
    quantity: number;
    lineTotalCents: number;
  }>;
}

// ─── Auth ─────────────────────────────────────────────────────

export const apiLogin = (email: string, password: string) =>
  req<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const apiRegister = (email: string, password: string, displayName: string) =>
  req<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });

// ─── Découverte des lieux (public, no auth required) ───────────

export interface PublicVenue {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  primaryColor: string | null;
  /** Intégration Flaix : si true, la sélection du lieu passe le relais à Flaix. */
  flaixEnabled: boolean;
  /** Identifiant du lieu côté Flaix (pour les appels API Flaix). */
  flaixVenueId: string | null;
  /** URL de l'image du plan des buvettes (null si le lieu n'en a pas). */
  buvettePlanUrl: string | null;
  /** Événement actif sur ce lieu → cible de navigation (null si aucun). */
  currentEventId: string | null;
  /** Distance en km depuis l'utilisateur (null si pas de géoloc ou pas de coords). */
  distanceKm: number | null;
}

export const apiSearchVenues = (params: {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
} = {}) => {
  const parts: string[] = [];
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.lat !== undefined) parts.push(`lat=${params.lat}`);
  if (params.lng !== undefined) parts.push(`lng=${params.lng}`);
  if (params.radiusKm !== undefined) parts.push(`radiusKm=${params.radiusKm}`);
  const suffix = parts.length ? `?${parts.join('&')}` : '';
  return req<PublicVenue[]>(`/public/venues${suffix}`);
};

// ─── Public event browsing (no auth required) ─────────────────

export const apiGetPublicEvent = (eventId: string) =>
  req<PublicEvent>(`/public/events/${eventId}`);

export const apiGetPublicProducts = (eventId: string, supplierId: string) =>
  req<ProductsResponse>(`/public/events/${eventId}/suppliers/${supplierId}/products`);

export const apiGetPublicSlots = (eventId: string, supplierId?: string | null) =>
  req<PublicSlot[]>(
    // La buvette est transmise : sans elle, le serveur renvoie les creneaux de
    // TOUS les comptoirs du lieu, et le client pouvait choisir « Mi-temps » au
    // Sud pour une commande passee au Nord.
    `/public/events/${eventId}/slots` + (supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : ''),
  );

// ─── Cart (authenticated) ──────────────────────────────────────

export const apiCreateCart = (eventId: string, supplierId: string) =>
  req<BackendCart>('/carts', {
    method: 'POST',
    body: JSON.stringify({ eventId, supplierId }),
  });

export const apiAddCartItem = (cartId: string, productId: string, quantity: number) =>
  req<BackendCart>(`/carts/${cartId}/items`, {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  });

export const apiRemoveCartItem = (cartId: string, itemId: string) =>
  req<BackendCart>(`/carts/${cartId}/items/${itemId}`, { method: 'DELETE' });

export const apiDemoCheckout = (cartId: string) =>
  req<DemoCheckoutResponse>(`/carts/${cartId}/demo-checkout`, { method: 'POST' });

// ─── Fidélité (points) ─────────────────────────────────────────

/** Programme du lieu + solde du client connecté, en un appel. */
export interface LoyaltyStatus {
  /** Le club a-t-il activé les points sur ce lieu ? */
  enabled: boolean;
  /** Solde du client chez ce club. */
  balance: number;
  /** Points gagnés par euro dépensé. */
  pointsPerEuro: number;
  /** Valeur d'un point en centimes (100 pts × 1 = 1 €). */
  pointValueCents: number;
}

export const apiGetLoyaltyStatus = (venueId: string) =>
  req<LoyaltyStatus>(`/loyalty/venues/${venueId}/me`);

/**
 * Choisit combien de points utiliser sur un panier. Renvoie le panier recalculé
 * (le serveur plafonne au solde réel et au montant du panier).
 */
export const apiSetCartPoints = (cartId: string, points: number) =>
  req<BackendCart>(`/carts/${cartId}/loyalty-points`, {
    method: 'PATCH',
    body: JSON.stringify({ points }),
  });

// ─── Live Activity iOS (phase 21) ──────────────────────────────

/**
 * Déclare une Live Activity au backend et lui confie son token push.
 *
 * C'est le SEUL rôle de l'app dans la chaîne : les mises à jour partent ensuite
 * du serveur via APNs (l'activité continue donc de vivre app fermée). Le même
 * appel sert à la rotation du token.
 */
export const apiRegisterLiveActivity = (params: {
  orderId: string;
  activityId: string;
  pushToken: string;
}) =>
  req<{ id: string; orderId: string; status: string }>('/live-activities', {
    method: 'POST',
    body: JSON.stringify(params),
  });

/** Signale que l'activité est terminée côté iOS : le serveur cesse d'émettre. */
export const apiUnregisterLiveActivity = (activityId: string) =>
  req<{ id: string; status: string }>(`/live-activities/${activityId}`, {
    method: 'DELETE',
  });

// ─── Orders (authenticated) ────────────────────────────────────

export const apiGetOrder = (orderId: string) =>
  req<Order>(`/orders/${orderId}`);

/** Historique des commandes de l'utilisateur connecté (plus récentes d'abord). */
export const apiGetMyOrders = () =>
  req<Order[]>('/orders');

/**
 * « Je suis arrivé » — signale au stand que le client attend au point de retrait.
 * Ne change pas le statut de la commande ; met la carte en évidence sur le board
 * opérateur. Idempotent côté serveur (un second appel ne réalerte pas la buvette).
 */
export const apiMarkArrived = (orderId: string) =>
  req<Order>(`/orders/${orderId}/arrived`, { method: 'POST' });

// ─── Helpers ──────────────────────────────────────────────────

/** Format cents to readable price string (e.g. 250 → "2,50 €") */
export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' €';
}

/** Format ISO date to short time string (e.g. "20:00") */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
