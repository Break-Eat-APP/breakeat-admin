/**
 * App.expo — entrée de PRÉVISUALISATION Expo Go / web (Netlify) : voir le visuel
 * sur navigateur / iPhone / iPad sans build natif.
 *
 * Reproduit l'architecture de production (cf. root-navigator) : un SEUL Stack
 * surmonté de la barre du bas PERSISTANTE (AppBottomBar). Tous les écrans réels
 * sont utilisés SAUF ceux à dépendance native (caméra) ou nécessitant un backend
 * d'événement live, remplacés par des stubs.
 *
 * Entrée native de production = index.js / App.tsx (root-navigator complet).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
  Raleway_800ExtraBold,
} from '@expo-google-fonts/raleway';
import { Oswald_400Regular, Oswald_500Medium, Oswald_600SemiBold } from '@expo-google-fonts/oswald';

import { queryClient } from '@lib/query/query-client';
import { useAppStore } from '@store/app.store';
import { useAuthStore } from '@store/auth.store';
import { THEME, FONT } from '@lib/theme';
import { navigationRef } from '@navigation/nav-ref';
import { AppBottomBar } from '@components/app-bottom-bar';
import type { RootStackParamList } from '@navigation/root-navigator';

import { VenueDiscoveryScreen } from '@screens/venue-discovery.screen';
import { OrderHistoryScreen } from '@screens/order-history.screen';
import { CartScreen } from '@screens/cart.screen';
import { ProfileScreen } from '@screens/profile.screen';
import { PartnersScreen } from '@screens/partners.screen';
import { LoginScreen } from '@screens/login.screen';
import { FlaixOrderScreen } from '@screens/flaix-order.screen';
import { EventHomeScreen } from '@screens/event-home.screen';
import { SupplierCatalogScreen } from '@screens/supplier-catalog.screen';
import { SlotSelectorScreen } from '@screens/slot-selector.screen';
import { CheckoutScreen } from '@screens/checkout.screen';
import { OrderConfirmationScreen } from '@screens/order-confirmation.screen';
import { OrderTrackingScreen } from '@screens/order-tracking.screen';
import { SplitScreen } from '@screens/split.screen';
import { useDeepLinks } from '@lib/hooks/use-deep-links';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Police d'interface (Inter) par défaut sur tout le texte non stylé.
const RNTextWithDefaults = Text as unknown as { defaultProps?: { style?: unknown } };
RNTextWithDefaults.defaultProps = RNTextWithDefaults.defaultProps ?? {};
RNTextWithDefaults.defaultProps.style = { fontFamily: 'Inter_400Regular' };

function StubScreen({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={styles.stub}>
      <MaterialCommunityIcons name={icon as never} size={44} color={THEME.orange} />
      <Text style={styles.stubTitle}>{title}</Text>
      <Text style={styles.stubSub}>{sub}</Text>
    </View>
  );
}

// Écrans indisponibles en prévisualisation web (caméra / événement live).
const QRScannerStub = (_: NativeStackScreenProps<RootStackParamList, 'QRScanner'>) => (
  <StubScreen icon="qrcode-scan" title="Scanner un QR code" sub="La caméra n'est pas disponible dans la prévisualisation web." />
);

/**
 * Liens entrants pris en charge par la navigation elle-meme.
 *
 * `split/:code` est le SEUL a passer par ici, et pour une raison precise : un
 * convive ouvre ce lien dans son NAVIGATEUR, sans avoir installe l'app. Il faut
 * donc que l'adresse web resolve vers un ecran — ce que `useDeepLinks`, branche
 * sur le schema `breakeat://`, ne saurait pas faire.
 *
 * Les autres liens (`order/...`, `join/...`) restent traites a la main : ils
 * declenchent des actions, pas seulement une navigation.
 */
const origineWeb = (): string[] => {
  // `window` n'existe pas en natif, et le tsconfig de l'app ne declare pas le
  // DOM : on le lit via globalThis plutot que d'elargir les types pour trois mots.
  const g = globalThis as { location?: { origin?: string } };
  return g.location?.origin ? [g.location.origin] : [];
};

const LIENS = {
  prefixes: ['breakeat://', ...origineWeb()],
  config: { screens: { Split: 'split/:code' } },
};

export default function AppPreview() {
  const setReady = useAppStore((s) => s.setReady);
  const { rehydrate, isLoading, token } = useAuthStore();
  const [routeName, setRouteName] = useState<string | undefined>(undefined);
  // Les liens entrants ne sont traites qu'une fois la navigation prete : plus
  // tot, `navigate` n'aurait aucun effet et l'app s'ouvrirait sur l'accueil.
  const [navigationPrete, setNavigationPrete] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
    Raleway_800ExtraBold,
    Oswald_400Regular,
    Oswald_500Medium,
    Oswald_600SemiBold,
  });

  useEffect(() => {
    setReady(true);
    void rehydrate();
  }, [setReady, rehydrate]);

  // « Je suis arrive » depuis l'ecran verrouille, et appui sur la Live Activity.
  useDeepLinks(navigationPrete);

  // Ne pas rester bloqué sur écran blanc si une police échoue à charger.
  if (!fontsLoaded && !fontError) return null;
  if (isLoading) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer
          ref={navigationRef}
          linking={LIENS}
          onReady={() => {
            setRouteName(navigationRef.getCurrentRoute()?.name);
            setNavigationPrete(true);
          }}
          onStateChange={() => setRouteName(navigationRef.getCurrentRoute()?.name)}
        >
          <View style={{ flex: 1, backgroundColor: THEME.bg }}>
            <Stack.Navigator
              initialRouteName={token ? 'Lieux' : 'Login'}
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: THEME.bg } }}
            >
              {/* Destinations principales (barre du bas) */}
              <Stack.Screen name="Lieux" component={VenueDiscoveryScreen} />
              <Stack.Screen name="Commandes" component={OrderHistoryScreen} />
              <Stack.Screen name="Cart" component={CartScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="Partners" component={PartnersScreen} />

              {/* Auth */}
              <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />

              {/* Flux de commande (réels, web-safe) */}
              <Stack.Screen name="FlaixOrder" component={FlaixOrderScreen} />
              <Stack.Screen name="SupplierCatalog" component={SupplierCatalogScreen} />
              <Stack.Screen name="SlotSelector" component={SlotSelectorScreen} />
              <Stack.Screen name="Checkout" component={CheckoutScreen} />
              <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
              <Stack.Screen name="Split" component={SplitScreen} />

              {/* Stubs (caméra / événement live) */}
              <Stack.Screen name="EventHome" component={EventHomeScreen} />
              <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
              <Stack.Screen name="QRScanner" component={QRScannerStub} />
            </Stack.Navigator>

            {/* Barre du bas persistante — au-dessus de tous les écrans */}
            <AppBottomBar currentRoute={routeName} />
          </View>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  stub: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  stubTitle: { color: THEME.ink, fontSize: 18, fontFamily: FONT.bold, marginTop: 6 },
  stubSub: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.regular },
});
