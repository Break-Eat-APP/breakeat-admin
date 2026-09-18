import React, { useCallback, useEffect, useState } from 'react';
import { THEME } from '@lib/theme';
import {
  ActivityIndicator,
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
  apiChoisirCreneau,
  apiCommandeDuPanier,
  apiGetLoyaltyStatus,
  apiSetCartPoints,
  formatPrice,
  type LoyaltyStatus,
} from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { useAuthStore } from '@store/auth.store';
import { PageHeader } from '@components/page-header';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { showAlert } from '@lib/alert';
import { payer } from '@lib/paiement';

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
 * Attend que le webhook Stripe ait cree la commande.
 *
 * La commande ne naît jamais dans l'app : elle naît du webhook, une fois
 * l'argent encaisse. Apres la feuille native, c'est la seule chose qui reste a
 * attendre — quelques centaines de millisecondes le plus souvent.
 *
 * `pageFermee` ne sert qu'au repli par page hebergee, ou le reglement se joue
 * hors de notre vue : le sondage tourne alors PENDANT que la page est ouverte,
 * et c'est lui qui la referme des que la commande existe. Sans cela, l'app
 * attendait la fermeture, et cette fermeture dependait d'un rebond
 * `breakeat://` qu'iOS ignore quand il n'est pas declenche par un appui.
 *
 * Deux echeances : cinq minutes tant que la page est ouverte (le client saisit
 * sa carte), trente secondes une fois refermee — au-dela, ce n'est plus un
 * delai de traitement, et mieux vaut le dire que laisser tourner un sablier.
 */
async function attendreLaCommande(cartId: string, pageFermee: Promise<void>) {
  const DEBUT = Date.now();
  let finDeLattente = DEBUT + 5 * 60_000;
  void pageFermee.then(() => {
    finDeLattente = Math.min(finDeLattente, Date.now() + 30_000);
  });

  while (Date.now() < finDeLattente) {
    try {
      const reponse = await apiCommandeDuPanier(cartId);
      if (reponse.pret && reponse.order) {
        // La feuille peut encore afficher la page de retour de Stripe : c'est
        // l'app qui la referme, sans rien attendre du navigateur.
        try {
          await WebBrowser.dismissBrowser();
        } catch {
          // Deja fermee — cas nominal quand le client a appuye sur « OK ».
        }
        return reponse.order;
      }
    } catch {
      // Reseau capricieux au retour d'un navigateur : on retente.
    }
    // Serre pendant la premiere minute, puis espace : au-dela, le client
    // remplit encore son formulaire, et rien ne sert de marteler le serveur.
    const attente = Date.now() - DEBUT < 60_000 ? 1_200 : 3_000;
    await new Promise<void>((r) => setTimeout(r, attente));
  }
  return null;
}

export function CheckoutScreen({ navigation }: Props) {
  // La barre du bas flotte au-dessus des ecrans : tout element pose en bas doit
  // lui laisser la place, encoche de l'appareil comprise.
  const espaceBas = useBottomBarSpace();
  const { user, token } = useAuthStore();
  const {
    items,
    eventId,
    supplierId,
    selectedSlotId,
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

      // 2bis. Le créneau choisi — il doit voyager jusqu'au serveur.
      //
      // Sans cet appel, il restait dans l'application : la commande arrivait au
      // comptoir sans heure de retrait, affichée « dès que prête ».
      if (selectedSlotId) {
        await apiChoisirCreneau(cart.id, selectedSlotId);
      }

      // 2ter. Fidélité — applique les points APRÈS les articles (la remise est
      // plafonnée au montant du panier, qui doit donc être complet).
      if (pointsToUse > 0) {
        setStep('Application de tes points…');
        await apiSetCartPoints(cart.id, pointsToUse);
      }

      // 3. Le paiement — DANS l'application.
      setStep('Ouverture du paiement…');
      const paiement = await apiCheckout(cart.id);

      // 4. La feuille de paiement de Stripe s'ouvre PAR-DESSUS cet ecran.
      //
      // Aucun navigateur, aucune adresse, aucun retour a negocier : le client
      // voit Break Eat derriere, et l'app reprend la main des qu'il a paye.
      // Aucun numero de carte ne traverse notre code : la feuille appartient au
      // SDK de Stripe et ne nous rend qu'un oui ou un non.
      //
      // Le repli par page hebergee ne vit plus que pour le navigateur — et pour
      // le cas ou le serveur n'a pas de cle publiable. C'est `@lib/paiement`
      // qui choisit, selon la plateforme.
      const reglement = await payer({
        mode: paiement.mode,
        clientSecret: paiement.clientSecret,
        publishableKey: paiement.publishableKey,
        checkoutUrl: paiement.checkoutUrl,
        libelle: 'Break Eat',
      });

      if (reglement.issue === 'annule') {
        // Renoncer n'est pas une panne. Le panier est intact, on ne l'efface
        // pas, et rien ne doit s'afficher en rouge.
        return;
      }

      // 5. Attendre que la commande NAISSE.
      //
      // Elle n'est pas creee par l'app mais par le webhook Stripe, une fois
      // l'argent encaisse : c'est la seule facon qu'aucune commande ne parte en
      // cuisine sans paiement. Le delai est court — souvent moins d'une seconde
      // — mais il n'est pas nul, et afficher « aucune commande » pendant ce
      // temps-la ferait croire a un echec.
      setStep('Confirmation du paiement…');
      const commande = await attendreLaCommande(cart.id, reglement.pageFermee);

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
        dailyNumber: commande.dailyNumber,
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
          <Text style={styles.cardTitle}>Commande pour</Text>
          <Text style={styles.cardValue}>{user.displayName}</Text>
          <Text style={styles.cardSub}>{user.email}</Text>
        </View>

        {/* Slot */}
        {selectedSlotLabel && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Créneau de retrait</Text>
            <Text style={styles.cardValue}>{selectedSlotLabel}</Text>
          </View>
        )}

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Articles ({items.length})</Text>
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
            <Text style={styles.cardTitle}>Mes points</Text>
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

        {/* Ce que le client doit savoir avant d'appuyer : qui encaisse, et
            qu'il ne quitte pas l'application. Le texte disait « la page s'ouvre
            dans ton navigateur » — ce n'est plus vrai depuis que le paiement
            s'affiche dans l'app, et une consigne fausse inquiète plus qu'elle
            ne rassure. */}
        <View style={styles.mentionPaiement}>
          <Text style={styles.mentionTexte}>
            Paiement sécurisé par Stripe, sans quitter l’application.
          </Text>
        </View>
      </ScrollView>

      {/* Le bouton, au-dessus de la barre d'onglets.
          Sans cette marge il finissait DERRIERE la pastille centrale : le
          client voyait « Confirmer la commande » coupe en deux, et l'appui
          tombait sur l'onglet. La valeur vient de la geometrie reelle de la
          barre — voir `useBottomBarSpace`. */}
      <View style={[styles.cta, { paddingBottom: espaceBas }]}>
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



  mentionPaiement: { paddingHorizontal: 4, paddingTop: 4 },
  mentionTexte: { color: THEME.inkSoft, fontSize: 12.5, flex: 1, lineHeight: 18 },

  cta: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
