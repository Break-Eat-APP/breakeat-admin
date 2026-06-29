import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiGetPublicEvent,
  formatTime,
  type PublicEvent,
  type HomeAppearance,
  type AppCard,
} from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';
import { useAuthStore } from '@store/auth.store';
import { PageHeader } from '@components/page-header';

type Props = NativeStackScreenProps<RootStackParamList, 'EventHome'>;

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

  // Action d'une carte de l'écran d'accueil configurable (« Apparence de l'app »).
  const handleCardAction = (card: AppCard) => {
    const a = card.action;
    if (!a || a.type === 'none') return;
    if (a.type === 'supplier' && a.supplierId) { handleSelectSupplier(a.supplierId); return; }
    if (a.type === 'scan') { navigation.navigate('QRScanner'); return; }
    if (a.type === 'url' && a.url) { void Linking.openURL(a.url); return; }
    // 'orders' : pas encore d'écran liste de commandes côté app → no-op pour l'instant.
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <PageHeader />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Chargement de l'événement…</Text>
        </View>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.root}>
        <PageHeader />
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Événement introuvable</Text>
          <Text style={styles.errorText}>{error ?? 'Aucune donnée disponible.'}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Mode Flaix : l'interface du lieu est désactivée, Flaix gère la suite.
  if (event.appearance?.flaixTakeover) {
    return (
      <View style={styles.root}>
        <PageHeader />
        <View style={styles.centered}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🏟️</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#1c1917', textAlign: 'center', marginBottom: 8 }}>
            Plan du lieu
          </Text>
          <Text style={{ fontSize: 14, color: '#78716c', textAlign: 'center', maxWidth: 260, lineHeight: 20 }}>
            L'intégration Flaix est active. Sélectionne ton emplacement sur le plan du stade pour commander.
          </Text>
          <Text style={{ fontSize: 11, color: '#a8a29e', marginTop: 24 }}>
            Intégration Flaix — à venir (Phase 11.5)
          </Text>
        </View>
      </View>
    );
  }

  // Écran d'accueil configurable (white-label) si le club a défini une apparence.
  if (event.appearance && Array.isArray(event.appearance.cards) && event.appearance.cards.length > 0) {
    return (
      <AppearanceHome
        appearance={event.appearance}
        logoUrl={event.branding?.logoUrl ?? null}
        onCard={handleCardAction}
      />
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader
        title={event.name}
        onBack={() => navigation.navigate('QRScanner')}
      />

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

// ─── Écran d'accueil configurable (« Apparence de l'app ») ────────────────────────
// Rend le gabarit défini côté dashboard : logo centré → titre MAJUSCULE → sous-titre
// → grille de cartes (texte / image). Les cartes icône s'afficheront en v2 (lib d'icônes).

function AppearanceHome({
  appearance,
  logoUrl,
  onCard,
}: {
  appearance: HomeAppearance;
  logoUrl: string | null;
  onCard: (c: AppCard) => void;
}) {
  const { header, theme } = appearance;
  const pages = appearance.pages ?? [];
  const cardW = theme.columns === 2 ? '47%' : '92%';
  const minH = theme.cardSize === 'lg' ? 122 : theme.cardSize === 'sm' ? 80 : 100;

  // Navigation interne entre l'accueil et les pages secondaires.
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const activePage = currentPageId ? pages.find((p) => p.id === currentPageId) ?? null : null;
  const cards = activePage ? activePage.cards : appearance.cards;

  // Une carte « page » navigue en interne ; sinon on délègue (buvette, lien, scan…).
  const handlePress = (c: AppCard) => {
    if (c.action?.type === 'page' && c.action.pageId && pages.some((p) => p.id === c.action!.pageId)) {
      setCurrentPageId(c.action.pageId);
      return;
    }
    onCard(c);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
    >
      {activePage ? (
        /* En-tête d'une page secondaire : retour + nom de la page */
        <View style={{ width: '100%', marginTop: 22 }}>
          <Pressable onPress={() => setCurrentPageId(null)} hitSlop={10}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: theme.primaryColor }}>‹ Accueil</Text>
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: '800', color: header.titleColor, textTransform: 'uppercase', marginTop: 14 }}>
            {activePage.name}
          </Text>
        </View>
      ) : (
        <>
          {/* En-tête d'accueil */}
          {header.showLogo && logoUrl ? (
            <Image source={{ uri: logoUrl }} style={{ width: 96, height: 96, marginTop: 22, marginBottom: 16 }} resizeMode="contain" />
          ) : header.showLogo ? (
            <View style={{ width: 66, height: 66, borderRadius: 16, backgroundColor: theme.primaryColor, marginTop: 22, marginBottom: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>B</Text>
            </View>
          ) : (
            <View style={{ height: 22 }} />
          )}
          {!!header.title && (
            <Text style={{ fontSize: 22, fontWeight: '800', color: header.titleColor, textAlign: 'center', textTransform: 'uppercase', lineHeight: 28 }}>
              {header.title}
            </Text>
          )}
          {!!header.subtitle && (
            <Text style={{ fontSize: 14, fontWeight: '600', color: header.subtitleColor, textAlign: 'center', marginTop: 12 }}>
              {header.subtitle}
            </Text>
          )}
        </>
      )}

      {/* Grille de cartes */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', marginTop: 26 }}>
        {cards.map((c) => {
          const textColor = c.textColor || theme.textColor;
          return (
            <Pressable
              key={c.id}
              onPress={() => handlePress(c)}
              style={({ pressed }) => [
                {
                  width: cardW,
                  minHeight: minH,
                  marginBottom: 16,
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  overflow: 'hidden',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: c.imageUrl ? 0 : 16,
                  shadowColor: '#1c1917',
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 3,
                },
                pressed ? { opacity: 0.85 } : null,
              ]}
            >
              {c.imageUrl ? (
                <>
                  <Image source={{ uri: c.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
                  <Text style={{ color: c.textColor || '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center', paddingHorizontal: 8 }}>{c.title}</Text>
                </>
              ) : (
                <Text style={{ color: textColor, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{c.title}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
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
