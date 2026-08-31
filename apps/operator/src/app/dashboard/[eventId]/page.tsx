'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { BRAND, BreakEatLogo } from '@break-eat/brand';
import { DashboardColumn } from '@/components/DashboardColumn';
import { NotificationPopup } from '@/components/NotificationPopup';
import { RecapPanel } from '@/components/RecapPanel';
import { LoginForm } from '@/components/LoginForm';
import { SlotBar } from '@/components/SlotBar';
import { useDashboard } from '@/hooks/useDashboard';
import { useSound } from '@/hooks/useSound';
import {
  cancelOrder,
  markOrderPickedUp,
  markOrderReady,
  startPreparingOrder,
  type Order,
  fetchSupplier,
  SESSION_EXPIREE,
  setSupplierStatus as apiSetSupplierStatus,
  type SupplierStatus,
} from '@/lib/api/orders-client';
import type { StatusVariant } from '@/components/StatusBadge';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/**
 * Le board, en trois colonnes — et rien d'autre a choisir.
 *
 * Le geste reel au comptoir tient en trois temps : la commande arrive, on la
 * prepare, on la remet. « Acceptee » n'en etait pas un : accepter et s'y mettre
 * sont le meme mouvement, et la colonne obligeait a cliquer deux fois.
 *
 * Chaque colonne REGROUPE plusieurs statuts. C'est deliberé : un statut sans
 * colonne est une commande invisible. Une commande restee en ACCEPTED (passee
 * par l'ancien parcours) s'affiche donc dans « En preparation », et une
 * commande remise en circulation (RECOVERED) revient dans « Nouvelles ».
 */
const LANES: { key: StatusVariant; statuses: string[] }[] = [
  { key: 'PAID', statuses: ['PAID', 'RECOVERED'] },
  { key: 'PREPARING', statuses: ['ACCEPTED', 'PREPARING'] },
  { key: 'READY', statuses: ['READY'] },
];

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

  // Ouverture de la buvette — pilotée ici, par l'équipier.
  const [orgId, setOrgId] = useState<string | null>(null);
  const [supplierStatus, setSupplierStatus] = useState<SupplierStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Read token + supplier assignment from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('operator_token');
    if (stored) setToken(stored);
    // Buvette transmise dans l'adresse (bouton « Ouvrir le poste » du dashboard
    // manager) : elle l'emporte sur celle memorisee. Un responsable qui ouvre le
    // poste de la buvette Sud doit voir le Sud, meme si son navigateur garde le
    // souvenir du Nord.
    const depuisUrl = new URLSearchParams(window.location.search).get('supplierId');
    const sid = depuisUrl ?? localStorage.getItem('operator_supplier_id');
    const sname = depuisUrl
      ? null
      : localStorage.getItem('operator_supplier_name');
    if (sid) { setSupplierId(sid); setSupplierName(sname); }
    setOrgId(localStorage.getItem('operator_org_id'));
  }, []);

  // Le serveur a refusé le jeton : on revient au formulaire, UNE fois.
  //
  // Un écouteur plutôt qu’un rechargement dans la couche réseau : le tableau
  // lance plusieurs appels au montage, et recharger au premier 401 relançait
  // les mêmes appels, donc le même 401 — l’écran « sautait » en boucle sans
  // jamais laisser reprendre la main.
  useEffect(() => {
    const surExpiration = () => setToken(null);
    window.addEventListener(SESSION_EXPIREE, surExpiration);
    return () => window.removeEventListener(SESSION_EXPIREE, surExpiration);
  }, []);

  // État courant de la buvette : le tableau de commandes ne le renvoie pas.
  useEffect(() => {
    if (!token || !orgId || !supplierId) return;
    fetchSupplier(orgId, supplierId, token)
      .then((s) => {
        setSupplierStatus(s.status);
        // Le nom arrive avec le statut : inutile de le deviner quand la
        // buvette vient de l’adresse plutot que du stockage local.
        setSupplierName((prec) => prec ?? s.name);
      })
      .catch(() => setSupplierStatus(null));
  }, [token, orgId, supplierId]);

  /**
   * Bascule ouvert / fermé.
   *
   * Fermer n'efface rien : les commandes déjà passées restent à préparer, seule
   * la prise de NOUVELLES commandes s'arrête. C'est pour ça que le libellé parle
   * de prise de commandes et non de fermeture tout court.
   */
  async function basculerOuverture() {
    if (!token || !orgId || !supplierId || !supplierStatus) return;
    const cible: SupplierStatus = supplierStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
    setStatusBusy(true);
    setStatusError('');
    try {
      const res = await apiSetSupplierStatus(orgId, supplierId, cible, token);
      setSupplierStatus(res.status);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Changement refusé');
    } finally {
      setStatusBusy(false);
    }
  }

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

  // Récap produits — masqué par défaut, ouvert à la demande pendant le service.
  const [recapOpen, setRecapOpen] = useState(false);

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
      onPrepare:  withLoading(orderId, () => startPreparingOrder(orderId, tok).then(() => undefined)),
      onReady:    withLoading(orderId, () => markOrderReady(orderId, tok).then(() => undefined)),
      onPickedUp: withLoading(orderId, () => markOrderPickedUp(orderId, tok).then(() => undefined)),
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
    // Phase 19 — fait pulser la carte quand le client s'est annoncé au retrait.
    customerArrivedAt: order.customerArrivedAt ?? null,
    isLoading: isOrderLoading(order.id),
    ...makeActions(order.id, token),
  });

  // Phase 11.4c — advance every order of a group to its next status in one go.
  // All members of a group share a status (grouping happens within a column),
  // so a single transition map suffices.
  const batchAdvance = async (orders: Order[]) => {
    if (orders.length === 0) return;
    const advance: Record<string, (id: string, t: string) => Promise<unknown>> = {
      PAID: startPreparingOrder,
      RECOVERED: startPreparingOrder,
      ACCEPTED: markOrderReady,
      PREPARING: markOrderReady,
      READY: markOrderPickedUp,
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

  const boardColumns = LANES.map((lane) => ({
    status: lane.key as string,
    orders: lane.statuses.flatMap((st) => data?.orders[st] ?? []),
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

        {/* Ouverture de la buvette — décidée par l'équipier, à son poste.
            Lui seul sait s'il a du monde, du stock et de quoi servir : ce
            réglage n'a rien à faire dans le dashboard du responsable. */}
        {supplierStatus && (
          <button
            type="button"
            onClick={() => void basculerOuverture()}
            disabled={statusBusy}
            title={
              supplierStatus === 'OPEN'
                ? 'Arrête la prise de nouvelles commandes. Celles en cours restent à préparer.'
                : 'Remet la buvette en service : les clients peuvent à nouveau commander.'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 13px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: statusBusy ? 'wait' : 'pointer',
              opacity: statusBusy ? 0.6 : 1,
              border: `1px solid ${supplierStatus === 'OPEN' ? '#6ee7b7' : '#fca5a5'}`,
              background: supplierStatus === 'OPEN' ? '#ecfdf5' : '#fef2f2',
              color: supplierStatus === 'OPEN' ? '#047857' : '#b91c1c',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: supplierStatus === 'OPEN' ? '#059669' : '#dc2626',
              }}
            />
            {statusBusy
              ? '…'
              : supplierStatus === 'OPEN'
                ? 'Buvette ouverte — fermer'
                : 'Buvette fermée — ouvrir'}
          </button>
        )}

        {statusError && (
          <span style={{ color: '#b91c1c', fontSize: 12 }}>{statusError}</span>
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
          {/* Le recap ne dependait que d'un ecran configure : il etait donc
              invisible ici, alors qu'il sert a chaque service. */}
          <HeaderButton
            onClick={() => setRecapOpen((v) => !v)}
            title="Récap produits"
            fontSize={13}
          >
            {recapOpen ? '📊 Récap ✓' : '📊 Récap'}
          </HeaderButton>
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

      {/* Créneaux de récupération — ouverts ou fermés par l’équipier.
          Placés juste sous l’en-tête : c’est le premier réglage qu’on
          touche en prenant son poste, avant même de regarder la file. */}
      {token && <SlotBar eventId={eventId} token={token} supplierId={supplierId} />}

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
          {recapOpen && (
            <RecapPanel
              orders={boardColumns.flatMap((c) => c.orders)}
              screenName={supplierName ?? 'Commandes en cours'}
              onHide={() => setRecapOpen(false)}
            />
          )}
        </div>
      )}
    </main>
  );
}
