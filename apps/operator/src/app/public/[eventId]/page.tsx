'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PublicScreenRow } from '@/components/PublicScreenRow';
import { SocketClient, type RealtimeEvent } from '@/lib/realtime/socket-client';

/**
 * Public Ready Screen — /public/:eventId
 *
 * Shows READY orders for customers to see. No authentication required.
 * Privacy: only order number + pickup point label shown (no PII).
 *
 * Data sources:
 *   1. REST GET /orders/event/:eventId/dashboard (initial snapshot of READY orders)
 *   2. Socket.IO order_ready events (realtime additions)
 *   3. Auto-cleanup: orders removed after 5 minutes (they've been picked up or should be)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
const DISPLAY_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface ReadyOrder {
  id: string;
  orderNumber: string;
  pickupPointId: string;
  readyAt: string;
  isNew: boolean;
}

type Action =
  | { type: 'ADD_ORDERS'; orders: ReadyOrder[] }
  | { type: 'ADD_ORDER'; order: ReadyOrder }
  | { type: 'CLEAR_NEW'; id: string }
  | { type: 'PRUNE' };

function reducer(state: ReadyOrder[], action: Action): ReadyOrder[] {
  switch (action.type) {
    case 'ADD_ORDERS': {
      const ids = new Set(state.map((o) => o.id));
      const fresh = action.orders.filter((o) => !ids.has(o.id));
      return [...fresh, ...state];
    }
    case 'ADD_ORDER': {
      if (state.some((o) => o.id === action.order.id)) return state;
      return [action.order, ...state];
    }
    case 'CLEAR_NEW':
      return state.map((o) => (o.id === action.id ? { ...o, isNew: false } : o));
    case 'PRUNE': {
      const cutoff = Date.now() - DISPLAY_DURATION_MS;
      return state.filter((o) => new Date(o.readyAt).getTime() > cutoff);
    }
  }
}

export default function PublicReadyScreen() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [orders, dispatch] = useReducer(reducer, []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const socketRef = useRef<SocketClient | null>(null);

  // ─── Initial REST snapshot ──────────────────────────────────────
  // Uses the public (no-auth) endpoint GET /public/orders/event/:id/ready
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/public/orders/event/${eventId}/ready`);
        if (!res.ok) return;
        const data = await res.json() as Array<{
          id: string;
          publicOrderNumber: string;
          pickupPointId: string;
          updatedAt: string;
        }>;
        const readyOrders: ReadyOrder[] = data.map((o) => ({
          id: o.id,
          orderNumber: o.publicOrderNumber,
          pickupPointId: o.pickupPointId,
          readyAt: o.updatedAt,
          isNew: false,
        }));
        dispatch({ type: 'ADD_ORDERS', orders: readyOrders });
      } catch {
        // Public screen — fail silently
      }
    }
    void load();
  }, [eventId]);

  // ─── Socket.IO for realtime order_ready events ──────────────────
  useEffect(() => {
    // Public screen: connect without auth token
    // The backend gateway will disconnect unauthenticated sockets.
    // For public screen, we use a 'public-reader' room that doesn't require auth.
    // In practice: poll every 10s as fallback, socket if token is available.
    const publicSocket = new SocketClient({
      url: API_URL.replace('/api/v1', ''),
      token: '',
      room: `event:${eventId}`,
      onEvent: (event: RealtimeEvent) => {
        if (event.eventName === 'order_ready') {
          const order: ReadyOrder = {
            id: event.orderId as string,
            orderNumber: event.publicOrderNumber as string ?? '',
            pickupPointId: event.pickupPointId as string ?? '',
            readyAt: event.occurredAt,
            isNew: true,
          };
          dispatch({ type: 'ADD_ORDER', order });
          setTimeout(() => dispatch({ type: 'CLEAR_NEW', id: order.id }), 3000);
        }
      },
      onStatusChange: () => {},
    });

    socketRef.current = publicSocket;
    void publicSocket.connect().catch(() => {
      // Public screen — socket failure is non-blocking
    });

    return () => {
      publicSocket.disconnect();
      socketRef.current = null;
    };
  }, [eventId]);

  // ─── Periodic prune ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'PRUNE' }), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sync fullscreen state with actual browser state (handles Esc key)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f0fdf4',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          background: '#065f46',
          color: '#fff',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: -0.5 }}>BREAKEAT</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Commandes prêtes à récupérer</div>
        </div>
        <button
          onClick={toggleFullscreen}
          style={{
            background: '#047857',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          {isFullscreen ? '⊠' : '⊞'}
        </button>
      </header>

      {/* Content */}
      <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#6b7280',
              fontSize: 18,
              marginTop: 80,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🕐</div>
            <div>Aucune commande prête pour l&apos;instant</div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.7 }}>
              Les commandes prêtes apparaîtront ici automatiquement
            </div>
          </div>
        ) : (
          orders.map((order) => (
            <PublicScreenRow
              key={order.id}
              orderNumber={order.orderNumber}
              pickupPointId={order.pickupPointId}
              readyAt={order.readyAt}
              isNew={order.isNew}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '8px 24px',
          background: '#ecfdf5',
          borderTop: '1px solid #bbf7d0',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#6b7280',
        }}
      >
        <span>{orders.length} commande{orders.length !== 1 ? 's' : ''} affichée{orders.length !== 1 ? 's' : ''}</span>
        <span>Les commandes disparaissent automatiquement après 5 min</span>
      </footer>
    </main>
  );
}
