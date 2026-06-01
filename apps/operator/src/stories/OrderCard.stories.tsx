import type { Meta, StoryObj } from '@storybook/react';

/**
 * OrderCard — placeholder component scaffolded for Storybook Phase 6.
 *
 * The real implementation (swipe actions, timer, item list) will be
 * built in Phase 8 when the operator dashboard design is finalized.
 */

interface OrderItem {
  name: string;
  quantity: number;
}

interface OrderCardProps {
  orderNumber: string;
  status: 'PAID' | 'ACCEPTED' | 'PREPARING' | 'READY';
  items: OrderItem[];
  createdAt: string;
  onAccept?: () => void;
  onPrepare?: () => void;
  onReady?: () => void;
}

const STATUS_LABEL: Record<OrderCardProps['status'], string> = {
  PAID: 'En attente',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
};

const STATUS_COLOR: Record<OrderCardProps['status'], string> = {
  PAID: '#f59e0b',
  ACCEPTED: '#3b82f6',
  PREPARING: '#8b5cf6',
  READY: '#10b981',
};

function OrderCard({ orderNumber, status, items, createdAt, onAccept, onPrepare, onReady }: OrderCardProps) {
  const color = STATUS_COLOR[status];
  return (
    <div
      style={{
        border: `2px solid ${color}`,
        borderRadius: 12,
        padding: 16,
        width: 280,
        fontFamily: 'sans-serif',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>#{orderNumber}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            background: color + '20',
            color,
            padding: '2px 8px',
            borderRadius: 99,
          }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>
        {new Date(createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}>
            <span>{it.name}</span>
            <span style={{ fontWeight: 600 }}>×{it.quantity}</span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8 }}>
        {status === 'PAID' && (
          <button
            onClick={onAccept}
            style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', cursor: 'pointer', fontWeight: 600 }}
          >
            Accepter
          </button>
        )}
        {status === 'ACCEPTED' && (
          <button
            onClick={onPrepare}
            style={{ flex: 1, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', cursor: 'pointer', fontWeight: 600 }}
          >
            Préparer
          </button>
        )}
        {status === 'PREPARING' && (
          <button
            onClick={onReady}
            style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', cursor: 'pointer', fontWeight: 600 }}
          >
            Prête ✓
          </button>
        )}
      </div>
    </div>
  );
}

const meta: Meta<typeof OrderCard> = {
  title: 'Operator/OrderCard',
  component: OrderCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof OrderCard>;

const ITEMS = [
  { name: 'Burger Classic', quantity: 2 },
  { name: 'Frites', quantity: 2 },
  { name: 'Coca-Cola', quantity: 1 },
];

export const Paid: Story = {
  args: { orderNumber: 'BE-00000042', status: 'PAID', items: ITEMS, createdAt: new Date().toISOString() },
};

export const Accepted: Story = {
  args: { orderNumber: 'BE-00000043', status: 'ACCEPTED', items: ITEMS, createdAt: new Date().toISOString() },
};

export const Preparing: Story = {
  args: { orderNumber: 'BE-00000044', status: 'PREPARING', items: ITEMS, createdAt: new Date().toISOString() },
};

export const Ready: Story = {
  args: { orderNumber: 'BE-00000045', status: 'READY', items: ITEMS, createdAt: new Date().toISOString() },
};
