import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { formatPrice } from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

export function CartScreen({ navigation }: Props) {
  const {
    items,
    incrementItem,
    decrementItem,
    removeItem,
    totalCents,
    totalItems,
    eventId,
    supplierId,
    selectedSlotLabel,
    clearSlot,
  } = useCartStore();

  const handleContinue = () => {
    if (!eventId) return;
    navigation.navigate('SlotSelector', { eventId });
  };

  const handleChangeSlot = () => {
    if (!eventId) return;
    clearSlot();
    navigation.navigate('SlotSelector', { eventId });
  };

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>Votre panier est vide</Text>
        <Text style={styles.emptyText}>Ajoutez des articles depuis le catalogue.</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Retour au catalogue</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Mon panier</Text>
        <Text style={styles.headerCount}>{totalItems()} article(s)</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.productId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.productName}</Text>
              <Text style={styles.itemUnit}>{formatPrice(item.unitPriceCents)} / u</Text>
            </View>

            <View style={styles.qtyControls}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => decrementItem(item.productId)}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qtyValue}>{item.quantity}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => incrementItem(item.productId)}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.itemTotal}>
              {formatPrice(item.unitPriceCents * item.quantity)}
            </Text>

            <Pressable
              onPress={() => removeItem(item.productId)}
              style={styles.removeBtn}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {/* Slot info */}
            {selectedSlotLabel ? (
              <View style={styles.slotBox}>
                <View style={styles.slotRow}>
                  <Text style={styles.slotIcon}>⏰</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotLabel}>Créneau sélectionné</Text>
                    <Text style={styles.slotValue}>{selectedSlotLabel}</Text>
                  </View>
                  <Pressable onPress={handleChangeSlot}>
                    <Text style={styles.changeSlot}>Changer</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.noSlotBox}>
                <Text style={styles.noSlotText}>⏰  Aucun créneau sélectionné</Text>
              </View>
            )}

            {/* Summary */}
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Sous-total</Text>
                <Text style={styles.summaryValue}>{formatPrice(totalCents())}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatPrice(totalCents())}</Text>
              </View>
            </View>
          </View>
        }
      />

      {/* CTA */}
      <View style={styles.cta}>
        <Pressable
          style={[styles.ctaBtn, !supplierId && styles.ctaBtnDisabled]}
          onPress={handleContinue}
          disabled={!supplierId}
        >
          <Text style={styles.ctaBtnText}>
            {selectedSlotLabel ? 'Commander →' : 'Choisir un créneau →'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },

  centered: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '700' },
  emptyText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  backBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  backBtnText: { color: '#2563eb', fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    gap: 12,
  },
  back: { padding: 4 },
  backArrow: { color: '#94a3b8', fontSize: 20 },
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', flex: 1 },
  headerCount: { color: '#64748b', fontSize: 13 },

  list: { paddingBottom: 24 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 10,
  },
  itemInfo: { flex: 1 },
  itemName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  itemUnit: { color: '#64748b', fontSize: 12, marginTop: 2 },

  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  qtyValue: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', minWidth: 20, textAlign: 'center' },

  itemTotal: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  removeBtn: { padding: 4 },
  removeText: { color: '#4b5563', fontSize: 14 },

  footer: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  slotBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2563eb44',
  },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slotIcon: { fontSize: 18 },
  slotLabel: { color: '#64748b', fontSize: 12 },
  slotValue: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  changeSlot: { color: '#2563eb', fontSize: 13, fontWeight: '600' },

  noSlotBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  noSlotText: { color: '#6b7280', fontSize: 13 },

  summary: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: '#94a3b8', fontSize: 14 },
  summaryValue: { color: '#f1f5f9', fontSize: 14 },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
    marginTop: 2,
  },
  totalLabel: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  totalValue: { color: '#2563eb', fontSize: 18, fontWeight: '800' },

  cta: {
    padding: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  ctaBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
