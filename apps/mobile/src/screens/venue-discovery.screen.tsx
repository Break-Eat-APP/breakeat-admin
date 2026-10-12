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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { useNotifStore } from '@store/notif.store';
import { apiSearchVenues, type PublicVenue } from '@lib/api/mobile-api';
import { showAlert } from '@lib/alert';
import { cheminDeCommande, ouvertALaCommande } from '@lib/ouverture-lieu';
import { visuelDeLieu } from '@lib/visuel-lieu';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { BuvettePlanViewer } from '@components/buvette-plan-viewer';
import { THEME, shadowCard, HEAD } from '@lib/theme';

const LOGO_FULL_WHITE = require('../../assets/logo-full-white.png');

type Nav = NativeStackNavigationProp<RootStackParamList>;

const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

// Un favori retient les DEUX visuels : la tuile montre le logo, mais si le
// club n'en a pas, c'est la photo qui prend le relais (voir `visuelDeLieu`).
type Fav = { id: string; name: string; photoUrl: string | null; imageUrl: string | null };
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
  const { rafraichir } = useNotifStore();
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

  // Ouvre un lieu par LE chemin que `cheminDeCommande` désigne.
  //
  // La règle est partagée avec l'affichage de la carte (`ouvertALaCommande`) :
  // écrite deux fois, elle avait divergé — la navigation exigeait l'identifiant
  // Flaix, l'affichage non, et un lieu à moitié configuré s'annonçait
  // « Ouvert » puis refusait au doigt.
  const openVenue = (v: PublicVenue) => {
    const chemin = cheminDeCommande(v);
    if (chemin === 'flaix') {
      navigation.navigate('FlaixOrder', { venueId: v.id, flaixVenueId: v.flaixVenueId });
    } else if (chemin === 'evenement' && v.currentEventId) {
      navigation.navigate('EventHome', { eventId: v.currentEventId });
    } else {
      showAlert('Bientôt', `${v.name} n'a pas encore d'événement ouvert à la commande.`);
    }
  };

  // Le compte se relit a chaque retour sur l'accueil : une notification peut
  // etre arrivee telephone eteint, ou avoir ete lue depuis un autre appareil.
  useFocusEffect(
    useCallback(() => {
      void rafraichir();
    }, [rafraichir]),
  );

  return (
    <View style={styles.root}>
      {/*
        LE BANDEAU PORTE LA RECHERCHE.

        Elle flottait en dessous, sur le blanc : le bandeau ne contenait que
        le logo et occupait un cinquième de l'écran pour rien. Rentrée
        dedans, elle rend la tête utile et le contenu commence plus haut.
      */}
      <View style={[styles.band, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Image source={LOGO_FULL_WHITE} style={styles.lockup} resizeMode="contain" />
          <Pressable
            style={styles.avatar}
            onPress={() => navigation.navigate('Profile')}
            hitSlop={8}
            accessibilityLabel="Mon profil"
          >
            <Ionicons name="person" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color={THEME.grey} />
          <TextInput
            style={[styles.searchInput, NO_OUTLINE]}
            placeholder="Rechercher une ville, un lieu ou un club…"
            placeholderTextColor={THEME.grey}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {/* Le viseur se détache sur un rond teinté : sur fond blanc dans
              l'orange, une icône nue se perdait. */}
          <Pressable onPress={() => requestLocation()} hitSlop={10} style={styles.viseur}>
            <Ionicons name="locate" size={19} color={granted ? THEME.orange : THEME.inkSoft} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: espaceBas }]} showsVerticalScrollIndicator={false}>


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
              const open = ouvertALaCommande(v);
              const visuel = visuelDeLieu(v);
              const status =
                v.distanceKm != null
                  ? `${v.distanceKm.toFixed(1).replace('.', ',')} km`
                  : open
                    ? 'Ouvert'
                    : 'Bientôt';
              return (
                <Pressable key={v.id} style={[styles.nearbyCard, shadowCard]} onPress={() => openVenue(v)}>
                  {/* La photo porte la carte : elle occupe les deux tiers. */}
                  <View style={styles.cardPhoto}>
                    {visuel.type === 'image' ? (
                      <Image
                        source={{ uri: visuel.uri }}
                        // Une photo remplit le cadre ; un logo reste entier et
                        // respire sur le fond. Le style suit le cadrage, sinon
                        // l'écusson touche les bords.
                        style={visuel.cadrage === 'cover' ? styles.fillImg : styles.logoCarte}
                        resizeMode={visuel.cadrage}
                      />
                    ) : (
                      <Text style={styles.logoFallback}>{visuel.lettre}</Text>
                    )}

                    {/* Distance et cœur POSÉS sur la photo : ils ne volent
                        plus de place au nom, et se lisent d'un coup d'œil. */}
                    <View style={styles.badgeDistance}>
                      <Ionicons
                        name={v.distanceKm != null ? 'navigate' : 'time-outline'}
                        size={12}
                        color="#fff"
                      />
                      <Text style={styles.badgeDistanceText} numberOfLines={1}>{status}</Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        toggleFav({
                          id: v.id,
                          name: v.name,
                          photoUrl: v.photoUrl,
                          imageUrl: v.imageUrl,
                        })
                      }
                      hitSlop={10}
                      style={styles.badgeCoeur}
                      accessibilityLabel={isFav(v.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      <Ionicons
                        name={isFav(v.id) ? 'heart' : 'heart-outline'}
                        size={18}
                        color={isFav(v.id) ? THEME.orange : '#fff'}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.cardPied}>
                    <View style={styles.cardTextes}>
                      <Text style={styles.cardNom} numberOfLines={1}>{v.name}</Text>
                      <View style={styles.cardLieuRow}>
                        <Ionicons name="location" size={13} color={THEME.inkSoft} />
                        <Text style={styles.cardAdresse} numberOfLines={1}>{v.address}</Text>
                      </View>
                    </View>
                    {/* Le plan reste accessible, en second rôle. */}
                    {plan ? (
                      <Pressable onPress={() => openPlan(v.name, plan)} hitSlop={8} style={styles.cardPlan}>
                        <Ionicons name="map-outline" size={17} color={THEME.orange} />
                      </Pressable>
                    ) : null}
                    <View style={styles.cardFleche}>
                      <Ionicons name="chevron-forward" size={18} color={THEME.orange} />
                    </View>
                  </View>
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
            {favorites.map((v) => {
              // Dans 56 px, un écusson se reconnaît ; un bout de pelouse
              // recadré, non. D'où l'ordre inversé par rapport à la carte.
              const visuel = visuelDeLieu(v, 'logo');
              return (
              <View key={v.id} style={[styles.favCard, shadowCard]}>
                <View style={styles.favLogo}>
                  {visuel.type === 'image' ? (
                    <Image
                      source={{ uri: visuel.uri }}
                      style={visuel.cadrage === 'cover' ? styles.fillImg : styles.logoImg}
                      resizeMode={visuel.cadrage}
                    />
                  ) : (
                    <Text style={styles.favLogoFallback}>{visuel.lettre}</Text>
                  )}
                </View>
                <Text style={styles.favName} numberOfLines={2}>{v.name}</Text>
                <Pressable onPress={() => toggleFav(v)} hitSlop={8}>
                  <Ionicons name="heart" size={18} color={THEME.orange} />
                </Pressable>
              </View>
              );
            })}
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

  // Le bandeau descend plus bas : il porte le logo, le profil ET la
  // recherche.
  //
  // UN SEUL coin arrondi, en bas a GAUCHE. L'asymetrie est voulue : elle donne
  // au bandeau le sens de lecture, de la gauche vers la droite, au lieu de la
  // tuile centree que donnent deux coins egaux. Le cote droit reste d'equerre
  // avec le bord de l'ecran.
  band: {
    backgroundColor: THEME.orange,
    paddingBottom: 18,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 26,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 4,
  },
  lockup: { width: 150, height: 150 * (212 / 760) },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: THEME.surface, borderRadius: THEME.radius.pill,
    paddingLeft: 18, paddingRight: 6, marginTop: 10,
  },
  searchInput: { flex: 1, paddingVertical: 15, fontSize: 15, color: THEME.ink, fontFamily: HEAD.medium },
  viseur: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME.orangeTint,
  },

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

  // Une carte qu'on voit de loin : la photo d'abord, le texte ensuite.
  // L'ancienne (158 x 210, photo de 92) montrait surtout du blanc.
  nearbyCard: {
    width: 272, backgroundColor: THEME.surface, borderRadius: 20, padding: 8, gap: 2,
  },
  cardPhoto: {
    height: 168, borderRadius: 14, backgroundColor: THEME.orangeTint,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  // Pastilles posées sur la photo : fond sombre translucide, lisible sur
  // n'importe quelle image — un fond blanc disparaitrait sur un ciel clair.
  badgeDistance: {
    position: 'absolute', top: 10, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(28, 25, 23, 0.55)', borderRadius: THEME.radius.pill,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  badgeDistanceText: { color: '#fff', fontSize: 11.5, fontFamily: HEAD.bold },
  badgeCoeur: {
    position: 'absolute', top: 10, right: 10,
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(28, 25, 23, 0.45)',
  },

  cardPied: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4 },
  cardTextes: { flex: 1, gap: 3 },
  cardNom: { color: THEME.ink, fontSize: 16.5, fontFamily: HEAD.bold },
  cardLieuRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardAdresse: { flex: 1, color: THEME.inkSoft, fontSize: 12.5, fontFamily: HEAD.medium },
  cardPlan: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.orangeTint,
  },
  cardFleche: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.orangeTint,
  },
  fillImg: { width: '100%', height: '100%' },
  // Un logo dans le grand cadre de la carte : entier, et de l'air autour.
  logoCarte: { width: '72%', height: '72%' },
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
