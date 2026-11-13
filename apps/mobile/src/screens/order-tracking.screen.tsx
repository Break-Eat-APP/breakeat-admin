import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FONT, HEAD, THEME } from '@lib/theme';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiGetOrder,
  formatOrderNumber,
  formatPrice,
  numeroDeCommandeNu,
  type Order,
} from '@lib/api/mobile-api';
import { PageHeader } from '@components/page-header';
import Constants from 'expo-constants';
import { ADRESSE_SUPPORT, lienSignalement } from '@lib/support';
import { useAuthStore } from '@store/auth.store';
import { showAlert } from '@lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { MissingItemsBanner, ROUGE_MANQUANT } from '@components/missing-items-banner';
import { RemboursementBanner } from '@components/remboursement-banner';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { BuvettePlanViewer } from '@components/buvette-plan-viewer';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;

const POLL_INTERVAL_MS = 5000;

interface StatusConfig {
  label: string;
  /** Nom d'icone Ionicons — dessinee, donc a notre couleur et a notre taille. */
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  description: string;
  isFinal: boolean;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  PAID: {
    label: 'Payé',
    icon: 'card-outline',
    color: THEME.orange,
    bg: THEME.orangeTint,
    description: 'Votre commande a été reçue. En attente de confirmation du stand.',
    isFinal: false,
  },
  /**
   * ACCEPTED PORTE LE MEME LIBELLE QUE PAID — c'est voulu.
   *
   * Du point de vue du client, « payé » et « acceptée » sont le meme moment :
   * sa commande est arrivée. La distinction appartient au comptoir, qui sait
   * ce qu'il a validé ; elle n'appelait aucun geste de sa part, et occupait
   * pourtant une etape entiere sur quatre.
   *
   * Ce qui change quand meme, c'est la DESCRIPTION : elle dit que le stand a
   * vu la commande. L'information n'est donc pas perdue, elle cesse
   * simplement de reclamer une ligne du parcours.
   */
  ACCEPTED: {
    label: 'Payé',
    icon: 'checkmark-circle-outline',
    color: '#16a34a',
    bg: '#ecfdf5',
    description: 'Le stand a bien reçu votre commande. Préparation à venir.',
    isFinal: false,
  },
  PREPARING: {
    label: 'En préparation',
    icon: 'flame-outline',
    color: '#d97706',
    bg: '#fffbeb',
    description: 'Votre commande est en cours de préparation.',
    isFinal: false,
  },
  READY: {
    label: 'Prête à retirer !',
    icon: 'bag-check-outline',
    color: '#16a34a',
    bg: '#ecfdf5',
    description: 'Votre commande est prête ! Rendez-vous au point de retrait.',
    isFinal: false,
  },
  // EN VERT (demande de Rémi, 10/11) : c'est la bonne nouvelle de la commande,
  // et en gris elle se lisait comme un état éteint.
  PICKED_UP: {
    label: 'Récupérée',
    icon: 'checkmark-done-outline',
    color: '#16a34a',
    bg: '#ecfdf5',
    description: 'Commande récupérée. Bon appétit !',
    isFinal: true,
  },
  CANCELLED: {
    label: 'Annulée',
    icon: 'close-circle-outline',
    color: '#dc2626',
    bg: '#fef2f2',
    description: 'Votre commande a été annulée. Contactez un opérateur.',
    isFinal: true,
  },
  RECOVERED: {
    label: 'Récupérée (issue)',
    icon: 'refresh-outline',
    color: THEME.grey,
    bg: THEME.surface,
    description: 'Commande clôturée après incident.',
    isFinal: true,
  },
};

/**
 * LES ETAPES MONTREES AU CLIENT — quatre, et non cinq.
 *
 * `ACCEPTED` n'y figure plus : elle se replie sur `PAID` (voir ci-dessus).
 * Une commande acceptée reste donc sur l'etape « Payé », et avance a « En
 * préparation » quand le comptoir s'en saisit vraiment.
 */
const STEPS = ['PAID', 'PREPARING', 'READY', 'PICKED_UP'];

/**
 * CE QUI N'EST PAS UNE ETAPE, ET SUR QUOI IL FAUT LE REPLIER.
 *
 * Sans cette table, `STEPS.indexOf('ACCEPTED')` rendrait -1 : aucune etape
 * cochée, et un client qui vient de payer verrait sa barre de progression
 * REVENIR EN ARRIERE au moment ou le stand accepte. Le defaut serait
 * invisible en relisant `STEPS`, et spectaculaire a l'ecran.
 */
const ETAPE_DE_L_ETAT: Record<string, string> = { ACCEPTED: 'PAID' };

/**
 * Retour en arriere — l'ecran precedent, ou l'accueil a defaut.
 *
 * Ces fleches naviguaient vers le SCANNER QR. Un client qui suivait sa commande
 * et appuyait sur « retour » se retrouvait devant une camera, sans rapport avec
 * ce qu'il faisait. `goBack()` seul ne suffit pas : quand l'ecran a ete atteint
 * par un lien (retour de paiement, notification), il n'y a rien a depiler et
 * l'appui reste sans effet — le pire des deux, un bouton mort.
 */
function retourEnArriere(navigation: {
  canGoBack: () => boolean;
  goBack: () => void;
  navigate: (ecran: 'Lieux') => void;
}) {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.navigate('Lieux');
}

export function OrderTrackingScreen({ route, navigation }: Props) {
  // L'espace de la barre flottante du bas : sans lui, « Signaler un problème »
  // restait à moitié caché dessous en bout de défilement (vu le 10/11).
  const espaceBas = useBottomBarSpace();
  const [planOuvert, setPlanOuvert] = useState(false);
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 300, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [pulseAnim]);

  const fetchOrder = useCallback(async () => {
    try {
      const data = await apiGetOrder(orderId);
      setOrder((prev) => {
        if (prev?.status !== data.status) pulse();
        return data;
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orderId, pulse]);

  useEffect(() => {
    void fetchOrder();
    intervalRef.current = setInterval(() => void fetchOrder(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOrder]);

  // Reprise apres verrouillage de l'ecran.
  //
  // iOS gele les minuteurs JavaScript en arriere-plan : au deverrouillage, le
  // suivi reprend la ou il s'etait arrete et n'affiche l'avancee qu'au tic
  // suivant. On recharge donc des le retour au premier plan.
  const estFinal = order ? STATUS_MAP[order.status]?.isFinal === true : false;
  useEffect(() => {
    if (estFinal) return;
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void fetchOrder();
    });
    return () => sub.remove();
  }, [estFinal, fetchOrder]);

  // Stop polling once order reaches a final state
  useEffect(() => {
    if (order && STATUS_MAP[order.status]?.isFinal) {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [order]);

  if (loading) {
    return (
      <View style={styles.root}>
        <PageHeader title="Suivi de commande" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.orange} />
          <Text style={styles.loadingText}>Chargement de la commande…</Text>
        </View>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.root}>
        <PageHeader title="Suivi de commande" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Commande introuvable'}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void fetchOrder()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const statusCfg = STATUS_MAP[order.status] ?? {
    label: order.status,
    icon: '?',
    color: THEME.grey,
    bg: THEME.surface,
    description: '',
    isFinal: false,
  };

  const signalerProbleme = async () => {
    const lien = lienSignalement(
      {
        numero: `n° ${numeroDeCommandeNu(order)}`,
        reference: order.publicOrderNumber,
        buvette: order.supplierName ?? null,
        passeeLe: order.createdAt,
      },
      {
        compte: useAuthStore.getState().user?.email ?? null,
        appareil: `${Platform.OS} ${Platform.Version}`,
        version: Constants.expoConfig?.version ?? 'version inconnue',
      },
    );
    try {
      if (!(await Linking.canOpenURL(lien))) throw new Error('aucune messagerie');
      await Linking.openURL(lien);
    } catch {
      showAlert(
        'Aucune messagerie configurée',
        `Écris-nous à ${ADRESSE_SUPPORT} en précisant la commande n° ${numeroDeCommandeNu(order)}.`,
      );
      navigation.navigate('Aide');
    }
  };

  const currentStepIndex = STEPS.indexOf(ETAPE_DE_L_ETAT[order.status] ?? order.status);

  return (
    <View style={styles.root}>
      <PageHeader
        title={`Commande ${formatOrderNumber(order)}`}
        onBack={() => retourEnArriere(navigation)}
        right={
          !STATUS_MAP[order.status]?.isFinal ? (
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: espaceBas + 16 }]}>
        {/*
          LE NUMERO DE COMMANDE, EN GRAND ET EN PREMIER.

          C'est le seul chiffre que le client aura a donner — au comptoir, a
          voix haute, dans le bruit. Il vivait jusqu'ici dans le titre de
          l'ecran, a seize pixels et en gris : lisible assis au calme,
          introuvable debout devant un stand.

          Au-DESSUS de l'etat, parce qu'on ouvre cet ecran pour deux raisons —
          savoir ou en est la commande, et retrouver son numero — et que la
          seconde est la plus pressee des deux.
        */}
        <View style={styles.numeroCarte}>
          <Text style={styles.numeroLabel}>Numéro de commande</Text>
          <Text style={styles.numeroValeur}>{numeroDeCommandeNu(order)}</Text>
        </View>

        {/* Status hero */}
        <View style={[styles.statusHero, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusLabel, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
          <Text style={styles.statusDesc}>{statusCfg.description}</Text>
        </View>

        {/*
          TROUVER MA BUVETTE (demande de Rémi, 13/11). Le plan n'était que sur
          le ticket (« Y aller », tant que la commande est en cours) et sur la
          carte du lieu : en ouvrant sa commande, on ne le trouvait pas. Il est
          ici, sous l'état — c'est la question qu'on se pose juste après
          « est-ce prêt ? ». Le plan de la BUVETTE, à défaut celui du lieu
          (`pickupPlanUrl`, résolu par le serveur) ; rien si le club n'en a
          déposé aucun.
        */}
        {order.pickupPlanUrl ? (
          <Pressable
            style={({ pressed }) => [styles.planCarte, pressed && { opacity: 0.75 }]}
            onPress={() => setPlanOuvert(true)}
            accessibilityRole="button"
          >
            <View style={styles.planIcone}>
              <Ionicons name="map-outline" size={22} color={THEME.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitre}>Trouver ma buvette</Text>
              <Text style={styles.planSous} numberOfLines={1}>
                {order.supplierName ? `${order.supplierName} · voir le plan` : 'Voir le plan des buvettes'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={THEME.orange} />
          </Pressable>
        ) : null}

        {/* Produit manquant — juste sous le statut : c'est la nouvelle qui
            change ce que le client doit faire. Plus rien à faire une fois la
            commande terminée. */}
        {!statusCfg.isFinal && (
          <MissingItemsBanner lignes={order.items} comptoir={order.supplierName} />
        )}

        {/* Remboursement — HORS de la condition ci-dessus, volontairement.
            Un remboursement arrive presque toujours APRÈS que la commande est
            terminée : le masquer sur les commandes finies reviendrait à ne
            jamais l'afficher. */}
        <RemboursementBanner paymentStatus={order.paymentStatus} style={{ marginTop: 10 }} />

        {/* Progress steps (only for non-final normal flow) */}
        {order.status !== 'CANCELLED' && order.status !== 'RECOVERED' && (
          <View style={styles.stepsCard}>
            {STEPS.slice(0, -1).map((step, i) => {
              const cfg = STATUS_MAP[step];
              const isDone = i < currentStepIndex;
              const isActive = i === currentStepIndex;
              return (
                <View key={step} style={styles.stepRow}>
                  <View style={[
                    styles.stepDot,
                    isDone && styles.stepDotDone,
                    isActive && styles.stepDotActive,
                  ]}>
                    {isDone && <Ionicons name="checkmark" size={13} color="#fff" />}
                    {isActive && <Animated.View style={[styles.stepPulse, { transform: [{ scale: pulseAnim }] }]} />}
                  </View>
                  <Text style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isActive && styles.stepLabelActive,
                  ]}>
                    {cfg?.label ?? step}
                  </Text>
                  {i < STEPS.length - 2 && (
                    <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Order items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Votre commande</Text>
          {order.items.map((item, i) => {
            const manque = item.missingQuantity ?? 0;
            return (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}×</Text>
              <View style={styles.itemTextes}>
                <Text
                  style={[
                    styles.itemName,
                    manque > 0 && styles.itemManquant,
                    // Barré seulement si la ligne manque EN ENTIER : pour une
                    // bière sur deux, il en reste une à récupérer.
                    manque >= item.quantity && styles.itemBarre,
                  ]}
                  numberOfLines={1}
                >
                  {item.productNameSnapshot}
                  {manque > 0 ? ` · ${manque} manquant${manque > 1 ? 's' : ''}` : ''}
                </Text>
                {/* Le taux de la ligne (12/11) : une bière à 20 %, un
                    sandwich à 10 % — le client le voit comme sur le reçu. */}
                {item.tvaLabel ? <Text style={styles.itemTva}>TVA {item.tvaLabel}</Text> : null}
              </View>
              <Text style={styles.itemPrice}>
                {formatPrice(item.unitPriceCentsSnapshot * item.quantity)}
              </Text>
            </View>
            );
          })}
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <Text style={styles.totalLabel}>Total TTC</Text>
            <Text style={styles.totalValue}>{formatPrice(order.totalCents)}</Text>
          </View>
          {/* LA TVA, TAUX PAR TAUX — calculée par le serveur, la même que le
              reçu (remise fidélité comprise). Rien d'affiché si elle manque :
              mieux vaut pas de ligne qu'un chiffre recalculé ici. */}
          {order.tva && order.tva.tranches.length > 0
            ? order.tva.tranches.map((t) => (
                <View key={t.label} style={styles.tvaRow}>
                  <Text style={styles.tvaLabel}>dont TVA {t.label}</Text>
                  <Text style={styles.tvaValeur}>{formatPrice(t.tvaCents)}</Text>
                </View>
              ))
            : null}
        </View>

        {/*
          SIGNALER UN PROBLÈME (demande de Rémi, 10/11).

          Un e-mail PRÉ-REMPLI avec la commande — numéro, référence, buvette,
          heure — plutôt que la page d'aide générale : le client n'a plus qu'à
          décrire ce qui ne va pas, et le support n'a rien à redemander. Sans
          messagerie configurée, l'adresse s'affiche et la page « Aide &
          contact » s'ouvre.
        */}
        <Pressable
          style={({ pressed }) => [styles.signaler, pressed && { opacity: 0.7 }]}
          onPress={() => void signalerProbleme()}
          accessibilityRole="button"
        >
          <Ionicons name="alert-circle-outline" size={20} color={THEME.orangeDark} />
          <Text style={styles.signalerTexte}>Signaler un problème avec ma commande</Text>
          <Ionicons name="chevron-forward" size={18} color={THEME.grey} />
        </Pressable>

        {/* Polling info */}
        {!statusCfg.isFinal && (
          <Text style={styles.pollInfo}>
            Mise à jour automatique toutes les 5 secondes
          </Text>
        )}
      </ScrollView>

      <BuvettePlanViewer
        visible={planOuvert}
        url={order.pickupPlanUrl}
        onClose={() => setPlanOuvert(false)}
        title={order.supplierName ? `Plan — ${order.supplierName}` : 'Plan des buvettes'}
      />
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
    gap: 12,
  },
  loadingText: { color: THEME.inkSoft, fontSize: 14, marginTop: 12 },
  errorText: { color: '#f87171', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    backgroundColor: THEME.orange,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },

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
  headerTitle: { color: THEME.ink, fontSize: 16, fontWeight: '700' },
  headerSub: { color: THEME.inkSoft, fontSize: 12 },
  liveBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#f87171',
  },
  liveText: { color: '#f87171', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  content: { padding: 20, gap: 14, paddingBottom: 60 },

  /**
   * LA CARTE DU NUMERO — sobre, et c'est le chiffre qui porte.
   *
   * Pas de fond orange : l'ecran en a deja un (l'etat), et deux blocs colores
   * l'un sur l'autre ne hierarchisent plus rien. Ici c'est la TAILLE du
   * chiffre qui fait le travail, pas la couleur du cadre.
   */
  // EN ORANGE (demande de Rémi, 10/11) : le cadre blanc et le chiffre noir
  // ne se distinguaient pas du reste de l'écran.
  numeroCarte: {
    alignItems: 'center',
    backgroundColor: '#FFF1EA',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFC9B3',
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 4,
  },
  numeroLabel: {
    color: THEME.orangeDark,
    fontSize: 12.5,
    fontFamily: FONT.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  numeroValeur: {
    color: THEME.orange,
    fontSize: 44,
    lineHeight: 50,
    fontFamily: HEAD.bold,
    // Chiffres de largeur fixe : un numero se lit et se dicte, et un « 11 »
    // plus etroit qu'un « 44 » se lit moins vite d'un coup d'oeil.
    fontVariant: ['tabular-nums'],
  },

  planCarte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFC9B3',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  planIcone: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFF1EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitre: { color: THEME.ink, fontSize: 15.5, fontFamily: FONT.bold },
  planSous: { color: THEME.inkSoft, fontSize: 13, fontFamily: FONT.medium, marginTop: 2 },
  statusHero: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: THEME.bgSubtle,
  },
  statusLabel: { fontSize: 22, fontWeight: '800' },
  statusDesc: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  stepsCard: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.bgSubtle,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.bgSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotDone: { backgroundColor: '#16a34a' },
  stepDotActive: { backgroundColor: THEME.orange },
  stepPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  stepLabel: { color: THEME.inkSoft, fontSize: 14 },
  stepLabelDone: { color: THEME.inkSoft },
  stepLabelActive: { color: THEME.ink, fontWeight: '700' },
  stepLine: {
    position: 'absolute',
    left: 11,
    top: 24,
    width: 2,
    height: 20,
    backgroundColor: THEME.bgSubtle,
  },
  stepLineDone: { backgroundColor: '#16a34a' },

  card: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.bgSubtle,
  },
  cardTitle: { color: THEME.inkSoft, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemQty: { color: THEME.inkSoft, fontSize: 14, minWidth: 24 },
  itemTextes: { flex: 1, minWidth: 0 },
  itemName: { color: THEME.ink, fontSize: 14 },
  itemTva: { color: THEME.grey, fontSize: 11.5, marginTop: 1 },
  tvaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  tvaLabel: { color: THEME.inkSoft, fontSize: 12.5 },
  tvaValeur: { color: THEME.inkSoft, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  itemManquant: { color: ROUGE_MANQUANT, fontWeight: '700' },
  itemBarre: { textDecorationLine: 'line-through' },
  itemPrice: { color: THEME.inkSoft, fontSize: 14 },
  divider: { height: 1, backgroundColor: THEME.bgSubtle },
  totalLabel: { color: THEME.ink, fontSize: 14, fontWeight: '700', flex: 1 },
  totalValue: { color: THEME.orange, fontSize: 16, fontWeight: '800' },

  signaler: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: THEME.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  signalerTexte: { flex: 1, color: THEME.ink, fontSize: 14.5, fontFamily: FONT.medium },
  pollInfo: {
    color: THEME.inkSoft,
    fontSize: 11,
    textAlign: 'center',
  },
});
