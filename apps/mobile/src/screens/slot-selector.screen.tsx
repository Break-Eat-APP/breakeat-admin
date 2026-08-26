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

/**
 * Un créneau « moment » (mi-temps, entracte) court sur toute la journée : il n'a
 * pas d'heure. Afficher ses bornes donnait « 02:00 – 02:00 », qui n'apprenait
 * rien et faisait douter de tout l'écran.
 *
 * On le reconnaît à sa durée : 24 h pile ne décrit pas un retrait.
 */
function estUnMoment(slot: PublicSlot): boolean {
  const duree = new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime();
  return duree >= 23 * 3600 * 1000;
}

function slotLabel(slot: PublicSlot): string {
  if (estUnMoment(slot)) return slot.label ?? 'Moment';
  const plage = `${formatTime(slot.startAt)} – ${formatTime(slot.endAt)}`;
  // Le libellé ne se répète pas quand il redit l'heure.
  return slot.label && slot.label !== formatTime(slot.startAt)
    ? `${plage} — ${slot.label}`
    : plage;
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
            const isSelected = selectedSlotId === item.id;

            return (
              <Pressable
                style={[
                  styles.slotCard,
                  isSelected && styles.slotCardSelected,
                ]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.slotLeft}>
                  {estUnMoment(item) ? (
                    /* Pas d'heure : le nom du moment EST l'information. */
                    <Text style={[styles.slotTime]}>
                      {item.label ?? 'Moment'}
                    </Text>
                  ) : (
                    <>
                      <Text style={[styles.slotTime]}>
                        {formatTime(item.startAt)}
                      </Text>
                      <Text style={styles.slotEnd}>– {formatTime(item.endAt)}</Text>
                      {item.label && item.label !== formatTime(item.startAt) && (
                        <Text style={styles.slotSubLabel}>{item.label}</Text>
                      )}
                    </>
                  )}
                </View>

                {/* Plus de compteur de places : le club n'en gere pas, et
                    « 1000000 places » ne voulait rien dire. Reste ce qui
                    compte — le creneau choisi. */}
                <View style={styles.slotRight}>
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
