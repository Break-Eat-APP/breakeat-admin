import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { formatPrice } from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { PageHeader } from '@components/page-header';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { THEME, shadowCard, FONT } from '@lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;

export function CartScreen({ navigation }: Props) {
  // Espace sous le contenu : la barre flottante ne doit rien recouvrir.
  // Calcule a l'execution car il depend de la zone sure de l'appareil.
  const espaceBas = useBottomBarSpace();
  const {
    items,
    incrementItem,
    decrementItem,
    removeItem,
    totalCents,
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

  return (
    <View style={styles.root}>
      <PageHeader title="Mon panier" />

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🛒</Text>
          <Text style={styles.emptyTitle}>Votre panier est vide</Text>
          <Text style={styles.emptyText}>Ajoutez des articles depuis le catalogue.</Text>
        </View>
      ) : (
        <>
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
                  <Pressable style={styles.qtyBtn} onPress={() => decrementItem(item.productId)}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <Pressable style={styles.qtyBtn} onPress={() => incrementItem(item.productId)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>

                <Text style={styles.itemTotal}>
                  {formatPrice(item.unitPriceCents * item.quantity)}
                </Text>

                <Pressable onPress={() => removeItem(item.productId)} style={styles.removeBtn} hitSlop={8}>
                  <Ionicons name="close" size={18} color={THEME.grey} />
                </Pressable>
              </View>
            )}
            ListFooterComponent={
              <View style={styles.footer}>
                {/* Créneau */}
                {selectedSlotLabel ? (
                  <View style={[styles.slotBox, styles.slotBoxActive]}>
                    <Ionicons name="time-outline" size={20} color={THEME.orange} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.slotLabel}>Créneau sélectionné</Text>
                      <Text style={styles.slotValue}>{selectedSlotLabel}</Text>
                    </View>
                    <Pressable onPress={handleChangeSlot}>
                      <Text style={styles.changeSlot}>Changer</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.slotBox}>
                    <Ionicons name="time-outline" size={20} color={THEME.grey} />
                    <Text style={styles.noSlotText}>Aucun créneau sélectionné</Text>
                  </View>
                )}

                {/* Récapitulatif */}
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
          <View style={[styles.cta, { paddingBottom: espaceBas }]}>
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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: THEME.ink, fontSize: 19, fontFamily: FONT.bold },
  emptyText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', fontFamily: FONT.regular },

  list: { paddingBottom: 16 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    gap: 10,
  },
  itemInfo: { flex: 1 },
  itemName: { color: THEME.ink, fontSize: 14, fontFamily: FONT.semibold },
  itemUnit: { color: THEME.inkSoft, fontSize: 12, marginTop: 2, fontFamily: FONT.regular },

  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: THEME.orangeTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: { color: THEME.orange, fontSize: 17, fontFamily: FONT.bold, lineHeight: 20 },
  qtyValue: { color: THEME.ink, fontSize: 14, fontFamily: FONT.bold, minWidth: 20, textAlign: 'center' },

  itemTotal: { color: THEME.ink, fontSize: 14, fontFamily: FONT.bold, minWidth: 58, textAlign: 'right' },
  removeBtn: { padding: 2 },

  footer: { paddingHorizontal: 18, paddingTop: 16, gap: 12 },

  slotBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.bgSubtle,
    borderRadius: THEME.radius.control,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },
  slotBoxActive: { backgroundColor: THEME.orangeTint, borderColor: THEME.orangeSoft },
  slotLabel: { color: THEME.inkSoft, fontSize: 12, fontFamily: FONT.regular },
  slotValue: { color: THEME.ink, fontSize: 14, fontFamily: FONT.semibold },
  changeSlot: { color: THEME.orange, fontSize: 13, fontFamily: FONT.bold },
  noSlotText: { color: THEME.inkSoft, fontSize: 13, fontFamily: FONT.regular },

  summary: {
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 16,
    gap: 10,
    ...shadowCard,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { color: THEME.inkSoft, fontSize: 14, fontFamily: FONT.regular },
  summaryValue: { color: THEME.ink, fontSize: 14, fontFamily: FONT.semibold },
  totalRow: { borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 10, marginTop: 2 },
  totalLabel: { color: THEME.ink, fontSize: 16, fontFamily: FONT.bold },
  totalValue: { color: THEME.orange, fontSize: 18, fontFamily: FONT.bold },

  cta: {
    paddingHorizontal: 18,
    paddingTop: 16,
    
    backgroundColor: THEME.bg,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  ctaBtn: {
    backgroundColor: THEME.orange,
    paddingVertical: 16,
    borderRadius: THEME.radius.pill,
    alignItems: 'center',
  },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: { color: '#fff', fontSize: 16, fontFamily: FONT.bold },
});
