import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiGetPublicSlots, formatTime, type PublicSlot } from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { PageHeader } from '@components/page-header';

type Props = NativeStackScreenProps<RootStackParamList, 'SlotSelector'>;

function slotLabel(slot: PublicSlot): string {
  const start = formatTime(slot.startAt);
  const end = formatTime(slot.endAt);
  const label = slot.label ? ` — ${slot.label}` : '';
  return `${start} – ${end}${label}`;
}

function slotAvailability(slot: PublicSlot): { text: string; color: string } {
  const remaining = slot.capacity - slot.currentLoad;
  if (remaining <= 0) return { text: 'Complet', color: '#dc2626' };
  if (remaining <= 5) return { text: `${remaining} places`, color: '#d97706' };
  return { text: `${remaining} places`, color: '#16a34a' };
}

export function SlotSelectorScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { setSlot, selectedSlotId } = useCartStore();

  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetPublicSlots(eventId);
      setSlots(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelect = (slot: PublicSlot) => {
    const remaining = slot.capacity - slot.currentLoad;
    if (remaining <= 0) return; // Full slot — ignore tap
    setSlot(slot.id, slotLabel(slot));
    navigation.navigate('Checkout');
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <PageHeader title="Choisir un créneau" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Chargement des créneaux…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        <PageHeader title="Choisir un créneau" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title="Choisir un créneau" />

      <Text style={styles.subtitle}>
        Sélectionnez l'heure à laquelle vous récupérerez votre commande.
      </Text>

      {slots.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Aucun créneau disponible pour cet événement.</Text>
        </View>
      ) : (
        <FlatList
          data={slots}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const avail = slotAvailability(item);
            const isFull = item.currentLoad >= item.capacity;
            const isSelected = selectedSlotId === item.id;

            return (
              <Pressable
                style={[
                  styles.slotCard,
                  isSelected && styles.slotCardSelected,
                  isFull && styles.slotCardFull,
                ]}
                onPress={() => handleSelect(item)}
                disabled={isFull}
              >
                <View style={styles.slotLeft}>
                  <Text style={[styles.slotTime, isFull && styles.slotTimeFull]}>
                    {formatTime(item.startAt)}
                  </Text>
                  <Text style={styles.slotEnd}>– {formatTime(item.endAt)}</Text>
                  {item.label && <Text style={styles.slotSubLabel}>{item.label}</Text>}
                </View>

                <View style={styles.slotRight}>
                  <View style={[styles.availBadge, { backgroundColor: avail.color + '22' }]}>
                    <Text style={[styles.availText, { color: avail.color }]}>
                      {avail.text}
                    </Text>
                  </View>

                  {/* Capacity bar */}
                  <View style={styles.capacityBar}>
                    <View
                      style={[
                        styles.capacityFill,
                        {
                          width: `${Math.min(100, (item.currentLoad / item.capacity) * 100)}%`,
                          backgroundColor: avail.color,
                        },
                      ]}
                    />
                  </View>

                  {isSelected && <Text style={styles.selectedCheck}>✓</Text>}
                </View>
              </Pressable>
            );
          }}
        />
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
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },

  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    lineHeight: 20,
  },

  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 40 },

  slotCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  slotCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#1e3a5f',
  },
  slotCardFull: {
    opacity: 0.4,
  },

  slotLeft: { flex: 1 },
  slotTime: { color: '#f1f5f9', fontSize: 22, fontWeight: '800' },
  slotTimeFull: { color: '#6b7280' },
  slotEnd: { color: '#64748b', fontSize: 14 },
  slotSubLabel: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  slotRight: { alignItems: 'flex-end', gap: 8 },
  availBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  availText: { fontSize: 12, fontWeight: '700' },
  capacityBar: {
    width: 80,
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 2,
  },
  selectedCheck: { color: '#2563eb', fontSize: 18, fontWeight: '800' },

  emptyBox: {
    margin: 20,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
});
