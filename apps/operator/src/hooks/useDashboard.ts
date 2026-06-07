'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { SocketClient, type SocketStatus, type RealtimeEvent } from '@/lib/realtime/socket-client';
import { fetchDashboard, type DashboardData, type Order } from '@/lib/api/orders-client';
import type { NotificationData } from '@/components/NotificationPopup';

// ─── State ────────────────────────────────────────────────────────────────────

interface DashboardState {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  socketStatus: SocketStatus;
  notification: NotificationData | null;
  loadingOrderIds: Set<string>;
}

type DashboardAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: DashboardData }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SOCKET_STATUS'; status: SocketStatus }
  | { type: 'NEW_ORDER'; order: Order }
  | { type: 'ORDER_UPDATED'; orderId: string; nextStatus: string }
  | { type: 'ORDER_READY'; orderId: string; orderNumber: string; pickupPointId: string }
  | { type: 'SET_NOTIFICATION'; notification: NotificationData | null }
  | { type: 'ORDER_LOADING'; orderId: string }
  | { type: 'ORDER_LOADED'; orderId: string };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, isLoading: true, error: null };

    case 'FETCH_SUCCESS':
      return { ...state, isLoading: false, data: action.payload, error: null };

    case 'FETCH_ERROR':
      return { ...state, isLoading: false, error: action.error };

    case 'SOCKET_STATUS':
      return { ...state, socketStatus: action.status };

    case 'NEW_ORDER': {
      if (!state.data) return state;
      const paidOrders = [action.order, ...state.data.orders.PAID.filter((o) => o.id !== action.order.id)];
      return {
        ...state,
        data: {
          ...state.data,
          orders: { ...state.data.orders, PAID: paidOrders },
          counts: { ...state.data.counts, PAID: paidOrders.length },
        },
      };
    }

    case 'ORDER_UPDATED': {
      if (!state.data) return state;
      // Remove from all columns, add to the new status column
      const all = Object.values(state.data.orders).flat();
      const moved = all.find((o) => o.id === action.orderId);
      if (!moved) return state; // Unknown order — will resync on next poll

      const updatedOrder = { ...moved, status: action.nextStatus };
      const LIVE_STATUSES = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'RECOVERED'];

      const newOrders: Record<string, Order[]> = {};
      const newCounts: Record<string, number> = {};

      for (const status of LIVE_STATUSES) {
        if (status === action.nextStatus) {
          // Add to the new column (at the end, FIFO)
          newOrders[status] = [
            ...(state.data.orders[status] ?? []).filter((o) => o.id !== action.orderId),
            updatedOrder,
          ];
        } else {
          // Remove from old column if present
          newOrders[status] = (state.data.orders[status] ?? []).filter((o) => o.id !== action.orderId);
        }
        newCounts[status] = newOrders[status].length;
      }

      return {
        ...state,
        data: { ...state.data, orders: newOrders, counts: newCounts },
      };
    }

    case 'ORDER_READY': {
      // order_ready is already handled by ORDER_UPDATED (status→READY)
      // Here we just set the notification
      return {
        ...state,
        notification: {
          type: 'order_ready',
          orderNumber: action.orderNumber,
          pickupPointId: action.pickupPointId,
        },
      };
    }

    case 'SET_NOTIFICATION':
      return { ...state, notification: action.notification };

    case 'ORDER_LOADING': {
      const next = new Set(state.loadingOrderIds);
      next.add(action.orderId);
      return { ...state, loadingOrderIds: next };
    }

    case 'ORDER_LOADED': {
      const next = new Set(state.loadingOrderIds);
      next.delete(action.orderId);
      return { ...state, loadingOrderIds: next };
    }

    default:
      return state;
  }
}

const INITIAL_STATE: DashboardState = {
  data: null,
  isLoading: false,
  error: null,
  socketStatus: 'disconnected',
  notification: null,
  loadingOrderIds: new Set(),
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseDashboardOptions {
  eventId: string;
  token: string;
  apiUrl: string;
  /** Fallback polling interval when socket is disconnected (ms). Default 10_000 */
  pollInterval?: number;
  /**
   * Phase 12.9 — when set, only orders for this supplier are fetched.
   * An OPERATOR assigned to a specific supplier passes their supplierId here.
   */
  supplierId?: string | null;
}

export function useDashboard({
  eventId,
  token,
  apiUrl,
  pollInterval = 10_000,
  supplierId,
}: UseDashboardOptions) {
  const [state, dispatch] = useReducer(dashboardReducer, INITIAL_STATE);
  const socketRef = useRef<SocketClient | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── REST snapshot ────────────────────────────────────────────

  const loadSnapshot = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      const data = await fetchDashboard(eventId, token, supplierId);
      dispatch({ type: 'FETCH_SUCCESS', payload: data });
    } catch (err) {
      dispatch({ type: 'FETCH_ERROR', error: String(err) });
    }
  }, [eventId, token, supplierId]);

  // ─── Socket event handler ─────────────────────────────────────

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.eventName) {
      case 'new_order': {
        // A new order arrived — we only have partial data from the socket.
        // Trigger a REST resync to get the full order with items.
        void loadSnapshot();
        dispatch({
          type: 'SET_NOTIFICATION',
          notification: {
            type: 'new_order',
            orderNumber: event.publicOrderNumber as string ?? '',
          },
        });
        break;
      }

      case 'order_updated': {
        dispatch({
          type: 'ORDER_UPDATED',
          orderId: event.orderId as string,
          nextStatus: event.nextStatus as string,
        });
        break;
      }

      case 'order_ready': {
        dispatch({
          type: 'ORDER_READY',
          orderId: event.orderId as string,
          orderNumber: event.publicOrderNumber as string ?? '',
          pickupPointId: event.pickupPointId as string ?? '',
        });
        break;
      }
    }
  }, [loadSnapshot]);

  // ─── Polling fallback ─────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => {
      if (socketRef.current?.isConnected()) {
        stopPolling();
        return;
      }
      void loadSnapshot();
    }, pollInterval);
  }, [loadSnapshot, pollInterval]);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  // ─── Socket lifecycle ─────────────────────────────────────────

  useEffect(() => {
    // Initial REST load
    void loadSnapshot();

    // Create socket client
    const client = new SocketClient({
      url: apiUrl.replace('/api/v1', ''),
      token,
      room: `event:${eventId}`,
      onEvent: handleRealtimeEvent,
      onStatusChange: (status) => {
        dispatch({ type: 'SOCKET_STATUS', status });
        if (status === 'disconnected' || status === 'error') {
          startPolling();
        } else if (status === 'connected') {
          stopPolling();
        }
      },
      onResync: () => void loadSnapshot(),
    });

    socketRef.current = client;
    void client.connect();

    return () => {
      client.disconnect();
      socketRef.current = null;
      stopPolling();
    };
  }, [eventId, token, apiUrl]);

  // ─── Dismiss notification ─────────────────────────────────────

  const dismissNotification = useCallback(() => {
    dispatch({ type: 'SET_NOTIFICATION', notification: null });
  }, []);

  // ─── Order mutation helper ────────────────────────────────────

  function withLoading(orderId: string, fn: () => Promise<void>) {
    return async () => {
      dispatch({ type: 'ORDER_LOADING', orderId });
      try {
        await fn();
        // Optimistic update is handled by order_updated socket event.
        // If socket is down, refresh via REST.
        if (!socketRef.current?.isConnected()) {
          await loadSnapshot();
        }
      } catch (err) {
        console.error('[useDashboard] mutation failed:', err);
        await loadSnapshot(); // Resync on error
      } finally {
        dispatch({ type: 'ORDER_LOADED', orderId });
      }
    };
  }

  return {
    ...state,
    loadSnapshot,
    dismissNotification,
    withLoading,
    isOrderLoading: (id: string) => state.loadingOrderIds.has(id),
  };
}
