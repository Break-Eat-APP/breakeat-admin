import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiCreateCart,
  apiAddCartItem,
  apiDemoCheckout,
  apiGetLoyaltyStatus,
  apiSetCartPoints,
  formatPrice,
  type LoyaltyStatus,
} from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { useAuthStore } from '@store/auth.store';
import { PageHeader } from '@components/page-header';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

/**
 * Reste à payer minimum après remise fidélité, en centimes.
 *
 * Doit rester égal à `MIN_PAYABLE_CENTS` côté serveur : le paiement refuse les
 * montants inférieurs, et une remise plus généreuse ici ne ferait que déplacer
 * l'échec au moment de payer.
 */
const MIN_PAYABLE_CENTS = 50;

export function CheckoutScreen({ navigation }: Props) {
  const { user, token } = useAuthStore();
  const {
    items,
    eventId,
    supplierId,
    selectedSlotLabel,
    totalCents,
    venueBuvettePlanUrl,
    venueId,
    setBackendCartId,
    resetCart,
  } = useCartStore();

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  // ─── Fidélité (phase 20) ─────────────────────────────────────
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [usePoints, setUsePoints] = useState(false);

  const subtotal = totalCents();
  // Points réellement utilisables : bornés par le solde ET par la remise
  // maximale autorisée. Cette borne DOIT reproduire `discountForPoints` côté
  // serveur (loyalty.service.ts) : afficher une remise que le serveur refuse
  // ensuite bloquerait le client au dernier écran, sans explication.
  const remiseMax = Math.max(0, subtotal - MIN_PAYABLE_CENTS);
  const maxUsablePoints =
    loyalty?.enabled && loyalty.pointValueCents > 0 && remiseMax > 0
      ? Math.min(loyalty.balance, Math.floor(remiseMax / loyalty.pointValueCents))
      : 0;
  const pointsToUse = usePoints ? maxUsablePoints : 0;
  const discountCents = pointsToUse * (loyalty?.pointValueCents ?? 0);
  const dueCents = subtotal - discountCents;
  const pointsToEarn = loyalty?.enabled
    ? Math.floor((dueCents / 100) * loyalty.pointsPerEuro)
    : 0;

  const loadLoyalty = useCallback(async () => {
    if (!venueId || !token) return;
    try {
      setLoyalty(await apiGetLoyaltyStatus(venueId));
    } catch (e: unknown) {
      // La fidélité est un bonus : son indisponibilité ne bloque pas l'achat.
      console.warn('apiGetLoyaltyStatus a échoué:', e);
    }
  }, [venueId, token]);

  useEffect(() => {
    void loadLoyalty();
  }, [loadLoyalty]);

  // Redirect if not logged in
  if (!token || !user) {
    return (
      <View style={styles.root}>
        <PageHeader title="Récapitulatif" />
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

      // 2bis. Fidélité — applique les points APRÈS les articles (la remise est
      // plafonnée au montant du panier, qui doit donc être complet).
      if (pointsToUse > 0) {
        setStep('Application de tes points…');
        await apiSetCartPoints(cart.id, pointsToUse);
      }

      // 3. Demo checkout (bypasses Stripe)
      setStep('Validation de la commande…');
      const result = await apiDemoCheckout(cart.id);

      // 4. Reset cart + navigate to confirmation (on garde le plan avant reset)
      const planUrl = venueBuvettePlanUrl;
      resetCart();
      navigation.replace('OrderConfirmation', {
        orderId: result.orderId,
        publicOrderNumber: result.publicOrderNumber,
        totalCents: result.totalCents,
        buvettePlanUrl: planUrl,
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
      <PageHeader title="Récapitulatif" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Customer info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 Commande pour</Text>
          <Text style={styles.cardValue}>{user.displayName}</Text>
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

        {/* Fidélité — visible seulement si le club a activé le programme */}
        {loyalty?.enabled && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⭐ Mes points</Text>
            <Text style={styles.cardValue}>
              {loyalty.balance} point{loyalty.balance > 1 ? 's' : ''} disponible
              {loyalty.balance > 1 ? 's' : ''}
            </Text>

            {maxUsablePoints > 0 ? (
              <View style={styles.loyaltyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.loyaltyLabel}>Utiliser mes points</Text>
                  <Text style={styles.loyaltyHint}>
                    {maxUsablePoints} point{maxUsablePoints > 1 ? 's' : ''} ={' '}
                    {formatPrice(maxUsablePoints * loyalty.pointValueCents)} de réduction
                  </Text>
                </View>
                <Switch
                  value={usePoints}
                  onValueChange={setUsePoints}
                  trackColor={{ false: '#334155', true: '#FC4002' }}
                  thumbColor="#fff"
                />
              </View>
            ) : (
              <Text style={styles.loyaltyHint}>
                {loyalty.balance > 0
                  ? `Une commande garde toujours ${formatPrice(MIN_PAYABLE_CENTS)} à payer : tes points s’appliqueront sur une note plus élevée.`
                  : 'Pas encore assez de points pour obtenir une réduction.'}
              </Text>
            )}

            {pointsToEarn > 0 && (
              <Text style={styles.loyaltyEarn}>
                Cette commande te rapportera {pointsToEarn} point{pointsToEarn > 1 ? 's' : ''}.
              </Text>
            )}
          </View>
        )}

        {/* Total */}
        <View style={[styles.card, styles.totalCard]}>
          {discountCents > 0 && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.subLine}>Sous-total</Text>
                <Text style={styles.subLine}>{formatPrice(subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.discountLine}>Réduction fidélité</Text>
                <Text style={styles.discountLine}>−{formatPrice(discountCents)}</Text>
              </View>
              <View style={styles.totalDivider} />
            </>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total à payer</Text>
            <Text style={styles.totalValue}>{formatPrice(dueCents)}</Text>
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
  subLine: { color: '#94a3b8', fontSize: 14 },
  discountLine: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  totalDivider: { height: 1, backgroundColor: '#334155', marginVertical: 4 },

  loyaltyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  loyaltyLabel: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  loyaltyHint: { color: '#94a3b8', fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  loyaltyEarn: { color: '#FC4002', fontSize: 12.5, marginTop: 8, fontWeight: '600' },
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
