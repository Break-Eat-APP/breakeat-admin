import type { Meta, StoryObj } from '@storybook/react';
import { DashboardColumn } from '@/components/DashboardColumn';
import type { OrderCardProps } from '@/components/OrderCard';
import type { StatusVariant } from '@/components/StatusBadge';
import type { Order, OrderItem } from '@/lib/api/orders-client';

const ITEMS: OrderItem[] = [
  {
    id: 'i1',
    productId: 'p-burger',
    productNameSnapshot: 'Burger Classic',
    unitPriceCentsSnapshot: 1200,
    quantity: 2,
    lineTotalCents: 2400,
  },
  {
    id: 'i2',
    productId: 'p-fries',
    productNameSnapshot: 'Frites',
    unitPriceCentsSnapshot: 400,
    quantity: 1,
    lineTotalCents: 400,
  },
];

const NOW = new Date().toISOString();
const THREE_MIN_AGO = new Date(Date.now() - 3 * 60_000).toISOString();

const fakeOrders = (n: number, status: string): Order[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `order-${i}`,
    publicOrderNumber: `BE-${String(i + 1).padStart(8, '0')}`,
    status,
    supplierId: 'sup-1',
    pickupPointId: 'pp-1',
    eventId: 'evt-1',
    organizationId: 'org-1',
    totalCents: 2800,
    currency: 'EUR',
    createdAt: i % 2 === 0 ? NOW : THREE_MIN_AGO,
    updatedAt: NOW,
    items: ITEMS,
  }));

const toCardProps = (order: Order): OrderCardProps => ({
  id: order.id,
  orderNumber: order.publicOrderNumber,
  status: order.status as StatusVariant,
  items: order.items,
  createdAt: order.createdAt,
  isLoading: false,
});

const meta: Meta<typeof DashboardColumn> = {
  title: 'Operator/DashboardColumn',
  component: DashboardColumn,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { toCardProps },
};

export default meta;
type Story = StoryObj<typeof DashboardColumn>;

export const EmptyPaid: Story = {
  name: 'PAID — Vide',
  args: { status: 'PAID', orders: [] },
};

export const PaidWithOrders: Story = {
  name: 'PAID — 3 nouvelles commandes',
  args: { status: 'PAID', orders: fakeOrders(3, 'PAID'), hasNew: true },
};

export const Preparing: Story = {
  name: 'PREPARING — 5 commandes',
  args: { status: 'PREPARING', orders: fakeOrders(5, 'PREPARING') },
};

export const Ready: Story = {
  name: 'READY — 2 prêtes',
  args: { status: 'READY', orders: fakeOrders(2, 'READY') },
};

export const Recovered: Story = {
  name: 'RECOVERED — 1 en récupération',
  args: { status: 'RECOVERED', orders: fakeOrders(1, 'RECOVERED') },
};

export const Grouped: Story = {
  name: 'PREPARING — 6 commandes identiques (groupées)',
  args: {
    status: 'PREPARING',
    orders: fakeOrders(6, 'PREPARING'),
    grouped: true,
    onBatchAdvance: async () => {},
  },
};
