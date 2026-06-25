import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiGetMyOrders, formatPrice, type Order } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { THEME, shadowCard, FONT } from '@lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Payée',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  PICKED_UP: 'Récupérée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  RECOVERED: 'Restituée',
};

export function OrderHistoryScreen() {
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
    setLoading(true);
    setError(null);
    try {
      setOrders(await apiGetMyOrders());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.screenTitle}>Mes commandes</Text>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Connectez-vous pour voir vos commandes.</Text>
          <Pressable style={styles.cta} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.ctaText}>Se connecter</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.screenTitle}>Mes commandes</Text>
      {loading && orders.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.orange} />
        </View>
      ) : error ? (
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
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={THEME.orange} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, shadowCard, pressed && styles.pressed]}
              onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
            >
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>🛒</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>Commande n°{item.publicOrderNumber}</Text>
                <Text style={styles.rowStatus}>{STATUS_LABELS[item.status] ?? item.status}</Text>
                <Text style={styles.rowDate}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowPrice}>{formatPrice(item.totalCents)}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  screenTitle: {
    color: THEME.ink,
    fontSize: 22,
    fontFamily: FONT.bold,
    textAlign: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyText: { color: THEME.grey, fontSize: 14, textAlign: 'center' },
  errorText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center' },
  cta: {
    backgroundColor: THEME.orange,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: THEME.radius.control,
  },
  ctaText: { color: '#fff', fontFamily: FONT.bold, fontSize: 15 },

  list: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    padding: 14,
    gap: 14,
  },
  pressed: { opacity: 0.8 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: THEME.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 22 },
  rowInfo: { flex: 1 },
  rowTitle: { color: THEME.ink, fontSize: 15, fontFamily: FONT.semibold },
  rowStatus: { color: THEME.inkSoft, fontSize: 13, marginTop: 2 },
  rowDate: { color: THEME.grey, fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowPrice: { color: THEME.ink, fontSize: 14, fontWeight: '700' },
  chevron: { color: THEME.grey, fontSize: 22, lineHeight: 22 },
});
