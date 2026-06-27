'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { BRAND, BreakEatLogo } from '@break-eat/brand';
import { DashboardColumn } from '@/components/DashboardColumn';
import { NotificationPopup } from '@/components/NotificationPopup';
import { RecapPanel } from '@/components/RecapPanel';
import { LoginForm } from '@/components/LoginForm';
import { useDashboard } from '@/hooks/useDashboard';
import { useSound } from '@/hooks/useSound';
import {
  acceptOrder,
  cancelOrder,
  fetchResolvedScreens,
  markOrderPickedUp,
  markOrderReady,
  recoverOrder,
  startPreparingOrder,
  type Order,
  type ResolvedOperatorScreen,
} from '@/lib/api/orders-client';
import { buildScreenColumns, countScreenOrders } from '@/lib/screens/filter';
import type { StatusVariant } from '@/components/StatusBadge';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

// Fallback board used only when no operator screens are configured for the event.
const FALLBACK_COLUMNS: StatusVariant[] = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'RECOVERED'];

// ─── Connection status indicator ─────────────────────────────────────────────

function ConnectionBadge({ status }: { status: string }) {
  const cfg = {
    connected:    { bg: '#d1fae5', color: '#065f46', dot: '#10b981', label: 'Connecté' },
    connecting:   { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', label: 'Connexion...' },
    disconnected: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Déconnecté' },
    error:        { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Erreur réseau' },
  }[status] ?? { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af', label: status };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: cfg.dot,
          display: 'inline-block',
        }}
      />
      {cfg.label}
    </div>
  );
}

// ─── Header button (white / orange hover) ────────────────────────────────────

function HeaderButton({
  onClick,
  title,
  children,
  fontSize = 14,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  fontSize?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: '#fff',
        color: BRAND.inkSoft,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 8,
        padding: '6px 11px',
        cursor: 'pointer',
        fontSize,
        fontWeight: 600,
        fontFamily: 'inherit',
        lineHeight: 1,
        transition: 'border-color 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = BRAND.orange;
        e.currentTarget.style.color = BRAND.orange;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BRAND.border;
        e.currentTarget.style.color = BRAND.inkSoft;
      }}
    >
      {children}
    </button>
  );
}

// ─── Screen tab bar (Phase 11.4) ─────────────────────────────────────────────

function ScreenTabBar({
  screens,
  activeScreenId,
  dashboardOrders,
  onSelect,
}: {
  screens: ResolvedOperatorScreen[];
  activeScreenId: string | null;
  dashboardOrders: Record<string, Order[]>;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '10px 16px 0',
        overflowX: 'auto',
        flexShrink: 0,
        alignItems: 'center',
      }}
    >
      {screens.map((screen) => {
        const isActive = screen.eventScreenId === activeScreenId;
        const count = countScreenOrders(dashboardOrders, screen);
        return (
          <button
            key={screen.eventScreenId}
            onClick={() => onSelect(screen.eventScreenId)}
            title={screen.name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              background: isActive ? BRAND.orange : '#fff',
              color: isActive ? '#fff' : BRAND.inkSoft,
              border: `1px solid ${isActive ? BRAND.orange : BRAND.border}`,
              borderRadius: 10,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              transition: 'background 0.12s, border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.borderColor = BRAND.orange;
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.borderColor = BRAND.border;
            }}
          >
            {screen.icon && <span aria-hidden>{screen.icon}</span>}
            <span>{screen.name}</span>
            <span
              style={{
                background: isActive ? 'rgba(255,255,255,0.25)' : BRAND.bgSubtle,
                color: isActive ? '#fff' : BRAND.grey,
                borderRadius: 999,
                padding: '1px 8px',
                fontSize: 12,
                fontWeight: 800,
                minWidth: 22,
                textAlign: 'center',
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [token, setToken] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Phase 12.9 — supplier filter
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const { playNewOrder, playOrderReady } = useSound();
  const prevNotification = useRef<string | null>(null);

  // Read token + supplier assignment from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('operator_token');
    if (stored) setToken(stored);
    const sid = localStorage.getItem('operator_supplier_id');
    const sname = localStorage.getItem('operator_supplier_name');
    if (sid) { setSupplierId(sid); setSupplierName(sname); }
  }, []);

  const {
    data,
    isLoading,
    error,
    socketStatus,
    notification,
    dismissNotification,
    loadSnapshot,
    withLoading,
    isOrderLoading,
  } = useDashboard({ eventId, token: token ?? '', apiUrl: API_URL, supplierId });

  // Phase 11.4 — configurable operator screens (static config, fetched once).
  const [screens, setScreens] = useState<ResolvedOperatorScreen[]>([]);
  const [activeScreenId, setActiveScreenId] = useState<string | null>(null);

  const loadScreens = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetchResolvedScreens(eventId, token, supplierId);
      const enabled = res.screens.filter((s) => s.enabled);
      setScreens(enabled);
      setActiveScreenId((prev) =>
        prev && enabled.some((s) => s.eventScreenId === prev)
          ? prev
          : (enabled[0]?.eventScreenId ?? null),
      );
    } catch {
      // No screens configured / endpoint unavailable → fall back to legacy board.
      setScreens([]);
    }
  }, [eventId, token, supplierId]);

  useEffect(() => {
    void loadScreens();
  }, [loadScreens]);

  const activeScreen = useMemo(
    () => screens.find((s) => s.eventScreenId === activeScreenId) ?? screens[0] ?? null,
    [screens, activeScreenId],
  );

  // Récap produits panel — defaults to the active screen's showRecap flag, but
  // the operator can toggle it on/off freely during service.
  const [recapOpen, setRecapOpen] = useState(false);
  useEffect(() => {
    setRecapOpen(activeScreen?.filters?.showRecap ?? false);
  }, [activeScreen]);

  // Phase 11.4c — stack identical baskets into grouped cards (off by default so
  // the board behaves exactly as before until the operator opts in).
  const [grouped, setGrouped] = useState(false);

  // Surfaces a partial-failure notice from a batch advance (see batchAdvance).
  const [batchError, setBatchError] = useState<string | null>(null);

  // Sound effects on new notifications
  useEffect(() => {
    if (!notification || notification.orderNumber === prevNotification.current) return;
    prevNotification.current = notification.orderNumber;
    if (notification.type === 'new_order') playNewOrder();
    else if (notification.type === 'order_ready') playOrderReady();
  }, [notification, playNewOrder, playOrderReady]);

  // Sync fullscreen state with actual browser state (handles Esc key)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  // Build callbacks for each order action
  function makeActions(orderId: string, tok: string) {
    return {
      onAccept:   withLoading(orderId, () => acceptOrder(orderId, tok).then(() => undefined)),
      onPrepare:  withLoading(orderId, () => startPreparingOrder(orderId, tok).then(() => undefined)),
      onReady:    withLoading(orderId, () => markOrderReady(orderId, tok).then(() => undefined)),
      onPickedUp: withLoading(orderId, () => markOrderPickedUp(orderId, tok).then(() => undefined)),
      onRecover:  withLoading(orderId, () => recoverOrder(orderId, tok).then(() => undefined)),
      onCancel:   withLoading(orderId, () => cancelOrder(orderId, tok).then(() => undefined)),
    };
  }

  if (!token) return <LoginForm onLogin={setToken} />;

  // Map an Order to OrderCard props (actions + loading flag bound per order).
  const toCardProps = (order: Order) => ({
    id: order.id,
    orderNumber: order.publicOrderNumber,
    status: order.status as StatusVariant,
    items: order.items,
    createdAt: order.createdAt,
    isLoading: isOrderLoading(order.id),
    ...makeActions(order.id, token),
  });

  // Phase 11.4c — advance every order of a group to its next status in one go.
  // All members of a group share a status (grouping happens within a column),
  // so a single transition map suffices.
  const batchAdvance = async (orders: Order[]) => {
    if (orders.length === 0) return;
    const advance: Record<string, (id: string, t: string) => Promise<unknown>> = {
      PAID: acceptOrder,
      ACCEPTED: startPreparingOrder,
      PREPARING: markOrderReady,
      READY: markOrderPickedUp,
      RECOVERED: acceptOrder,
    };
    const fn = advance[orders[0].status];
    if (!fn) return;
    setBatchError(null);
    // allSettled (not all): a transition that fails mid-batch must NOT abort the
    // rest, and we ALWAYS reload so the board reflects exactly which orders
    // actually advanced — never a stale optimistic guess.
    const results = await Promise.allSettled(orders.map((o) => fn(o.id, token)));
    await loadSnapshot();
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      setBatchError(
        `${failed}/${orders.length} commande${failed > 1 ? 's' : ''} n'ont pas pu être avancée${failed > 1 ? 's' : ''}. Le tableau a été rafraîchi — réessaie sur celles encore en attente.`,
      );
    }
  };

  // Phase 11.4 — the board renders the active configured screen's columns when
  // screens exist, otherwise it falls back to the legacy fixed Kanban.
  const useScreens = screens.length > 0 && activeScreen !== null;
  const boardColumns =
    data && useScreens && activeScreen
      ? buildScreenColumns(data.orders, activeScreen)
      : FALLBACK_COLUMNS.map((status) => ({
          status: status as string,
          orders: data?.orders[status] ?? [],
        }));

  return (
    <main
      style={{
        minHeight: '100vh',
        background: BRAND.bgSubtle,
        fontFamily: BRAND.font,
        color: BRAND.ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          background: '#fff',
          borderBottom: `1px solid ${BRAND.border}`,
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <BreakEatLogo size={26} />
          <span style={{ fontWeight: 700, fontSize: 16, color: BRAND.ink, letterSpacing: -0.2 }}>
            BREAKEAT
          </span>
        </div>
        <span style={{ color: BRAND.grey, fontSize: 13 }}>Dashboard opérateur</span>
        {supplierName ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: BRAND.orangeTint,
            border: `1px solid ${BRAND.orangeSoft}`,
            borderRadius: 8,
            padding: '3px 11px',
            fontSize: 13,
            fontWeight: 700,
            color: BRAND.orangeDark,
          }}>
            <Store size={14} strokeWidth={2} style={{ flexShrink: 0 }} /> {supplierName}
          </span>
        ) : (
          <span style={{ color: BRAND.grey, fontSize: 12, fontFamily: 'monospace' }}>{eventId}</span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {data && (
            <span style={{ color: BRAND.grey, fontSize: 12, fontWeight: 600 }}>
              {Object.values(data.counts).reduce((s, n) => s + n, 0)} commandes actives
            </span>
          )}
          <ConnectionBadge status={socketStatus} />
          {data && (
            <HeaderButton
              onClick={() => setGrouped((v) => !v)}
              title="Regrouper les commandes identiques"
              fontSize={13}
            >
              {grouped ? '🧩 Groupé ✓' : '🧩 Grouper'}
            </HeaderButton>
          )}
          {useScreens && (
            <HeaderButton
              onClick={() => setRecapOpen((v) => !v)}
              title="Récap produits"
              fontSize={13}
            >
              {recapOpen ? '📊 Récap ✓' : '📊 Récap'}
            </HeaderButton>
          )}
          <HeaderButton onClick={() => void loadSnapshot()} title="Actualiser">
            ↺
          </HeaderButton>
          <HeaderButton
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
          >
            {isFullscreen ? '⊠' : '⊞'}
          </HeaderButton>
          <HeaderButton
            onClick={() => { localStorage.removeItem('operator_token'); setToken(null); }}
            title="Se déconnecter"
            fontSize={13}
          >
            Déconnexion
          </HeaderButton>
        </div>
      </header>

      {/* Notification overlay */}
      <NotificationPopup notification={notification} onDismiss={dismissNotification} />

      {/* Loading / error */}
      {isLoading && !data && (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          Chargement du tableau de bord…
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, margin: 16, borderRadius: 8, fontSize: 14 }}>
          Erreur : {error}
        </div>
      )}
      {batchError && (
        <div
          role="alert"
          onClick={() => setBatchError(null)}
          style={{ background: '#fef3c7', color: '#92400e', padding: 12, margin: '0 16px 8px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
        >
          ⚠ {batchError} <span style={{ textDecoration: 'underline' }}>Masquer</span>
        </div>
      )}

      {/* Screen tabs (Phase 11.4) — only when screens are configured */}
      {data && useScreens && (
        <ScreenTabBar
          screens={screens}
          activeScreenId={activeScreen?.eventScreenId ?? null}
          dashboardOrders={data.orders}
          onSelect={setActiveScreenId}
        />
      )}

      {/* Kanban board (active screen, or legacy fallback) + Récap panel */}
      {data && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: 16,
            flex: 1,
            minHeight: 0,
            alignItems: 'stretch',
          }}
        >
          {/* Columns — scroll horizontally independently of the panel */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              flex: 1,
              alignItems: 'flex-start',
            }}
          >
            {boardColumns.map(({ status, orders }) => (
              <DashboardColumn
                key={status}
                status={status as StatusVariant}
                orders={orders}
                toCardProps={toCardProps}
                grouped={grouped}
                onBatchAdvance={batchAdvance}
                hasNew={status === 'PAID' && notification?.type === 'new_order'}
              />
            ))}
          </div>

          {/* Récap produits — derived from the active screen's visible orders */}
          {recapOpen && useScreens && activeScreen && (
            <RecapPanel
              orders={boardColumns.flatMap((c) => c.orders)}
              screenName={activeScreen.name}
              onHide={() => setRecapOpen(false)}
            />
          )}
        </div>
      )}
    </main>
  );
}
