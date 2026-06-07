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
    firstName: string;
    lastName: string;
  };
}

export interface PublicEvent {
  id: string;
  name: string;
  status: string;
  startAt: string;
  endAt: string;
  venue: { id: string; name: string; address: string } | null;
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
}

export interface DemoCheckoutResponse {
  orderId: string;
  publicOrderNumber: string;
  totalCents: number;
  status: string;
}

export interface Order {
  id: string;
  publicOrderNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: string;
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

export const apiRegister = (email: string, password: string, firstName: string, lastName: string) =>
  req<LoginResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, firstName, lastName }),
  });

// ─── Public event browsing (no auth required) ─────────────────

export const apiGetPublicEvent = (eventId: string) =>
  req<PublicEvent>(`/public/events/${eventId}`);

export const apiGetPublicProducts = (eventId: string, supplierId: string) =>
  req<ProductsResponse>(`/public/events/${eventId}/suppliers/${supplierId}/products`);

export const apiGetPublicSlots = (eventId: string) =>
  req<PublicSlot[]>(`/public/events/${eventId}/slots`);

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

// ─── Orders (authenticated) ────────────────────────────────────

export const apiGetOrder = (orderId: string) =>
  req<Order>(`/orders/${orderId}`);

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
