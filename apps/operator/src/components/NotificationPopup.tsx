'use client';

import { useEffect } from 'react';
import { Bell, CheckCircle2 } from 'lucide-react';
import { BRAND } from '@break-eat/brand';
import { STATUS_COLORS } from './StatusBadge';

/**
 * NotificationPopup — full-screen overlay for new orders and ready notifications.
 * Auto-dismisses after `duration` ms.
 */

export type NotificationType = 'new_order' | 'order_ready';

export interface NotificationData {
  type: NotificationType;
  orderNumber: string;
  /** For order_ready: the pickup point label (if available) */
  pickupPointId?: string;
}

interface NotificationPopupProps {
  notification: NotificationData | null;
  onDismiss: () => void;
  duration?: number;
}

export function NotificationPopup({
  notification,
  onDismiss,
  duration = 4000,
}: NotificationPopupProps) {
  // Auto-dismiss
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [notification, onDismiss, duration]);

  if (!notification) return null;

  const isReady = notification.type === 'order_ready';
  const bg = isReady ? STATUS_COLORS.READY : BRAND.orange;
  const Icon = isReady ? CheckCircle2 : Bell;
  const title = isReady ? 'Commande prête !' : 'Nouvelle commande !';

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 16,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: bg,
          color: '#fff',
          borderRadius: 12,
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 8px 24px rgba(28,25,23,0.22)',
          cursor: 'pointer',
          animation: 'slideDown 0.3s ease',
          minWidth: 280,
          fontFamily: BRAND.font,
        }}
      >
        <Icon size={28} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            #{notification.orderNumber}
            {notification.pickupPointId && ` — Point de retrait : ${notification.pickupPointId}`}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: 18 }}>✕</span>
      </div>

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-40px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
