'use client';

/**
 * PublicScreenRow — one row on the public ready screen.
 *
 * Privacy rule: shows ONLY the order number and pickup point label.
 * No customer name, no items, no financial data.
 */

export interface PublicScreenRowProps {
  orderNumber: string;
  pickupPointId: string;
  readyAt: string;
  /** Optional human-readable pickup point label */
  pickupLabel?: string;
  /** Highlight the row (e.g., just became ready) */
  isNew?: boolean;
}

function elapsedMin(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

export function PublicScreenRow({
  orderNumber,
  pickupLabel,
  readyAt,
  isNew = false,
}: PublicScreenRowProps) {
  const min = elapsedMin(readyAt);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 24px',
        borderRadius: 12,
        background: isNew ? '#d1fae5' : '#f0fdf4',
        border: `2px solid ${isNew ? '#10b981' : '#bbf7d0'}`,
        gap: 16,
        transition: 'background 0.5s, border-color 0.5s',
        animation: isNew ? 'highlight 2s ease' : undefined,
      }}
    >
      {/* Order number */}
      <span
        style={{
          fontWeight: 900,
          fontSize: 28,
          fontFamily: 'monospace',
          color: '#065f46',
          minWidth: 160,
        }}
      >
        #{orderNumber}
      </span>

      {/* Ready indicator */}
      <span
        style={{
          background: '#10b981',
          color: '#fff',
          borderRadius: 999,
          padding: '4px 14px',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        PRÊTE ✓
      </span>

      {/* Pickup point */}
      {pickupLabel && (
        <span style={{ fontSize: 16, color: '#374151', fontWeight: 600 }}>
          {pickupLabel}
        </span>
      )}

      {/* Elapsed */}
      <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b7280' }}>
        {min < 1 ? 'À l\'instant' : `Il y a ${min} min`}
      </span>

      <style>{`
        @keyframes highlight {
          0%   { background: #6ee7b7; }
          100% { background: #f0fdf4; }
        }
      `}</style>
    </div>
  );
}
