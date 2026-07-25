import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '@store/auth.store';
import { LoginScreen } from '@screens/login.screen';
import { VenueDiscoveryScreen } from '@screens/venue-discovery.screen';
import { OrderHistoryScreen } from '@screens/order-history.screen';
import { EventHomeScreen } from '@screens/event-home.screen';
import { FlaixOrderScreen } from '@screens/flaix-order.screen';
import { SupplierCatalogScreen } from '@screens/supplier-catalog.screen';
import { CartScreen } from '@screens/cart.screen';
import { SlotSelectorScreen } from '@screens/slot-selector.screen';
import { CheckoutScreen } from '@screens/checkout.screen';
import { OrderConfirmationScreen } from '@screens/order-confirmation.screen';
import { OrderTrackingScreen } from '@screens/order-tracking.screen';
import { ProfileScreen } from '@screens/profile.screen';
import { PartnersScreen } from '@screens/partners.screen';
import { AppBottomBar } from '@components/app-bottom-bar';
import { navigationRef } from '@navigation/nav-ref';
import { THEME } from '@lib/theme';

/**
 * Navigation de production — pivot click-and-collect.
 *
 * Un SEUL Stack pour tous les écrans, surmonté d'une barre du bas PERSISTANTE
 * (cf. AppBottomBar) rendue en overlay : Lieux · Mes commandes · Panier restent
 * accessibles partout, façon application native. L'auth (`Login`) reste une
 * modale jamais bloquante.
 */
export type RootStackParamList = {
  // Destinations principales (barre du bas)
  Lieux: undefined;
  Commandes: undefined;
  Cart: undefined;

  // Profil / Menu
  Profile: undefined;
  Partners: undefined;

  // Auth (optionnelle, non bloquante)
  Login: { pendingEventId?: string; defaultTab?: 'login' | 'register' } | undefined;

  // Flux de commande / deep links
  QRScanner: undefined;
  EventHome: { eventId: string };
  FlaixOrder: { venueId: string; flaixVenueId: string | null };
  SupplierCatalog: { eventId: string; supplierId: string };
  SlotSelector: { eventId: string };
  Checkout: undefined;
  OrderConfirmation: { orderId: string; publicOrderNumber: string; totalCents: number; buvettePlanUrl?: string | null };
  OrderTracking: { orderId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Deep link : breakeat://event/<eventId> → EventHome */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['breakeat://'],
  config: {
    screens: {
      EventHome: 'event/:eventId',
    },
  },
};

export function RootNavigator() {
  const { isLoading, rehydrate, token } = useAuthStore();
  const [routeName, setRouteName] = useState<string | undefined>(undefined);

  // Réhydrate la session depuis AsyncStorage au premier montage.
  useEffect(() => {
    void rehydrate();
  }, [rehydrate]);

  if (isLoading) {
    // Garde le splash visible pendant le chargement de session.
    return null;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={() => setRouteName(navigationRef.getCurrentRoute()?.name)}
      onStateChange={() => setRouteName(navigationRef.getCurrentRoute()?.name)}
    >
      <View style={{ flex: 1, backgroundColor: THEME.bg }}>
        <Stack.Navigator
          initialRouteName={token ? 'Lieux' : 'Login'}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: THEME.bg },
          }}
        >
          {/* Destinations principales */}
          <Stack.Screen name="Lieux" component={VenueDiscoveryScreen} />
          <Stack.Screen name="Commandes" component={OrderHistoryScreen} />
          <Stack.Screen name="Cart" component={CartScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Partners" component={PartnersScreen} />

          {/* Auth — plein écran au premier lancement, modale depuis l'intérieur */}
          <Stack.Screen name="Login" component={LoginScreen} />

          {/* Flux de commande / deep links */}
          <Stack.Screen
            name="QRScanner"
            getComponent={() => require('@screens/qr-scanner.screen').QRScannerScreen}
          />
          <Stack.Screen name="EventHome" component={EventHomeScreen} />
          <Stack.Screen name="FlaixOrder" component={FlaixOrderScreen} />
          <Stack.Screen name="SupplierCatalog" component={SupplierCatalogScreen} />
          <Stack.Screen name="SlotSelector" component={SlotSelectorScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
          <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
        </Stack.Navigator>

        {/* Barre du bas persistante — au-dessus de tous les écrans */}
        <AppBottomBar currentRoute={routeName} />
      </View>
    </NavigationContainer>
  );
}
