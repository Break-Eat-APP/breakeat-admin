import type { Meta, StoryObj } from '@storybook/react';
import { NotificationPopup } from '@/components/NotificationPopup';

const meta: Meta<typeof NotificationPopup> = {
  title: 'Operator/NotificationPopup',
  component: NotificationPopup,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', background: '#f3f4f6', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NotificationPopup>;

export const NewOrderNotification: Story = {
  name: 'Nouvelle commande',
  args: {
    notification: { type: 'new_order', orderNumber: 'BE-00000042' },
    onDismiss: () => {},
    duration: 999_999,
  },
};

export const OrderReadyNotification: Story = {
  name: 'Commande prête',
  args: {
    notification: {
      type: 'order_ready',
      orderNumber: 'BE-00000043',
      pickupPointId: 'pp-uuid-001',
    },
    onDismiss: () => {},
    duration: 999_999,
  },
};

export const NoNotification: Story = {
  name: 'Pas de notification',
  args: {
    notification: null,
    onDismiss: () => {},
  },
};
