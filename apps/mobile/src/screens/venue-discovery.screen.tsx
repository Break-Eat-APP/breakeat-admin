import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
import { useUserLocation } from '@lib/hooks/use-user-location';
import { useNotifStore } from '@store/notif.store';
import { apiSearchVenues, type PublicVenue } from '@lib/api/mobile-api';
import { showAlert } from '@lib/alert';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { BuvettePlanViewer } from '@components/buvette-plan-viewer';
import { THEME, shadowCard, HEAD } from '@lib/theme';

const LOGO_FULL_WHITE = require('../../assets/logo-full-white.png');

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

type Fav = { id: string; name: string; imageUrl: string | null };
type Up = { id: string; title: string; date: string; venue: string; image: string };

/**
 * « À venir » — vide tant que la source de données n'existe pas.
 *
 * Cette section a longtemps affiché trois événements ÉCRITS EN DUR, avec des
 * photos tirées d'un service d'images aléatoires. Ils ressemblaient à de vrais
 * matchs, n'existaient dans aucune base, et ne pouvaient donc être supprimés
 * depuis aucun écran d'administration. Un club y voyait une programmation
 * qu'il n'avait pas saisie et ne pouvait pas corriger.
 *
 * Mieux vaut une section vide, qui dit la vérité, qu'une fausse programmation
 * crédible. Elle se remplira quand les événements viendront de Flaix.
 */
const UPCOMING: Up[] = [];

export function VenueDiscoveryScreen() {
  // Espace sous le contenu : la barre flottante ne doit rien recouvrir.
  // Calcule a l'execution car il depend de la zone sure de l'appareil.
  const espaceBas = useBottomBarSpace();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { hasUnread, markRead } = useNotifStore();
  const { coords, status: locStatus, request: requestLocation } = useUserLocation();
  const [query, setQuery] = useState('');
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState('Plan des buvettes');

  // Lieux réels (API), rechargés quand la recherche ou la position changent.
  const [venues, setVenues] = useState<PublicVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Favoris pilotés par le cœur (CTA). Local pour l'instant — persistance backend à venir.
  const [favorites, setFavorites] = useState<Fav[]>([]);
  const isFav = (id: string) => favorites.some((f) => f.id === id);
  const toggleFav = (fav: Fav) =>
    setFavorites((cur) =>
      cur.some((f) => f.id === fav.id) ? cur.filter((f) => f.id !== fav.id) : [...cur, fav],
    );

  const openPlan = (name: string, url: string) => {
    setPlanTitle(`Buvettes · ${name}`);
    setPlanUrl(url);
  };

  const granted = locStatus === 'granted';

  const loadVenues = useCallback(async (q: string, lat?: number, lng?: number) => {
    setLoading(true);
    setError(null);
    try {
      setVenues(await apiSearchVenues({ q: q || undefined, lat, lng, radiusKm: 10 }));
    } catch (e: unknown) {
      // Détail en console pour le debug ; message clair et neutre à l'écran.
      console.warn('apiSearchVenues a échoué:', e);
      setError('Impossible de charger les lieux pour le moment. Réessaie plus tard.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Position demandée au montage (silencieux).
  useEffect(() => {
    requestLocation({ silent: true });
  }, [requestLocation]);

  // Recherche débouncée + rechargement quand la position arrive.
  useEffect(() => {
    const t = setTimeout(() => {
      void loadVenues(query.trim(), coords?.lat, coords?.lng);
    }, 300);
    return () => clearTimeout(t);
  }, [query, coords, loadVenues]);

  // Ouvre un lieu : Flaix > événement actif > « Bientôt ».
  const openVenue = (v: PublicVenue) => {
    if (v.flaixEnabled) {
      navigation.navigate('FlaixOrder', { venueId: v.id, flaixVenueId: v.flaixVenueId });
    } else if (v.currentEventId) {
      navigation.navigate('EventHome', { eventId: v.currentEventId });
    } else {
      showAlert('Bientôt', `${v.name} n'a pas encore d'événement ouvert à la commande.`);
    }
  };

  return (
    <View style={styles.root}>
      {/* Bandeau orange */}
      <View style={[styles.band, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Image source={LOGO_FULL_WHITE} style={styles.lockup} resizeMode="contain" />
          <View style={styles.headerIcons}>
            <Pressable onPress={markRead} hitSlop={8} style={styles.bellWrap}>
              <Ionicons name="notifications-outline" size={26} color="#fff" />
              {hasUnread && <View style={styles.notifDot} />}
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
              <Ionicons name="menu" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: espaceBas }]} showsVerticalScrollIndicator={false}>
        {/* Recherche */}
        <View style={[styles.searchBox, shadowCard]}>
          <Ionicons name="search" size={18} color={THEME.grey} />
          <TextInput
            style={[styles.searchInput, NO_OUTLINE]}
            placeholder="Rechercher une ville, un lieu ou un club"
            placeholderTextColor={THEME.grey}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <Pressable onPress={() => requestLocation()} hitSlop={10}>
            <Ionicons name="locate" size={20} color={granted ? THEME.orange : THEME.ink} />
          </Pressable>
        </View>

        {/* Invite géolocalisation (si désactivée) */}
        {!granted && (
          <View style={[styles.geoBanner, shadowCard]}>
            <View style={styles.geoIcon}>
              <Ionicons name="location" size={22} color={THEME.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.geoTitle}>Active ta position</Text>
              <Text style={styles.geoSub}>Pour découvrir les événements près de chez toi.</Text>
            </View>
            <Pressable style={styles.geoBtn} onPress={() => requestLocation()}>
              <Ionicons name="navigate" size={14} color="#fff" />
              <Text style={styles.geoBtnText}>Activer</Text>
            </Pressable>
          </View>
        )}

        {/* 1. Lieux près de chez vous (données réelles — GET /public/venues) */}
        <SectionHeader icon="location" title="Lieux près de toi" />
        {loading ? (
          <View style={styles.sectionLoading}>
            <ActivityIndicator color={THEME.orange} />
          </View>
        ) : error ? (
          <EmptyHint icon="cloud-offline-outline" text={error} />
        ) : venues.length === 0 ? (
          <EmptyHint
            icon="location-outline"
            text={
              query.trim()
                ? 'Aucun lieu ne correspond à ta recherche.'
                : granted
                  ? 'Aucun lieu à moins de 10 km. Cherche un club par son nom.'
                  : // Sans position, l'app n'a RIEN cherché : annoncer « aucun
                    // lieu près de toi » laisserait croire qu'elle a regardé.
                    'Active ta position, ou cherche un club par son nom.'
            }
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {venues.map((v) => {
              const plan = v.buvettePlanUrl;
              const open = v.flaixEnabled || v.currentEventId != null;
              const status =
                v.distanceKm != null
                  ? `${v.distanceKm.toFixed(1).replace('.', ',')} km`
                  : open
                    ? 'Ouvert'
                    : 'Bientôt';
              return (
                <Pressable key={v.id} style={[styles.nearbyCard, shadowCard]} onPress={() => openVenue(v)}>
                  <View style={styles.nearbyPhoto}>
                    {v.imageUrl ? (
                      <Image source={{ uri: v.imageUrl }} style={styles.logoImg} resizeMode="contain" />
                    ) : (
                      <Text style={styles.logoFallback}>{v.name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.nearbyName} numberOfLines={2}>{v.name}</Text>
                  <View style={styles.nearbyMeta}>
                    <Ionicons
                      name={v.distanceKm != null ? 'navigate-outline' : 'time-outline'}
                      size={12}
                      color={THEME.inkSoft}
                    />
                    <Text style={styles.nearbyMetaText} numberOfLines={1}>{status}</Text>
                    <Pressable onPress={() => toggleFav({ id: v.id, name: v.name, imageUrl: v.imageUrl })} hitSlop={8}>
                      <Ionicons name={isFav(v.id) ? 'heart' : 'heart-outline'} size={17} color={THEME.orange} />
                    </Pressable>
                  </View>
                  {plan ? (
                    <Pressable onPress={() => openPlan(v.name, plan)} style={styles.planBtn} hitSlop={4}>
                      <Ionicons name="map-outline" size={13} color={THEME.orange} />
                      <Text style={styles.planBtnText} numberOfLines={1}>Plan des buvettes</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* 2. Vos lieux favoris */}
        <SectionHeader icon="star" title="Tes lieux favoris" />
        {favorites.length === 0 ? (
          <EmptyHint icon="heart-outline" text="Touche le cœur d'un lieu pour l'ajouter à tes favoris." />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {favorites.map((v) => (
              <View key={v.id} style={[styles.favCard, shadowCard]}>
                <View style={styles.favLogo}>
                  {v.imageUrl ? (
                    <Image source={{ uri: v.imageUrl }} style={styles.logoImg} resizeMode="contain" />
                  ) : (
                    <Text style={styles.favLogoFallback}>{v.name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <Text style={styles.favName} numberOfLines={2}>{v.name}</Text>
                <Pressable onPress={() => toggleFav(v)} hitSlop={8}>
                  <Ionicons name="heart" size={18} color={THEME.orange} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* 3. Vos prochains événements */}
        <SectionHeader icon="calendar" title="À venir" action="Voir tout" />
        {UPCOMING.length === 0 ? (
          <EmptyHint icon="calendar-outline" text="Ajoute des lieux en favoris pour voir leurs événements à venir." />
        ) : (
        <View style={[styles.upcomingCard, shadowCard]}>
          {UPCOMING.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.upRow}>
                <View style={styles.upLogo}>
                  <Image source={{ uri: e.image }} style={styles.fillImg} resizeMode="cover" />
                </View>
                <View style={styles.upInfo}>
                  <Text style={styles.upTitle} numberOfLines={1}>{e.title}</Text>
                  <View style={styles.upMetaRow}>
                    <Ionicons name="calendar-outline" size={12} color={THEME.inkSoft} />
                    <Text style={styles.upMeta} numberOfLines={1}>{e.date}</Text>
                  </View>
                  <View style={styles.upMetaRow}>
                    <Ionicons name="location-outline" size={12} color={THEME.inkSoft} />
                    <Text style={styles.upMeta} numberOfLines={1}>{e.venue}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={THEME.grey} />
              </View>
            </View>
          ))}
        </View>
        )}
      </ScrollView>

      <BuvettePlanViewer
        visible={planUrl !== null}
        url={planUrl}
        title={planTitle}
        onClose={() => setPlanUrl(null)}
      />
    </View>
  );
}

function EmptyHint({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={styles.emptyHint}>
      <Ionicons name={icon} size={18} color={THEME.grey} />
      <Text style={styles.emptyHintText}>{text}</Text>
    </View>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  action?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon} size={18} color={THEME.orange} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? <Text style={styles.sectionAction}>{action} ›</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  scroll: {},

  band: { backgroundColor: THEME.orange, paddingBottom: 16, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  lockup: { width: 150, height: 150 * (212 / 760) },
  headerIcons: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 18 },
  bellWrap: {},
  notifDot: {
    position: 'absolute', top: -1, right: -1, width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#22c55e', borderWidth: 2, borderColor: THEME.orange,
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: THEME.surface, borderRadius: THEME.radius.pill,
    borderWidth: 1, borderColor: THEME.border,
    paddingHorizontal: 18, marginHorizontal: 16, marginTop: 16,
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: THEME.ink, fontFamily: HEAD.medium },

  geoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: THEME.surface, borderRadius: THEME.radius.card,
    padding: 14, marginHorizontal: 16, marginTop: 14,
  },
  geoIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: THEME.orangeTint,
    alignItems: 'center', justifyContent: 'center',
  },
  geoTitle: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold },
  geoSub: { color: THEME.inkSoft, fontSize: 12.5, fontFamily: HEAD.medium, marginTop: 1, lineHeight: 16 },
  geoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: THEME.orange, borderRadius: THEME.radius.pill,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  geoBtnText: { color: '#fff', fontSize: 14, fontFamily: HEAD.bold },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginTop: 34, marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: THEME.ink, fontSize: 17, fontFamily: HEAD.bold, letterSpacing: 0.3 },
  sectionAction: { color: THEME.orange, fontSize: 13, fontFamily: HEAD.semibold },

  hScroll: { paddingHorizontal: 16, gap: 12 },
  sectionLoading: { paddingVertical: 26, alignItems: 'center' },

  emptyHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, backgroundColor: THEME.bgSubtle,
    borderRadius: THEME.radius.card, paddingVertical: 18, paddingHorizontal: 16,
  },
  emptyHintText: { flex: 1, color: THEME.grey, fontSize: 13, fontFamily: HEAD.medium, lineHeight: 18 },

  nearbyCard: {
    width: 158, height: 210, backgroundColor: THEME.surface, borderRadius: 16, padding: 10, gap: 6,
  },
  nearbyPhoto: {
    height: 92, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: THEME.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 8,
  },
  planBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: THEME.orangeTint, borderRadius: 8, paddingVertical: 8, marginTop: 'auto',
  },
  planBtnText: { color: THEME.orange, fontSize: 11.5, fontFamily: HEAD.bold },
  fillImg: { width: '100%', height: '100%' },
  logoImg: { width: '92%', height: '92%' },
  logoFallback: { fontSize: 30, fontFamily: HEAD.bold, color: THEME.orange },
  nearbyName: { color: THEME.ink, fontSize: 13.5, fontFamily: HEAD.bold, lineHeight: 17, height: 34 },
  nearbyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nearbyMetaText: { flex: 1, color: THEME.inkSoft, fontSize: 12, fontFamily: HEAD.medium },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: THEME.orangeTint, paddingHorizontal: 8, paddingVertical: 4, borderRadius: THEME.radius.pill,
  },
  badgeText: { color: THEME.orange, fontSize: 11, fontFamily: HEAD.semibold },

  favCard: {
    width: 176, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: THEME.surface, borderRadius: 14, padding: 10,
  },
  favLogo: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: THEME.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 3,
  },
  favLogoFallback: { fontSize: 18, fontFamily: HEAD.bold, color: THEME.orange },
  favName: { flex: 1, color: THEME.ink, fontSize: 12.5, fontFamily: HEAD.semibold, lineHeight: 16 },

  upcomingCard: { backgroundColor: THEME.surface, borderRadius: 16, marginHorizontal: 16, paddingHorizontal: 14 },
  divider: { height: 1, backgroundColor: THEME.border },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  upLogo: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: THEME.bgSubtle, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  upInfo: { flex: 1, gap: 2 },
  upTitle: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold },
  upMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upMeta: { flex: 1, color: THEME.inkSoft, fontSize: 12, fontFamily: HEAD.medium },
  upActions: { alignItems: 'center', gap: 8 },
  cmdBtn: { backgroundColor: THEME.orange, paddingHorizontal: 14, paddingVertical: 8, borderRadius: THEME.radius.pill },
  cmdText: { color: '#fff', fontSize: 13, fontFamily: HEAD.bold },
});
