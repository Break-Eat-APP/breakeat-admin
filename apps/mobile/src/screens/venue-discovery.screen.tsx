import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiSearchVenues, type PublicVenue } from '@lib/api/mobile-api';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { useNotifStore } from '@store/notif.store';
import { THEME, shadowCard, FONT } from '@lib/theme';

const LOGO_FULL_WHITE = require('../../assets/logo-full-white.png');

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Supprime le contour bleu de focus du navigateur (react-native-web uniquement).
const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

export function VenueDiscoveryScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { hasUnread, markRead } = useNotifStore();
  const { coords, status: locStatus, request: requestLocation } = useUserLocation();

  const [query, setQuery] = useState('');
  const [venues, setVenues] = useState<PublicVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiSearchVenues({
        q: query.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      });
      setVenues(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [query, coords]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  // Demande la localisation au démarrage → lieux les plus proches en priorité.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const handleSelect = (venue: PublicVenue) => {
    // Lieu Flaix → relais à Flaix (intégration API).
    if (venue.flaixEnabled) {
      navigation.navigate('FlaixOrder', { venueId: venue.id, flaixVenueId: venue.flaixVenueId });
      return;
    }
    // Sinon : parcours Break Eat natif si un événement est actif.
    if (venue.currentEventId) {
      navigation.navigate('EventHome', { eventId: venue.currentEventId });
    }
  };

  return (
    <View style={styles.root}>
      {/* Bandeau orange plein cadre — logo centré, panier + cloche à droite */}
      <View style={[styles.band, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Image source={LOGO_FULL_WHITE} style={styles.lockup} resizeMode="contain" />
          <View style={styles.headerIcons}>
            <Pressable onPress={() => navigation.navigate('Cart')} hitSlop={8}>
              <Ionicons name="cart-outline" size={26} color="#fff" />
            </Pressable>
            <Pressable onPress={markRead} hitSlop={8} style={styles.bellWrap}>
              <Ionicons name="notifications-outline" size={26} color="#fff" />
              {hasUnread && <View style={styles.notifDot} />}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Recherche — pill blanche dans la zone blanche, sous le bandeau */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, shadowCard]}>
          <TextInput
            style={[styles.searchInput, NO_OUTLINE]}
            placeholder="Entrez une ville, une adresse, un lieu"
            placeholderTextColor={THEME.grey}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <Pressable onPress={requestLocation} hitSlop={10}>
            {locStatus === 'requesting' ? (
              <ActivityIndicator color={THEME.orange} size="small" />
            ) : (
              <Ionicons
                name="locate"
                size={22}
                color={locStatus === 'granted' ? THEME.orange : THEME.ink}
              />
            )}
          </Pressable>
        </View>
      </View>

      {/* Invite à activer la localisation (tant qu'elle n'est pas accordée) */}
      {locStatus !== 'granted' && locStatus !== 'requesting' && (
        <Pressable onPress={requestLocation} style={styles.geoCta}>
          <Ionicons name="location-outline" size={18} color={THEME.orange} />
          <Text style={styles.geoCtaText}>
            {locStatus === 'denied'
              ? 'Localisation refusée — activez-la pour voir les lieux proches, ou cherchez ci-dessus.'
              : 'Activer ma localisation pour voir les lieux les plus proches'}
          </Text>
        </Pressable>
      )}

      {/* Titre */}
      <View style={styles.titleBlock}>
        <Text style={styles.title}>LA BUVETTE EN LIGNE</Text>
        <Text style={styles.subtitle}>File prioritaire &amp; sans file d'attente</Text>
      </View>

      {/* Liste des lieux (1 colonne) */}
      {loading && venues.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.orange} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : venues.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {query.trim() ? 'Aucun lieu pour cette recherche.' : 'Aucun lieu disponible.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={venues}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={THEME.orange} />
          }
          renderItem={({ item }) => <VenueCard venue={item} onPress={() => handleSelect(item)} />}
        />
      )}
    </View>
  );
}

function VenueCard({ venue, onPress }: { venue: PublicVenue; onPress: () => void }) {
  const closed = !venue.flaixEnabled && !venue.currentEventId;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, shadowCard, pressed && !closed && styles.cardPressed]}
    >
      {venue.imageUrl ? (
        <Image source={{ uri: venue.imageUrl }} style={styles.cardImg} resizeMode="contain" />
      ) : (
        <Text style={styles.cardName}>{venue.name}</Text>
      )}

      {venue.distanceKm !== null && (
        <View style={styles.cardMeta}>
          <View style={styles.distancePill}>
            <Ionicons name="navigate" size={12} color={THEME.orange} />
            <Text style={styles.distanceText}>{formatDistance(venue.distanceKm)}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },

  band: { backgroundColor: THEME.orange, paddingBottom: 16, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 6,
  },
  lockup: { width: 150, height: 150 * (212 / 760) },
  headerIcons: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  bellWrap: {},
  notifDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: THEME.orange,
  },

  searchWrap: { paddingHorizontal: 16, marginTop: 16 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 10,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: THEME.ink, fontFamily: FONT.regular },

  geoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.orangeTint,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: THEME.radius.control,
  },
  geoCtaText: { flex: 1, color: THEME.orangeDark, fontSize: 13, fontFamily: FONT.medium, lineHeight: 18 },

  titleBlock: { alignItems: 'center', paddingTop: 26, paddingBottom: 18 },
  title: { color: THEME.orange, fontSize: 26, fontFamily: FONT.bold, letterSpacing: 0.5 },
  subtitle: { color: THEME.inkSoft, fontSize: 14, marginTop: 4, fontFamily: FONT.medium },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', fontFamily: FONT.regular },
  emptyText: { color: THEME.grey, fontSize: 14, textAlign: 'center', fontFamily: FONT.regular },
  retryBtn: {
    backgroundColor: THEME.orange,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: THEME.radius.pill,
  },
  retryText: { color: '#fff', fontFamily: FONT.bold, fontSize: 15 },

  list: { paddingHorizontal: 20, paddingBottom: 120, gap: 18 },
  card: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  cardImg: { width: '70%', height: '70%' },
  cardName: { color: THEME.ink, fontSize: 20, fontFamily: FONT.bold, textAlign: 'center' },
  cardMeta: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.orangeTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.radius.pill,
  },
  distanceText: { color: THEME.orange, fontSize: 12, fontFamily: FONT.bold },
});
