import type { Meta, StoryObj } from '@storybook/react';
import { PublicScreenRow } from '@/components/PublicScreenRow';

const meta: Meta<typeof PublicScreenRow> = {
  title: 'Operator/PublicScreenRow',
  component: PublicScreenRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 800, margin: '0 auto', background: '#f0fdf4', padding: 16, borderRadius: 12 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PublicScreenRow>;

const NOW = new Date().toISOString();
const TWO_MIN_AGO = new Date(Date.now() - 2 * 60_000).toISOString();

export const JustReady: Story = {
  name: 'Prête à l\'instant (mise en évidence)',
  args: {
    orderNumber: 'BE-00000042',
    pickupPointId: 'pp-001',
    pickupLabel: 'Zone A — Tribune Nord',
    readyAt: NOW,
    isNew: true,
  },
};

export const ReadyTwoMinutes: Story = {
  name: 'Prête depuis 2 min',
  args: {
    orderNumber: 'BE-00000043',
    pickupPointId: 'pp-002',
    pickupLabel: 'Zone B — Entrée Est',
    readyAt: TWO_MIN_AGO,
    isNew: false,
  },
};

export const NoPickupLabel: Story = {
  name: 'Sans label point de retrait',
  args: {
    orderNumber: 'BE-00000044',
    pickupPointId: 'pp-003',
    readyAt: TWO_MIN_AGO,
    isNew: false,
  },
};

export const MultipleRows: Story = {
  name: 'Plusieurs commandes prêtes',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PublicScreenRow orderNumber="BE-00000040" pickupPointId="pp-001" pickupLabel="Zone A" readyAt={NOW} isNew={true} />
      <PublicScreenRow orderNumber="BE-00000035" pickupPointId="pp-002" pickupLabel="Zone B" readyAt={TWO_MIN_AGO} isNew={false} />
      <PublicScreenRow orderNumber="BE-00000031" pickupPointId="pp-001" pickupLabel="Zone A" readyAt={new Date(Date.now() - 4 * 60_000).toISOString()} isNew={false} />
    </div>
  ),
};
