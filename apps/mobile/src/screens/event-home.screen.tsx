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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiGetPublicEvent, formatTime, type PublicEvent } from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { useAuthStore } from '@store/auth.store';

type Props = NativeStackScreenProps<RootStackParamList, 'EventHome'>;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'En cours', color: '#16a34a' },
  DRAFT: { label: 'Brouillon', color: '#d97706' },
  CANCELLED: { label: 'Annulé', color: '#dc2626' },
  ENDED: { label: 'Terminé', color: '#6b7280' },
};

export function EventHomeScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { token } = useAuthStore();
  const { initCart, resetCart } = useCartStore();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetPublicEvent(eventId);
      setEvent(data);
      // Reset any previous cart for this event
      resetCart();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [eventId, resetCart]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectSupplier = (supplierId: string) => {
    if (!token) {
      // Redirect to login, preserving the event context
      navigation.navigate('Login', { pendingEventId: eventId });
      return;
    }
    initCart(eventId, supplierId);
    navigation.navigate('SupplierCatalog', { eventId, supplierId });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Chargement de l'événement…</Text>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Événement introuvable</Text>
        <Text style={styles.errorText}>{error ?? 'Aucune donnée disponible.'}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
      </View>
    );
  }

  const status = STATUS_LABELS[event.status] ?? { label: event.status, color: '#6b7280' };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('QRScanner')} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.eventName} numberOfLines={2}>
            {event.name}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
      </View>

      {/* Venue info */}
      {event.venue && (
        <View style={styles.venueBar}>
          <Text style={styles.venueIcon}>📍</Text>
          <Text style={styles.venueName}>{event.venue.name}</Text>
          {event.startAt && (
            <Text style={styles.venueTime}>
              {formatTime(event.startAt)} – {formatTime(event.endAt)}
            </Text>
          )}
        </View>
      )}

      {/* Suppliers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Choisir un stand</Text>
        <Text style={styles.sectionSub}>{event.suppliers.length} stand(s) disponible(s)</Text>
      </View>

      {event.suppliers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Aucun stand disponible pour le moment.</Text>
        </View>
      ) : (
        <FlatList
          data={event.suppliers}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor="#2563eb"
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.supplierCard, pressed && styles.pressed]}
              onPress={() => handleSelectSupplier(item.id)}
            >
              <View style={styles.supplierAvatar}>
                <Text style={styles.supplierInitial}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.supplierInfo}>
                <Text style={styles.supplierName}>{item.name}</Text>
                {item.description && (
                  <Text style={styles.supplierDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
              </View>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          )}
        />
      )}

      {/* Login hint if not authenticated */}
      {!token && (
        <View style={styles.loginHint}>
          <Text style={styles.loginHintText}>
            Connectez-vous pour passer une commande
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Login', { pendingEventId: eventId })}
            style={styles.loginHintBtn}
          >
            <Text style={styles.loginHintBtnText}>Se connecter</Text>
          </Pressable>
        </View>
      )}
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
  errorTitle: { color: '#f87171', fontSize: 18, fontWeight: '700' },
  errorText: { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
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
  backBtn: { padding: 4 },
  backArrow: { color: '#94a3b8', fontSize: 20 },
  backText: { color: '#2563eb', fontSize: 14 },
  headerInfo: { flex: 1 },
  eventName: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', lineHeight: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },

  venueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 8,
  },
  venueIcon: { fontSize: 14 },
  venueName: { color: '#94a3b8', fontSize: 13, flex: 1 },
  venueTime: { color: '#64748b', fontSize: 12 },

  section: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  sectionSub: { color: '#64748b', fontSize: 13, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },

  supplierCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pressed: { opacity: 0.75 },
  supplierAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierInitial: { color: '#fff', fontSize: 20, fontWeight: '800' },
  supplierInfo: { flex: 1 },
  supplierName: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  supplierDesc: { color: '#94a3b8', fontSize: 13, marginTop: 2, lineHeight: 18 },
  arrow: { color: '#4b5563', fontSize: 18 },

  emptyBox: {
    margin: 20,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },

  loginHint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1e293b',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  loginHintText: { color: '#94a3b8', fontSize: 13, flex: 1 },
  loginHintBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loginHintBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
