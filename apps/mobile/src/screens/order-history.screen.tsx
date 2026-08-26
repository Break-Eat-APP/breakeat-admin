import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiGetMyOrders, apiMarkArrived, formatPrice, formatTime, type Order } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { showAlert } from '@lib/alert';
import { THEME, shadowCard, HEAD } from '@lib/theme';
import { useBottomBarSpace } from '@components/app-bottom-bar';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Rafraîchissement du suivi live tant qu'au moins une commande est en cours. */
const LIVE_POLL_MS = 10_000;

const GREEN = '#16a34a';
const GREEN_TINT = 'rgba(22, 163, 74, 0.10)';
const RED = '#dc2626';
const RED_TINT = 'rgba(220, 38, 38, 0.10)';

/**
 * Parcours client résumé en 3 étapes visibles : reçue → en préparation → prête.
 * Les statuts backend PAID et ACCEPTED partagent l'étape « reçue » (l'acceptation
 * par le stand n'est pas une information actionnable pour le client).
 */
type Phase = 'received' | 'preparing' | 'ready' | 'done' | 'cancelled';

interface StatusUi {
  phase: Phase;
  label: string;
  color: string;
  tint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const STATUS_UI: Record<string, StatusUi> = {
  PAID: { phase: 'received', label: 'Commande reçue', color: THEME.ink, tint: THEME.bgSubtle, icon: 'receipt-outline' },
  ACCEPTED: { phase: 'received', label: 'Commande reçue', color: THEME.ink, tint: THEME.bgSubtle, icon: 'receipt-outline' },
  PREPARING: { phase: 'preparing', label: 'En préparation', color: THEME.orange, tint: THEME.orangeTint, icon: 'flame-outline' },
  READY: { phase: 'ready', label: 'Prête à retirer', color: GREEN, tint: GREEN_TINT, icon: 'checkmark-circle-outline' },
  PICKED_UP: { phase: 'done', label: 'Récupérée', color: THEME.grey, tint: THEME.bgSubtle, icon: 'bag-check-outline' },
  COMPLETED: { phase: 'done', label: 'Terminée', color: THEME.grey, tint: THEME.bgSubtle, icon: 'bag-check-outline' },
  RECOVERED: { phase: 'done', label: 'Restituée', color: THEME.grey, tint: THEME.bgSubtle, icon: 'refresh-outline' },
  CANCELLED: { phase: 'cancelled', label: 'Annulée', color: RED, tint: RED_TINT, icon: 'close-circle-outline' },
};

const FALLBACK_UI: StatusUi = {
  phase: 'received',
  label: 'En cours',
  color: THEME.inkSoft,
  tint: THEME.bgSubtle,
  icon: 'ellipsis-horizontal',
};

const ui = (status: string): StatusUi => STATUS_UI[status] ?? FALLBACK_UI;
const isLive = (status: string): boolean => {
  const p = ui(status).phase;
  return p === 'received' || p === 'preparing' || p === 'ready';
};

/** Étapes de la barre de progression (dans l'ordre du parcours). */
const STEPS: { phase: Phase; label: string; color: string }[] = [
  { phase: 'received', label: 'Reçue', color: THEME.ink },
  { phase: 'preparing', label: 'Préparation', color: THEME.orange },
  { phase: 'ready', label: 'Prête', color: GREEN },
];

export function OrderHistoryScreen() {
  // Espace sous le contenu : la barre flottante ne doit rien recouvrir.
  // Calcule a l'execution car il depend de la zone sure de l'appareil.
  const espaceBas = useBottomBarSpace();
  const navigation = useNavigation<Nav>();
  const { token } = useAuthStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setOrders(await apiGetMyOrders());
    } catch (e: unknown) {
      console.warn('apiGetMyOrders a échoué:', e);
      setError('Impossible de charger tes commandes pour le moment.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /** « Je suis arrivé » — prévient la buvette que le client attend au retrait. */
  const markArrived = useCallback(async (orderId: string) => {
    // Mise à jour optimiste : le retour visuel doit être immédiat même en réseau
    // dégradé (stade bondé). Rollback si l'appel échoue.
    const stamp = new Date().toISOString();
    setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, customerArrivedAt: stamp } : o)));
    try {
      await apiMarkArrived(orderId);
    } catch (e: unknown) {
      console.warn('apiMarkArrived a échoué:', e);
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, customerArrivedAt: null } : o)));
      showAlert('Signalement impossible', "Ta présence n'a pas pu être envoyée. Réessaie dans un instant.");
    }
  }, []);

  // Suivi live : on ne sonde que s'il reste une commande en cours (économie
  // batterie/réseau — une liste 100 % terminée est figée).
  const hasLive = orders.some((o) => isLive(o.status));
  useEffect(() => {
    if (!token || !hasLive) return;
    const t = setInterval(() => void load(), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [token, hasLive, load]);

  if (!token) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.screenTitle}>Mes commandes</Text>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Connecte-toi pour voir tes commandes.</Text>
          <Pressable style={styles.cta} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.ctaText}>Se connecter</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Mes commandes</Text>
        {hasLive && <LiveBadge />}
      </View>

      {loading && orders.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.orange} />
        </View>
      ) : error && orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.cta} onPress={() => void load()}>
            <Text style={styles.ctaText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Aucune commande pour le moment.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.list, { paddingBottom: espaceBas }]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={THEME.orange} />
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
              onArrived={markArrived}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

/** Pastille « live » qui pulse tant qu'une commande est en cours. */
function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
      <Text style={styles.liveText}>en direct</Text>
    </View>
  );
}

function OrderCard({
  order,
  onPress,
  onArrived,
}: {
  order: Order;
  onPress: () => void;
  onArrived: (orderId: string) => void;
}) {
  const cfg = ui(order.status);
  const live = isLive(order.status);
  const stepIndex = STEPS.findIndex((s) => s.phase === cfg.phase);
  const arrived = Boolean(order.customerArrivedAt);

  return (
    <Pressable style={({ pressed }) => [styles.card, shadowCard, pressed && styles.pressed]} onPress={onPress}>
      {/* En-tête : n° + montant */}
      <View style={styles.cardHeader}>
        <Text style={styles.orderNumber}>Commande n°{order.publicOrderNumber}</Text>
        <Text style={styles.price}>{formatPrice(order.totalCents)}</Text>
      </View>

      {/* Statut coloré */}
      <View style={[styles.statusPill, { backgroundColor: cfg.tint }]}>
        <Ionicons name={cfg.icon} size={15} color={cfg.color} />
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {/* Progression 3 étapes — masquée si annulée */}
      {cfg.phase !== 'cancelled' && (
        <View style={styles.steps}>
          {STEPS.map((s, i) => {
            const reached = stepIndex >= i || cfg.phase === 'done';
            return (
              <View key={s.phase} style={styles.step}>
                <View style={[styles.stepBar, { backgroundColor: reached ? s.color : THEME.border }]} />
                <Text style={[styles.stepLabel, reached && { color: s.color, fontFamily: HEAD.bold }]}>
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.divider} />

      {/* Horaires : créneau de retrait (mis à jour s'il est réassigné) + heure de commande */}
      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={14} color={live ? cfg.color : THEME.inkSoft} />
        <Text style={[styles.timeStrong, live && { color: cfg.color }]}>{pickupLabel(order)}</Text>
        <Text style={styles.timeSoft}>· commandé à {formatTime(order.createdAt)}</Text>
      </View>

      <Text style={styles.dateLine}>{formatDate(order.createdAt)}</Text>

      {/* « Je suis arrivé » — uniquement tant que la commande est en cours. */}
      {live &&
        (arrived ? (
          <View style={styles.arrivedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={GREEN} />
            <Text style={styles.arrivedText}>Le stand sait que tu es là</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.arrivedBtn, pressed && styles.pressed]}
            onPress={() => onArrived(order.id)}
            hitSlop={4}
          >
            <Ionicons name="hand-left-outline" size={16} color="#fff" />
            <Text style={styles.arrivedBtnText}>Je suis arrivé</Text>
          </Pressable>
        ))}
    </Pressable>
  );
}

/** Libellé du retrait : créneau si présent (label du club, sinon plage horaire). */
function pickupLabel(order: Order): string {
  const slot = order.slot;
  if (!slot) return 'Retrait dès que prête';
  if (slot.label) return `Retrait ${slot.label}`;
  return `Retrait ${formatTime(slot.startAt)} – ${formatTime(slot.endAt)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 },
  screenTitle: { color: THEME.ink, fontSize: 22, fontFamily: HEAD.bold },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: THEME.orangeTint, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: THEME.radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: THEME.orange },
  liveText: { color: THEME.orange, fontSize: 11, fontFamily: HEAD.bold },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyText: { color: THEME.grey, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },
  errorText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },
  cta: {
    backgroundColor: THEME.orange, paddingHorizontal: 28, paddingVertical: 13,
    borderRadius: THEME.radius.control,
  },
  ctaText: { color: '#fff', fontFamily: HEAD.bold, fontSize: 15 },

  list: { padding: 16, gap: 12 },

  card: { backgroundColor: THEME.surface, borderRadius: THEME.radius.card, padding: 14, gap: 10 },
  pressed: { opacity: 0.85 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  orderNumber: { flex: 1, color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold },
  price: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: THEME.radius.pill,
  },
  statusText: { fontSize: 13, fontFamily: HEAD.bold },

  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 4 },
  stepBar: { height: 4, borderRadius: 2 },
  stepLabel: { color: THEME.grey, fontSize: 10.5, fontFamily: HEAD.medium },

  divider: { height: 1, backgroundColor: THEME.border },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  timeStrong: { color: THEME.ink, fontSize: 13, fontFamily: HEAD.semibold },
  timeSoft: { color: THEME.inkSoft, fontSize: 12, fontFamily: HEAD.medium },
  dateLine: { color: THEME.grey, fontSize: 11.5, fontFamily: HEAD.medium },

  arrivedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: THEME.orange, borderRadius: THEME.radius.pill,
    paddingVertical: 11, marginTop: 2,
  },
  arrivedBtnText: { color: '#fff', fontSize: 14, fontFamily: HEAD.bold },
  arrivedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: GREEN_TINT, borderRadius: THEME.radius.pill,
    paddingVertical: 10, marginTop: 2,
  },
  arrivedText: { color: GREEN, fontSize: 13, fontFamily: HEAD.semibold },
});
