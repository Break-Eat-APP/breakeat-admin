'use client';

/**
 * StatusBadge — colored pill for OrderStatus values.
 * Matches the 8 OrderStatus variants from @prisma/client.
 */

export type StatusVariant =
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RECOVERED';

/**
 * Single source of truth for OrderStatus colors / labels across the operator
 * board (StatusBadge, OrderCard, DashboardColumn all import from here).
 *
 * Refonte v2 palette — brand-coherent. PAID = brand orange (#FC4002) because a
 * new order IS the primary attention state; the other statuses keep a refined,
 * muted semantic code so operators can triage at a glance (standard for a KDS).
 */
export const STATUS_COLORS: Record<StatusVariant, string> = {
  PAID:      '#FC4002', // brand orange — nouvelle commande, à traiter
  ACCEPTED:  '#2563EB', // bleu — acceptée
  PREPARING: '#7C3AED', // violet — en préparation
  READY:     '#059669', // vert — prête au retrait
  PICKED_UP: '#0891B2', // cyan — récupérée
  COMPLETED: '#78716C', // gris chaud — terminée
  CANCELLED: '#DC2626', // rouge — annulée
  RECOVERED: '#D97706', // ambre — récupération en salle
};

export const STATUS_LABELS: Record<StatusVariant, string> = {
  PAID:      'En attente',
  ACCEPTED:  'Acceptée',
  PREPARING: 'En préparation',
  READY:     'Prête ✓',
  PICKED_UP: 'Récupérée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  RECOVERED: 'Récupérée (salle)',
};

interface StatusBadgeProps {
  status: StatusVariant;
  /** Override label — defaults to STATUS_LABELS[status] */
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const fontSize = size === 'sm' ? 10 : 12;
  const padding = size === 'sm' ? '1px 6px' : '2px 10px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding,
        borderRadius: 999,
        fontSize,
        fontWeight: 700,
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  );
}
