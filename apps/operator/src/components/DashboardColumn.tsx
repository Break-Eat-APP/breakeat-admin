'use client';

import { BRAND } from '@break-eat/brand';
import { OrderCard, type OrderCardProps } from './OrderCard';
import { OrderGroupCard } from './OrderGroupCard';
import { STATUS_COLORS, type StatusVariant } from './StatusBadge';
import type { Order } from '@/lib/api/orders-client';
import { groupSimilarOrders } from '@/lib/screens/grouping';

/**
 * DashboardColumn — one vertical lane on the operator board.
 * Shows a header with status label + count, then stacked OrderCards.
 */

const COLUMN_HEADERS: Record<StatusVariant, string> = {
  PAID:      '🔔 Nouvelles',
  ACCEPTED:  '👍 Acceptées',
  PREPARING: '🍳 En préparation',
  READY:     '✅ Prêtes',
  PICKED_UP: '📦 Récupérées',
  COMPLETED: '✔ Terminées',
  CANCELLED: '✕ Annulées',
  RECOVERED: '↩ Récupération',
};

export interface DashboardColumnProps {
  status: StatusVariant;
  /** Raw orders for this lane; mapped to card props lazily so the column can
   *  also cluster them into groups (Phase 11.4c). */
  orders: Order[];
  toCardProps: (order: Order) => OrderCardProps;
  /** When true, identical baskets are stacked into a single grouped card. */
  grouped?: boolean;
  /** Advances every order of a group to the next status in one click. */
  onBatchAdvance?: (orders: Order[]) => void | Promise<void>;
  /** If true, shows a pulsing indicator for new arrivals */
  hasNew?: boolean;
}

export function DashboardColumn({
  status,
  orders,
  toCardProps,
  grouped = false,
  onBatchAdvance,
  hasNew = false,
}: DashboardColumnProps) {
  const headerColor = STATUS_COLORS[status] ?? BRAND.inkSoft;

  return (
    <div
      style={{
        minWidth: 300,
        maxWidth: 320,
        flex: '0 0 300px',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: BRAND.bgSubtle,
        border: `1px solid ${BRAND.border}`,
        borderTop: `3px solid ${headerColor}`,
        padding: '12px 10px',
        gap: 10,
        fontFamily: BRAND.font,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 14, color: headerColor }}>
          {COLUMN_HEADERS[status]}
          {hasNew && (
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: BRAND.orange,
                marginLeft: 6,
                animation: 'pulse 1s infinite',
              }}
            />
          )}
        </span>
        <span
          style={{
            background: headerColor,
            color: '#fff',
            borderRadius: 999,
            padding: '1px 8px',
            fontSize: 12,
            fontWeight: 800,
            minWidth: 24,
            textAlign: 'center',
          }}
        >
          {orders.length}
        </span>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            color: BRAND.grey,
            fontSize: 13,
            padding: '24px 0',
          }}
        >
          Aucune commande
        </div>
      )}

      {/* Order cards — flat, or stacked into groups of identical baskets */}
      {!grouped && orders.map((order) => <OrderCard key={order.id} {...toCardProps(order)} />)}
      {grouped &&
        groupSimilarOrders(orders).map((group) => (
          <OrderGroupCard
            key={group.signature}
            group={group}
            status={status}
            toCardProps={toCardProps}
            onBatchAdvance={onBatchAdvance}
          />
        ))}
    </div>
  );
}
