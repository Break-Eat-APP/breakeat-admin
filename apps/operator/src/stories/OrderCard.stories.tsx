import type { Meta, StoryObj } from '@storybook/react';
import { OrderCard } from '@/components/OrderCard';

const ITEMS = [
  { id: 'i1', productNameSnapshot: 'Burger Classic', unitPriceCentsSnapshot: 1200, quantity: 2 },
  { id: 'i2', productNameSnapshot: 'Frites',         unitPriceCentsSnapshot: 400,  quantity: 2 },
  { id: 'i3', productNameSnapshot: 'Coca-Cola',      unitPriceCentsSnapshot: 350,  quantity: 1 },
];

const SINGLE_ITEM = [
  { id: 'i1', productNameSnapshot: 'Pizza Margherita', unitPriceCentsSnapshot: 1400, quantity: 1 },
];

const meta: Meta<typeof OrderCard> = {
  title: 'Operator/OrderCard',
  component: OrderCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof OrderCard>;

const NOW = new Date().toISOString();
const FIVE_MIN_AGO = new Date(Date.now() - 5 * 60_000).toISOString();

export const NewOrder: Story = {
  name: 'PAID — Nouvelle commande',
  args: { id: 'o1', orderNumber: 'BE-00000042', status: 'PAID', items: ITEMS, createdAt: NOW },
};

export const Accepted: Story = {
  name: 'ACCEPTED — Acceptée',
  args: { id: 'o2', orderNumber: 'BE-00000043', status: 'ACCEPTED', items: ITEMS, createdAt: FIVE_MIN_AGO },
};

export const Preparing: Story = {
  name: 'PREPARING — En préparation',
  args: { id: 'o3', orderNumber: 'BE-00000044', status: 'PREPARING', items: ITEMS, createdAt: FIVE_MIN_AGO },
};

export const Ready: Story = {
  name: 'READY — Prête à récupérer',
  args: { id: 'o4', orderNumber: 'BE-00000045', status: 'READY', items: SINGLE_ITEM, createdAt: FIVE_MIN_AGO },
};

export const Recovered: Story = {
  name: 'RECOVERED — Récupération en cours',
  args: { id: 'o5', orderNumber: 'BE-00000046', status: 'RECOVERED', items: ITEMS, createdAt: FIVE_MIN_AGO },
};

export const Loading: Story = {
  name: 'Chargement (mutation en cours)',
  args: {
    id: 'o6',
    orderNumber: 'BE-00000047',
    status: 'PAID',
    items: ITEMS,
    createdAt: NOW,
    isLoading: true,
  },
};

export const SingleItem: Story = {
  name: 'Commande 1 article',
  args: { id: 'o7', orderNumber: 'BE-00000048', status: 'PREPARING', items: SINGLE_ITEM, createdAt: FIVE_MIN_AGO },
};
