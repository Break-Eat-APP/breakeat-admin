import React, { useEffect, useState } from 'react';
import {
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
import { BOTTOM_BAR_SPACE } from '@components/app-bottom-bar';
import { THEME, shadowCard, HEAD } from '@lib/theme';

const LOGO_FULL_WHITE = require('../../assets/logo-full-white.png');

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

// ─── DONNÉES D'EXEMPLE (placeholder) ────────────────────────────────
// TODO: remplacer par les vraies données Flaix + favoris (cf. mémoire home-final-spec).
// Logos réels des lieux/clubs.
const LOGO = {
  arena: require('../../assets/logos/arena-aix.png'),
  dome: require('../../assets/logos/le-dome.png'),
  spartiates: require('../../assets/logos/spartiates.png'),
  pauc: require('../../assets/logos/pauc.png'),
};
// Images d'événements thématisées (loremflickr) — remplacées plus tard par Flaix.
const PHOTO = (tags: string, lock: number, w = 200, h = 200) =>
  `https://loremflickr.com/${w}/${h}/${tags}?lock=${lock}`;

const NEARBY = [
  { id: 'n1', name: 'Arena Aix en Provence', events: 2, logo: LOGO.arena },
  { id: 'n2', name: 'Le Dôme Marseille', events: 3, logo: LOGO.dome },
  { id: 'n3', name: 'Palais Omnisports Marseille', events: 3, logo: LOGO.spartiates },
];
type Fav = { id: string; name: string; logo: number };
type Up = { id: string; title: string; date: string; venue: string; image: string };

const FAVORITES: Fav[] = [
  { id: 'f1', name: 'Arena Aix en Provence', logo: LOGO.arena },
  { id: 'f2', name: 'PAUC Handball', logo: LOGO.pauc },
];

const UPCOMING: Up[] = [
  { id: 'u1', title: 'Spartiates vs Nîmes Gard Roussillon', date: 'Sam. 5 juil. · 20h00', venue: 'Palais Omnisports Marseille', image: PHOTO('handball,sport,match', 10, 120, 120) },
  { id: 'u2', title: 'PAUC vs Montpellier HB', date: 'Dim. 6 juil. · 18h30', venue: 'Arena Aix en Provence', image: PHOTO('handball,arena,sport', 22, 120, 120) },
  { id: 'u3', title: 'Soirée Rock Live', date: 'Ven. 11 juil. · 21h00', venue: 'Le Dôme Marseille', image: PHOTO('concert,rock,stage', 33, 120, 120) },
];

export function VenueDiscoveryScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { hasUnread, markRead } = useNotifStore();
  const { status: locStatus, request: requestLocation } = useUserLocation();
  const [query, setQuery] = useState('');

  const granted = locStatus === 'granted';

  useEffect(() => {
    requestLocation({ silent: true });
  }, [requestLocation]);

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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

        {/* 1. Événements près de chez vous */}
        <SectionHeader icon="location" title="Événements près de toi" action="Voir tout" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {NEARBY.map((v) => (
            <View key={v.id} style={[styles.nearbyCard, shadowCard]}>
              <View style={styles.nearbyPhoto}>
                <Image source={v.logo} style={styles.logoImg} resizeMode="contain" />
              </View>
              <Text style={styles.nearbyName} numberOfLines={2}>{v.name}</Text>
              <View style={styles.nearbyMeta}>
                <Ionicons name="calendar-outline" size={13} color={THEME.inkSoft} />
                <Text style={styles.nearbyMetaText}>{v.events} événements</Text>
                <Ionicons name="heart-outline" size={16} color={THEME.orange} style={styles.nearbyHeart} />
              </View>
            </View>
          ))}
        </ScrollView>

        {/* 2. Vos lieux favoris */}
        <SectionHeader icon="star" title="Tes lieux favoris" action="Gérer" />
        {FAVORITES.length === 0 ? (
          <EmptyHint icon="heart-outline" text="Ajoute tes favoris pour les voir apparaître ici." />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {FAVORITES.map((v) => (
              <View key={v.id} style={[styles.favCard, shadowCard]}>
                <View style={styles.favLogo}>
                  <Image source={v.logo} style={styles.logoImg} resizeMode="contain" />
                </View>
                <Text style={styles.favName} numberOfLines={2}>{v.name}</Text>
                <Ionicons name="heart" size={18} color={THEME.orange} />
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
  action: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon} size={18} color={THEME.orange} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionAction}>{action} ›</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  scroll: { paddingBottom: BOTTOM_BAR_SPACE + 16 },

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

  emptyHint: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, backgroundColor: THEME.bgSubtle,
    borderRadius: THEME.radius.card, paddingVertical: 18, paddingHorizontal: 16,
  },
  emptyHintText: { flex: 1, color: THEME.grey, fontSize: 13, fontFamily: HEAD.medium, lineHeight: 18 },

  nearbyCard: {
    width: 150, backgroundColor: THEME.surface, borderRadius: 16, padding: 10, gap: 6,
  },
  nearbyPhoto: {
    height: 84, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: THEME.border,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: 8,
  },
  fillImg: { width: '100%', height: '100%' },
  logoImg: { width: '92%', height: '92%' },
  nearbyName: { color: THEME.ink, fontSize: 13.5, fontFamily: HEAD.bold, lineHeight: 17 },
  nearbyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nearbyMetaText: { flex: 1, color: THEME.inkSoft, fontSize: 12, fontFamily: HEAD.medium },
  nearbyHeart: { marginLeft: 'auto' as unknown as number },
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
