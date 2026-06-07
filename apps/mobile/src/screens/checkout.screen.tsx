import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiCreateCart,
  apiAddCartItem,
  apiDemoCheckout,
  formatPrice,
} from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { useAuthStore } from '@store/auth.store';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

export function CheckoutScreen({ navigation }: Props) {
  const { user, token } = useAuthStore();
  const {
    items,
    eventId,
    supplierId,
    selectedSlotLabel,
    totalCents,
    setBackendCartId,
    resetCart,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  // Redirect if not logged in
  if (!token || !user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.authTitle}>Connexion requise</Text>
        <Text style={styles.authText}>Vous devez être connecté pour commander.</Text>
        <Pressable
          style={styles.authBtn}
          onPress={() => navigation.navigate('Login', { pendingEventId: eventId ?? undefined })}
        >
          <Text style={styles.authBtnText}>Se connecter</Text>
        </Pressable>
      </View>
    );
  }

  const handleOrder = async () => {
    if (!eventId || !supplierId || items.length === 0) {
      Alert.alert('Panier vide', 'Votre panier est vide.');
      return;
    }

    setLoading(true);
    try {
      // 1. Create backend cart
      setStep('Création du panier…');
      const cart = await apiCreateCart(eventId, supplierId);
      setBackendCartId(cart.id);

      // 2. Add items
      setStep('Ajout des articles…');
      for (const item of items) {
        await apiAddCartItem(cart.id, item.productId, item.quantity);
      }

      // 3. Demo checkout (bypasses Stripe)
      setStep('Validation de la commande…');
      const result = await apiDemoCheckout(cart.id);

      // 4. Reset cart + navigate to confirmation
      resetCart();
      navigation.replace('OrderConfirmation', {
        orderId: result.orderId,
        publicOrderNumber: result.publicOrderNumber,
        totalCents: result.totalCents,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      Alert.alert('Erreur', msg.includes('409')
        ? 'Un panier est déjà ouvert. Réessayez dans 30 min.'
        : `Impossible de passer la commande : ${msg}`);
    } finally {
      setLoading(false);
      setStep('');
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Récapitulatif</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Customer info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 Commande pour</Text>
          <Text style={styles.cardValue}>
            {user.firstName} {user.lastName}
          </Text>
          <Text style={styles.cardSub}>{user.email}</Text>
        </View>

        {/* Slot */}
        {selectedSlotLabel && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⏰ Créneau de retrait</Text>
            <Text style={styles.cardValue}>{selectedSlotLabel}</Text>
          </View>
        )}

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛒 Articles ({items.length})</Text>
          {items.map((item) => (
            <View key={item.productId} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}×</Text>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.productName}
              </Text>
              <Text style={styles.itemTotal}>
                {formatPrice(item.unitPriceCents * item.quantity)}
              </Text>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={[styles.card, styles.totalCard]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total à payer</Text>
            <Text style={styles.totalValue}>{formatPrice(totalCents())}</Text>
          </View>
        </View>

        {/* Demo badge */}
        <View style={styles.demoBadge}>
          <Text style={styles.demoIcon}>🧪</Text>
          <Text style={styles.demoText}>
            Mode démo — aucun paiement réel ne sera effectué
          </Text>
        </View>

        {/* Payment visual (fake card) */}
        <View style={styles.fakeCard}>
          <View style={styles.fakeCardChip} />
          <Text style={styles.fakeCardNum}>•••• •••• •••• 4242</Text>
          <Text style={styles.fakeCardLabel}>Visa Demo</Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.cta}>
        {loading ? (
          <View style={styles.ctaLoading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.ctaLoadingText}>{step}</Text>
          </View>
        ) : (
          <Pressable style={styles.ctaBtn} onPress={() => void handleOrder()}>
            <Text style={styles.ctaBtnText}>Confirmer la commande →</Text>
          </Pressable>
        )}
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
    gap: 16,
  },
  authTitle: { color: '#f1f5f9', fontSize: 20, fontWeight: '700' },
  authText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  authBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  authBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

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
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },

  content: { padding: 20, gap: 12, paddingBottom: 40 },

  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { color: '#64748b', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  cardValue: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  cardSub: { color: '#94a3b8', fontSize: 13 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemQty: { color: '#94a3b8', fontSize: 14, minWidth: 24 },
  itemName: { color: '#f1f5f9', fontSize: 14, flex: 1 },
  itemTotal: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },

  totalCard: { borderColor: '#2563eb44' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  totalValue: { color: '#2563eb', fontSize: 22, fontWeight: '800' },

  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  demoIcon: { fontSize: 18 },
  demoText: { color: '#6b7280', fontSize: 12, flex: 1, lineHeight: 16 },

  fakeCard: {
    backgroundColor: '#1e3a5f',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2563eb44',
  },
  fakeCardChip: {
    width: 36,
    height: 28,
    backgroundColor: '#d97706',
    borderRadius: 6,
  },
  fakeCardNum: { color: '#bfdbfe', fontSize: 16, letterSpacing: 2, fontWeight: '600' },
  fakeCardLabel: { color: '#93c5fd', fontSize: 12 },

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
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ctaLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  ctaLoadingText: { color: '#94a3b8', fontSize: 14 },
});
