import { create } from 'zustand';

export interface CartItem {
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

interface CartState {
  /** Backend cart ID (set after POST /carts) */
  backendCartId: string | null;

  /** Event and supplier the cart belongs to */
  eventId: string | null;
  supplierId: string | null;

  /** Local items (before submitting to backend) */
  items: CartItem[];

  /** Selected slot ID for pickup time */
  selectedSlotId: string | null;
  selectedSlotLabel: string | null;

  // ─── Actions ─────────────────────────────────────────────────

  initCart: (eventId: string, supplierId: string) => void;
  setBackendCartId: (id: string) => void;

  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  incrementItem: (productId: string) => void;
  decrementItem: (productId: string) => void;

  setSlot: (slotId: string, label: string) => void;
  clearSlot: () => void;

  resetCart: () => void;

  // ─── Derived ─────────────────────────────────────────────────
  totalCents: () => number;
  totalItems: () => number;
}

const INITIAL_STATE = {
  backendCartId: null,
  eventId: null,
  supplierId: null,
  items: [] as CartItem[],
  selectedSlotId: null,
  selectedSlotLabel: null,
};

export const useCartStore = create<CartState>((set, get) => ({
  ...INITIAL_STATE,

  initCart: (eventId, supplierId) =>
    set({ ...INITIAL_STATE, eventId, supplierId }),

  setBackendCartId: (id) => set({ backendCartId: id }),

  addItem: (newItem) => {
    const existing = get().items.find((i) => i.productId === newItem.productId);
    if (existing) {
      set({
        items: get().items.map((i) =>
          i.productId === newItem.productId
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        ),
      });
    } else {
      set({ items: [...get().items, { ...newItem, quantity: 1 }] });
    }
  },

  removeItem: (productId) =>
    set({ items: get().items.filter((i) => i.productId !== productId) }),

  updateQuantity: (productId, qty) => {
    if (qty <= 0) {
      set({ items: get().items.filter((i) => i.productId !== productId) });
    } else {
      set({
        items: get().items.map((i) =>
          i.productId === productId ? { ...i, quantity: qty } : i,
        ),
      });
    }
  },

  incrementItem: (productId) => {
    set({
      items: get().items.map((i) =>
        i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
      ),
    });
  },

  decrementItem: (productId) => {
    const item = get().items.find((i) => i.productId === productId);
    if (!item) return;
    if (item.quantity <= 1) {
      set({ items: get().items.filter((i) => i.productId !== productId) });
    } else {
      set({
        items: get().items.map((i) =>
          i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i,
        ),
      });
    }
  },

  setSlot: (slotId, label) => set({ selectedSlotId: slotId, selectedSlotLabel: label }),
  clearSlot: () => set({ selectedSlotId: null, selectedSlotLabel: null }),

  resetCart: () => set(INITIAL_STATE),

  totalCents: () =>
    get().items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),

  totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
