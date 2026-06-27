'use client';

import { useState } from 'react';
import { BRAND } from '@break-eat/brand';
import { OrderCard, elapsed, type OrderCardProps } from './OrderCard';
import { StatusBadge, STATUS_COLORS, type StatusVariant } from './StatusBadge';
import type { Order } from '@/lib/api/orders-client';
import type { OrderGroup } from '@/lib/screens/grouping';

/**
 * OrderGroupCard (Phase 11.4c) — renders one cluster of identical baskets.
 *
 * A group of one is just a normal OrderCard (zero visual noise for unique
 * orders). A group of many is a "stacked" card: the shared composition is
 * shown once, every member's order number is listed as a badge, and the prep
 * team gets a single batch-advance button so the whole batch moves to the next
 * status together — plus an expander to reveal each individual card (with its
 * own per-order recover / cancel actions) when they need to act on just one.
 */

/** Next-step label per status (omitted statuses get no batch button). */
const BATCH_LABEL: Partial<Record<StatusVariant, (n: number) => string>> = {
  PAID: (n) => `Accepter les ${n}`,
  ACCEPTED: (n) => `Préparer les ${n}`,
  PREPARING: (n) => `Marquer ${n} prêtes ✓`,
  READY: (n) => `Récupérées ×${n}`,
  RECOVERED: (n) => `Ré-accepter les ${n}`,
};

const MAX_BADGES = 10;

export interface OrderGroupCardProps {
  group: OrderGroup;
  status: StatusVariant;
  toCardProps: (order: Order) => OrderCardProps;
  onBatchAdvance?: (orders: Order[]) => void | Promise<void>;
}

export function OrderGroupCard({
  group,
  status,
  toCardProps,
  onBatchAdvance,
}: OrderGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // A lone order needs no grouping chrome — render the normal card.
  if (group.size === 1) {
    return <OrderCard {...toCardProps(group.orders[0])} />;
  }

  const color = STATUS_COLORS[status] ?? BRAND.inkSoft;
  const totalUnits = group.composition.reduce((s, l) => s + l.quantity, 0) * group.size;
  const oldest = group.orders.reduce((a, b) =>
    new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? a : b,
  );
  const batchLabel = BATCH_LABEL[status];
  const shownBadges = group.orders.slice(0, MAX_BADGES);
  const extraBadges = group.size - shownBadges.length;

  const runBatch = async () => {
    if (!onBatchAdvance || busy) return;
    setBusy(true);
    try {
      await onBatchAdvance(group.orders);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 280,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      {/* Faux "stack" peeking behind to signal multiple identical orders. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          transform: 'translate(6px, 6px)',
          background: '#fff',
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          transform: 'translate(3px, 3px)',
          background: '#fff',
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          border: `1px solid ${BRAND.border}`,
          borderLeft: `4px solid ${color}`,
          borderRadius: 12,
          padding: 14,
          background: '#fff',
          boxShadow: '0 1px 2px rgba(45,41,38,0.05), 0 4px 14px rgba(45,41,38,0.05)',
          fontFamily: BRAND.font,
          color: BRAND.ink,
        }}
      >
        {/* Header: count chip + status */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: BRAND.orange,
              color: '#fff',
              borderRadius: 999,
              padding: '2px 10px',
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            🧩 {group.size} commandes
          </span>
          <StatusBadge status={status} size="sm" />
        </div>

        {/* Volume + age of the oldest member */}
        <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: 8 }}>
          {totalUnits} articles au total · la plus ancienne il y a {elapsed(oldest.createdAt)}
        </div>

        {/* Order-number badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {shownBadges.map((o) => (
            <span
              key={o.id}
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: BRAND.inkSoft,
                background: BRAND.bgSubtle,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 6,
                padding: '1px 6px',
              }}
            >
              #{o.publicOrderNumber}
            </span>
          ))}
          {extraBadges > 0 && (
            <span style={{ fontSize: 11, fontWeight: 800, color: BRAND.grey, padding: '1px 4px' }}>
              +{extraBadges}
            </span>
          )}
        </div>

        {/* Shared composition (shown once for the whole group) */}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0' }}>
          {group.composition.map((l) => (
            <li
              key={l.productId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
                padding: '2px 0',
                borderBottom: `1px solid ${BRAND.border}`,
              }}
            >
              <span>{l.productNameSnapshot}</span>
              <span style={{ fontWeight: 700, color: BRAND.inkSoft }}>
                ×{l.quantity}
                <span style={{ fontWeight: 400, color: BRAND.grey, marginLeft: 4, fontSize: 11 }}>
                  ({l.quantity * group.size} au total)
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* Batch action + expand toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: expanded ? 10 : 0 }}>
          {batchLabel && onBatchAdvance && (
            <button
              onClick={runBatch}
              disabled={busy}
              style={{
                flex: 1,
                background: busy ? BRAND.bgSubtle : color,
                color: busy ? BRAND.grey : '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '7px 0',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'inherit',
                transition: 'background 0.1s',
              }}
            >
              {batchLabel(group.size)}
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              flexShrink: 0,
              flex: batchLabel && onBatchAdvance ? undefined : 1,
              background: '#fff',
              color: BRAND.inkSoft,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 8,
              padding: '7px 10px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {expanded ? 'Masquer ▴' : `Voir les ${group.size} ▾`}
          </button>
        </div>

        {/* Expanded individual cards — each keeps its own per-order actions. */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.orders.map((o) => (
              <OrderCard key={o.id} {...toCardProps(o)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
