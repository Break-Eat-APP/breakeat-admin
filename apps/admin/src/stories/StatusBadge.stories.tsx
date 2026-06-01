import type { Meta, StoryObj } from '@storybook/react';

/**
 * StatusBadge — placeholder component scaffolded for Storybook Phase 6.
 *
 * The real implementation (colors, variants, icon) will be built in Phase 8
 * when the operator dashboard design is finalized.
 *
 * Variants match OrderStatus from @prisma/client:
 *   PAID | ACCEPTED | PREPARING | READY | PICKED_UP | COMPLETED | CANCELLED | RECOVERED
 */

type StatusVariant =
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RECOVERED';

const STATUS_COLORS: Record<StatusVariant, string> = {
  PAID: '#f59e0b',
  ACCEPTED: '#3b82f6',
  PREPARING: '#8b5cf6',
  READY: '#10b981',
  PICKED_UP: '#06b6d4',
  COMPLETED: '#6b7280',
  CANCELLED: '#ef4444',
  RECOVERED: '#f97316',
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
}

function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: STATUS_COLORS[status] + '20',
        color: STATUS_COLORS[status],
        border: `1px solid ${STATUS_COLORS[status]}40`,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {label ?? status}
    </span>
  );
}

const meta: Meta<typeof StatusBadge> = {
  title: 'Admin/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    status: {
      control: 'select',
      options: Object.keys(STATUS_COLORS),
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Paid: Story = { args: { status: 'PAID' } };
export const Accepted: Story = { args: { status: 'ACCEPTED' } };
export const Preparing: Story = { args: { status: 'PREPARING' } };
export const Ready: Story = { args: { status: 'READY' } };
export const PickedUp: Story = { args: { status: 'PICKED_UP' } };
export const Completed: Story = { args: { status: 'COMPLETED' } };
export const Cancelled: Story = { args: { status: 'CANCELLED' } };
export const Recovered: Story = { args: { status: 'RECOVERED' } };

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {(Object.keys(STATUS_COLORS) as StatusVariant[]).map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};
