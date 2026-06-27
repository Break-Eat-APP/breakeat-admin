'use client';

import { BRAND } from '@break-eat/brand';
import { StatusBadge, STATUS_COLORS, type StatusVariant } from './StatusBadge';

/**
 * OrderCard — displays a single order on the operator dashboard.
 *
 * Shows: order number, status badge, items list, elapsed time,
 * and a primary action button for the next allowed transition.
 */

export interface OrderItem {
  id: string;
  productNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
}

export interface OrderCardProps {
  id: string;
  orderNumber: string;
  status: StatusVariant;
  items: OrderItem[];
  createdAt: string;
  isLoading?: boolean;
  onAccept?: () => void;
  onPrepare?: () => void;
  onReady?: () => void;
  onPickedUp?: () => void;
  onRecover?: () => void;
  onCancel?: () => void;
}

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

export function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

export function OrderCard({
  orderNumber,
  status,
  items,
  createdAt,
  isLoading = false,
  onAccept,
  onPrepare,
  onReady,
  onPickedUp,
  onRecover,
  onCancel,
}: OrderCardProps) {
  const color = STATUS_COLORS[status] ?? '#6b7280';

  return (
    <div
      style={{
        border: `1px solid ${BRAND.border}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 12,
        padding: 14,
        width: '100%',
        maxWidth: 280,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(45,41,38,0.05), 0 4px 14px rgba(45,41,38,0.05)',
        opacity: isLoading ? 0.6 : 1,
        transition: 'opacity 0.15s',
        fontFamily: BRAND.font,
        color: BRAND.ink,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>#{orderNumber}</span>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* Elapsed time */}
      <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: 10 }}>
        Il y a {elapsed(createdAt)}
      </div>

      {/* Items */}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0' }}>
        {items.map((it) => (
          <li
            key={it.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              padding: '2px 0',
              borderBottom: `1px solid ${BRAND.border}`,
            }}
          >
            <span>{it.productNameSnapshot}</span>
            <span style={{ fontWeight: 700, color: BRAND.inkSoft }}>
              ×{it.quantity}
              <span style={{ fontWeight: 400, color: BRAND.grey, marginLeft: 4, fontSize: 11 }}>
                ({formatCents(it.unitPriceCentsSnapshot * it.quantity)})
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        {status === 'PAID' && (
          <ActionButton color={STATUS_COLORS.ACCEPTED} label="Accepter" onClick={onAccept} disabled={isLoading} />
        )}
        {status === 'ACCEPTED' && (
          <ActionButton color={STATUS_COLORS.PREPARING} label="Préparer" onClick={onPrepare} disabled={isLoading} />
        )}
        {status === 'PREPARING' && (
          <ActionButton color={STATUS_COLORS.READY} label="Prête ✓" onClick={onReady} disabled={isLoading} />
        )}
        {status === 'READY' && (
          <ActionButton color={STATUS_COLORS.PICKED_UP} label="Récupérée" onClick={onPickedUp} disabled={isLoading} />
        )}
        {status === 'RECOVERED' && (
          <ActionButton color={STATUS_COLORS.ACCEPTED} label="Ré-accepter" onClick={onAccept} disabled={isLoading} />
        )}
        {/* Recovery button for PAID/ACCEPTED/PREPARING */}
        {['PAID', 'ACCEPTED', 'PREPARING'].includes(status) && (
          <SmallButton color={STATUS_COLORS.RECOVERED} label="↩" title="Récupérer" onClick={onRecover} disabled={isLoading} />
        )}
        {/* Cancel button for PAID/ACCEPTED/PREPARING */}
        {['PAID', 'ACCEPTED', 'PREPARING'].includes(status) && (
          <SmallButton color={STATUS_COLORS.CANCELLED} label="✕" title="Annuler" onClick={onCancel} disabled={isLoading} />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  color,
  label,
  onClick,
  disabled,
}: {
  color: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: disabled ? BRAND.bgSubtle : color,
        color: disabled ? BRAND.grey : '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '7px 0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        fontSize: 13,
        fontFamily: 'inherit',
        transition: 'background 0.1s',
      }}
    >
      {label}
    </button>
  );
}

function SmallButton({
  color,
  label,
  title,
  onClick,
  disabled,
}: {
  color: string;
  label: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flexShrink: 0,
        background: disabled ? BRAND.bgSubtle : color + '22',
        color: disabled ? BRAND.grey : color,
        border: `1px solid ${color}44`,
        borderRadius: 8,
        padding: '7px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
