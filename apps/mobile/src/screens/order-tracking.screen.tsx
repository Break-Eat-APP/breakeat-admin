import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiGetOrder, formatPrice, type Order } from '@lib/api/mobile-api';
import { PageHeader } from '@components/page-header';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderTracking'>;

const POLL_INTERVAL_MS = 5000;

interface StatusConfig {
  label: string;
  icon: string;
  color: string;
  bg: string;
  description: string;
  isFinal: boolean;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  PAID: {
    label: 'Payé',
    icon: '💳',
    color: '#2563eb',
    bg: '#1e3a5f',
    description: 'Votre commande a été reçue. En attente de confirmation du stand.',
    isFinal: false,
  },
  ACCEPTED: {
    label: 'Acceptée',
    icon: '✅',
    color: '#16a34a',
    bg: '#14532d',
    description: 'Le stand a accepté votre commande. Préparation en cours.',
    isFinal: false,
  },
  PREPARING: {
    label: 'En préparation',
    icon: '🍳',
    color: '#d97706',
    bg: '#451a03',
    description: 'Votre commande est en cours de préparation.',
    isFinal: false,
  },
  READY: {
    label: 'Prête à retirer !',
    icon: '🎉',
    color: '#16a34a',
    bg: '#14532d',
    description: 'Votre commande est prête ! Rendez-vous au point de retrait.',
    isFinal: false,
  },
  PICKED_UP: {
    label: 'Récupérée',
    icon: '🏁',
    color: '#6b7280',
    bg: '#1e293b',
    description: 'Commande récupérée. Bon appétit !',
    isFinal: true,
  },
  CANCELLED: {
    label: 'Annulée',
    icon: '✕',
    color: '#dc2626',
    bg: '#450a0a',
    description: 'Votre commande a été annulée. Contactez un opérateur.',
    isFinal: true,
  },
  RECOVERED: {
    label: 'Récupérée (issue)',
    icon: '🔄',
    color: '#6b7280',
    bg: '#1e293b',
    description: 'Commande clôturée après incident.',
    isFinal: true,
  },
};

const STEPS = ['PAID', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP'];

export function OrderTrackingScreen({ route, navigation }: Props) {
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
          <ActivityIndicator size="large" color="#2563eb" />
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
    color: '#6b7280',
    bg: '#1e293b',
    description: '',
    isFinal: false,
  };

  const currentStepIndex = STEPS.indexOf(order.status);

  return (
    <View style={styles.root}>
      <PageHeader
        title={`Suivi #${order.publicOrderNumber}`}
        onBack={() => navigation.navigate('QRScanner')}
        right={
          !STATUS_MAP[order.status]?.isFinal ? (
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status hero */}
        <View style={[styles.statusHero, { backgroundColor: statusCfg.bg }]}>
          <Text style={styles.statusIcon}>{statusCfg.icon}</Text>
          <Text style={[styles.statusLabel, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
          <Text style={styles.statusDesc}>{statusCfg.description}</Text>
        </View>

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
                    {isDone && <Text style={styles.stepCheck}>✓</Text>}
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
          <Text style={styles.cardTitle}>🛒 Votre commande</Text>
          {order.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}×</Text>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.productNameSnapshot}
              </Text>
              <Text style={styles.itemPrice}>
                {formatPrice(item.unitPriceCentsSnapshot * item.quantity)}
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPrice(order.totalCents)}</Text>
          </View>
        </View>

        {/* Polling info */}
        {!statusCfg.isFinal && (
          <Text style={styles.pollInfo}>
            Mise à jour automatique toutes les 5 secondes
          </Text>
        )}
      </ScrollView>
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
  loadingText: { color: '#9ca3af', fontSize: 14, marginTop: 12 },
  errorText: { color: '#f87171', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#2563eb',
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
    backgroundColor: '#1e293b',
    gap: 12,
  },
  back: { padding: 4 },
  backArrow: { color: '#94a3b8', fontSize: 20 },
  headerTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#64748b', fontSize: 12 },
  liveBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#450a0a',
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

  statusHero: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusIcon: { fontSize: 48 },
  statusLabel: { fontSize: 22, fontWeight: '800' },
  statusDesc: { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  stepsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotDone: { backgroundColor: '#16a34a' },
  stepDotActive: { backgroundColor: '#2563eb' },
  stepCheck: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  stepLabel: { color: '#64748b', fontSize: 14 },
  stepLabelDone: { color: '#94a3b8' },
  stepLabelActive: { color: '#f1f5f9', fontWeight: '700' },
  stepLine: {
    position: 'absolute',
    left: 11,
    top: 24,
    width: 2,
    height: 20,
    backgroundColor: '#334155',
  },
  stepLineDone: { backgroundColor: '#16a34a' },

  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { color: '#64748b', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemQty: { color: '#94a3b8', fontSize: 14, minWidth: 24 },
  itemName: { color: '#f1f5f9', fontSize: 14, flex: 1 },
  itemPrice: { color: '#94a3b8', fontSize: 14 },
  divider: { height: 1, backgroundColor: '#334155' },
  totalLabel: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', flex: 1 },
  totalValue: { color: '#2563eb', fontSize: 16, fontWeight: '800' },

  pollInfo: {
    color: '#374151',
    fontSize: 11,
    textAlign: 'center',
  },
});
