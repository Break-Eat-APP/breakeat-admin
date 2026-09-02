import React, { useCallback, useEffect, useState } from 'react';
import { THEME } from '@lib/theme';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiCreateCart,
  apiAddCartItem,
  apiCheckout,
  apiCommandeDuPanier,
  apiGetLoyaltyStatus,
  apiSetCartPoints,
  formatPrice,
  type LoyaltyStatus,
} from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { useAuthStore } from '@store/auth.store';
import { PageHeader } from '@components/page-header';
import { showAlert } from '@lib/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

/**
 * Reste à payer minimum après remise fidélité, en centimes.
 *
 * Doit rester égal à `MIN_PAYABLE_CENTS` côté serveur : le paiement refuse les
 * montants inférieurs, et une remise plus généreuse ici ne ferait que déplacer
 * l'échec au moment de payer.
 */
const MIN_PAYABLE_CENTS = 50;

/**
 * Affiche la page de paiement dans l'application.
 *
 * Sur le web il n'y a pas de navigateur a ouvrir : on remplace la page en
 * cours. Stripe y renverra ensuite vers le site, pas vers `breakeat://`.
 */
async function ouvrirPaiement(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    const g = globalThis as { location?: { assign?: (u: string) => void } };
    g.location?.assign?.(url);
    // La page va etre remplacee : plus rien ne s'executera apres.
    await new Promise<void>((r) => setTimeout(r, 3_000));
    return;
  }
  await WebBrowser.openBrowserAsync(url, {
    // Aux couleurs de l'app : le client doit sentir qu'il n'a pas quitte
    // Break Eat pour un site inconnu au moment de donner sa carte.
    toolbarColor: THEME.bg,
    controlsColor: THEME.orange,
    dismissButtonStyle: 'cancel',
  });
}

/**
 * Attend que le webhook Stripe ait cree la commande, sans bloquer indefiniment.
 *
 * On interroge le serveur a intervalle court pendant une vingtaine de secondes.
 * Au-dela, ce n'est plus un delai de traitement : soit le client a annule, soit
 * quelque chose ne va pas — et dans les deux cas il vaut mieux le dire que
 * laisser tourner un sablier.
 */
async function attendreLaCommande(cartId: string) {
  const FIN = Date.now() + 20_000;
  while (Date.now() < FIN) {
    try {
      const reponse = await apiCommandeDuPanier(cartId);
      if (reponse.pret && reponse.order) return reponse.order;
    } catch {
      // Reseau capricieux au retour d'un navigateur : on retente.
    }
    await new Promise<void>((r) => setTimeout(r, 1_200));
  }
  return null;
}

export function CheckoutScreen({ navigation }: Props) {
  const { user, token } = useAuthStore();
  const {
    items,
    eventId,
    supplierId,
    selectedSlotLabel,
    totalCents,
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
      showAlert('Panier vide', 'Votre panier est vide.');
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

      // 3. Paiement REEL, sur une page hebergee par Stripe.
      setStep('Ouverture du paiement…');
      const { checkoutUrl } = await apiCheckout(cart.id);

      // 4. Le reglement se fait SANS quitter l'application.
      //
      // `openBrowserAsync` presente la page de Stripe dans une feuille Safari
      // integree : le client reste dans Break Eat, voit notre en-tete, et le
      // retour se fait tout seul. `Linking.openURL` le catapultait dans Safari,
      // d'ou rien ne le ramenait — il payait, puis restait bloque sur une page
      // web en croyant que sa commande n'existait pas.
      //
      // La page reste HEBERGEE par Stripe : aucun numero de carte ne transite
      // par notre code, et Apple Pay continue de fonctionner.
      await ouvrirPaiement(checkoutUrl);

      // 5. Attendre que la commande NAISSE.
      //
      // Elle n'est pas creee par l'app mais par le webhook Stripe, une fois
      // l'argent encaisse : c'est la seule facon qu'aucune commande ne parte en
      // cuisine sans paiement. Le delai est court — souvent moins d'une seconde
      // — mais il n'est pas nul, et afficher « aucune commande » pendant ce
      // temps-la ferait croire a un echec.
      setStep('Confirmation du paiement…');
      const commande = await attendreLaCommande(cart.id);

      if (!commande) {
        // Paiement peut-etre annule, peut-etre juste lent. On ne vide donc PAS
        // le panier : si le client a renonce, il le retrouve intact ; si le
        // webhook a pris du retard, la commande apparaitra dans « Mes commandes ».
        navigation.navigate('Commandes');
        showAlert(
          'Paiement en cours de confirmation',
          'Si vous avez payé, votre commande apparaîtra dans « Mes commandes » ' +
            'd’un instant à l’autre. Si vous avez annulé, votre panier est intact.',
        );
        return;
      }

      // 6. La commande existe : le panier a fait son office.
      resetCart();
      navigation.replace('OrderConfirmation', {
        orderId: commande.id,
        publicOrderNumber: commande.publicOrderNumber,
        totalCents: commande.totalCents,
        buvettePlanUrl: commande.pickupPlanUrl,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';

      // Session expirée : dire quoi faire, pas afficher un code.
      //
      // « Impossible de passer la commande : status 401 » ne mène nulle part.
      // La session vient d'être vidée par la couche réseau ; l'app rebascule
      // sur l'écran de connexion, et le panier est conservé côté serveur.
      if (msg.includes('401') || msg.includes('Session expirée')) {
        showAlert(
          'Session expirée',
          'Reconnectez-vous pour finaliser votre commande. Votre panier est conservé.',
        );
      } else {
        showAlert('Erreur', msg.includes('409')
          ? 'Un panier est déjà ouvert. Réessayez dans 30 min.'
          : `Impossible de passer la commande : ${msg}`);
      }
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
                  trackColor={{ false: THEME.bgSubtle, true: '#FC4002' }}
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

        {/* Le paiement se fait sur une page Stripe : on prévient avant de
            sortir de l'app, sinon le client croit avoir perdu sa commande. */}
        <View style={styles.demoBadge}>
          <Text style={styles.demoIcon}>🔒</Text>
          <Text style={styles.demoText}>
            Paiement sécurisé par Stripe. La page s’ouvre dans ton navigateur, puis tu reviens ici.
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
  root: { flex: 1, backgroundColor: THEME.bg },

  centered: {
    flex: 1,
    backgroundColor: THEME.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  authTitle: { color: THEME.ink, fontSize: 20, fontWeight: '700' },
  authText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center' },
  authBtn: {
    backgroundColor: THEME.orange,
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
    backgroundColor: THEME.surface,
    gap: 12,
  },
  back: { padding: 4 },
  backArrow: { color: THEME.inkSoft, fontSize: 20 },
  headerTitle: { color: THEME.ink, fontSize: 18, fontWeight: '700' },

  content: { padding: 20, gap: 12, paddingBottom: 40 },

  card: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: THEME.bgSubtle,
  },
  cardTitle: { color: THEME.inkSoft, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  cardValue: { color: THEME.ink, fontSize: 15, fontWeight: '700' },
  cardSub: { color: THEME.inkSoft, fontSize: 13 },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemQty: { color: THEME.inkSoft, fontSize: 14, minWidth: 24 },
  itemName: { color: THEME.ink, fontSize: 14, flex: 1 },
  itemTotal: { color: THEME.ink, fontSize: 14, fontWeight: '600' },

  totalCard: { borderColor: THEME.orangeSoft },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subLine: { color: THEME.inkSoft, fontSize: 14 },
  discountLine: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  totalDivider: { height: 1, backgroundColor: THEME.bgSubtle, marginVertical: 4 },

  loyaltyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  loyaltyLabel: { color: THEME.ink, fontSize: 14, fontWeight: '600' },
  loyaltyHint: { color: THEME.inkSoft, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  loyaltyEarn: { color: '#FC4002', fontSize: 12.5, marginTop: 8, fontWeight: '600' },
  totalLabel: { color: THEME.ink, fontSize: 16, fontWeight: '700' },
  totalValue: { color: THEME.orange, fontSize: 22, fontWeight: '800' },

  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.bg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.grey,
  },
  demoIcon: { fontSize: 18 },
  demoText: { color: THEME.grey, fontSize: 12, flex: 1, lineHeight: 16 },

  fakeCard: {
    backgroundColor: THEME.orangeTint,
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.orangeSoft,
  },
  fakeCardChip: {
    width: 36,
    height: 28,
    backgroundColor: '#d97706',
    borderRadius: 6,
  },
  fakeCardNum: { color: THEME.orangeSoft, fontSize: 16, letterSpacing: 2, fontWeight: '600' },
  fakeCardLabel: { color: THEME.orangeSoft, fontSize: 12 },

  cta: {
    padding: 20,
    backgroundColor: THEME.bg,
    borderTopWidth: 1,
    borderTopColor: THEME.surface,
  },
  ctaBtn: {
    backgroundColor: THEME.orange,
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
  ctaLoadingText: { color: THEME.inkSoft, fontSize: 14 },
});
