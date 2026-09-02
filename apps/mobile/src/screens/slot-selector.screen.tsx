import React, { useCallback, useEffect, useState } from 'react';
import { THEME } from '@lib/theme';
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
import { Ionicons } from '@expo/vector-icons';

type Props = NativeStackScreenProps<RootStackParamList, 'SlotSelector'>;

/**
 * UNE heure, pas trois.
 *
 * Le créneau affichait « 19:45 – 20:00 — 17:45 » : la plage, puis le libellé
 * du club, qui disait une heure différente à cause d'un décalage de fuseau.
 * Trois nombres pour un seul rendez-vous, dont deux se contredisaient.
 *
 * Le client n'a besoin que de l'heure à laquelle il vient. Le libellé du club
 * fait foi quand il existe — c'est lui qui a été écrit pour être lu (« Immédiat »,
 * « Mi-temps », « 17h45 ») ; sinon, l'heure de début.
 */
function slotLabel(slot: PublicSlot): string {
  if (slot.label?.trim()) return slot.label.trim();
  return formatTime(slot.startAt);
}

export function SlotSelectorScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { setSlot, selectedSlotId, supplierId } = useCartStore();

  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetPublicSlots(eventId, supplierId);
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
          <ActivityIndicator size="large" color={THEME.orange} />
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
                  <Text style={styles.slotTime}>{slotLabel(item)}</Text>
                </View>

                {/* Plus de compteur de places : le club n'en gere pas, et
                    « 1000000 places » ne voulait rien dire. Reste ce qui
                    compte — le creneau choisi. */}
                <View style={styles.slotRight}>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={THEME.orange} />
                  )}
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
  headerTitle: { color: THEME.ink, fontSize: 18, fontWeight: '700' },

  subtitle: {
    color: THEME.inkSoft,
    fontSize: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    lineHeight: 20,
  },

  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 40 },

  slotCard: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: THEME.bgSubtle,
  },
  slotCardSelected: {
    borderColor: THEME.orange,
    backgroundColor: THEME.orangeTint,
  },
  slotCardFull: {
    opacity: 0.4,
  },

  slotLeft: { flex: 1 },
  slotTime: { color: THEME.ink, fontSize: 22, fontWeight: '800' },
  slotTimeFull: { color: THEME.grey },

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
    backgroundColor: THEME.bgSubtle,
    borderRadius: 2,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 2,
  },

  emptyBox: {
    margin: 20,
    backgroundColor: THEME.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { color: THEME.grey, fontSize: 14, textAlign: 'center' },
});
