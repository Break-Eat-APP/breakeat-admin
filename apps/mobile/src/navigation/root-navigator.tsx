import React, { useEffect } from 'react';
import {
  NavigationContainer,
  type LinkingOptions,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '@store/auth.store';
import { LoginScreen } from '@screens/login.screen';
import { QRScannerScreen } from '@screens/qr-scanner.screen';
import { EventHomeScreen } from '@screens/event-home.screen';
import { FlaixOrderScreen } from '@screens/flaix-order.screen';
import { SupplierCatalogScreen } from '@screens/supplier-catalog.screen';
import { CartScreen } from '@screens/cart.screen';
import { SlotSelectorScreen } from '@screens/slot-selector.screen';
import { CheckoutScreen } from '@screens/checkout.screen';
import { OrderConfirmationScreen } from '@screens/order-confirmation.screen';
import { OrderTrackingScreen } from '@screens/order-tracking.screen';
import { MainTabs, type MainTabParamList } from '@navigation/main-tabs';
import { THEME } from '@lib/theme';

/**
 * Navigation de production — pivot click-and-collect (Phase 16).
 *
 * Entrée = barre d'onglets partagée (Lieux · Mes commandes · Commander · Panier ·
 * Autre, cf. main-tabs). L'auth est OPTIONNELLE : `Login` est une modale jamais
 * bloquante. Le flux de commande (EventHome → … → Checkout) est empilé par-dessus
 * les onglets et sert de cible au handoff Flaix (sur EventHome).
 */
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;

  // Auth (optionnelle, non bloquante)
  Login: { pendingEventId?: string; defaultTab?: 'login' | 'register' } | undefined;

  // Flux de commande / deep links
  QRScanner: undefined;
  EventHome: { eventId: string };
  FlaixOrder: { venueId: string; flaixVenueId: string | null };
  SupplierCatalog: { eventId: string; supplierId: string };
  Cart: undefined;
  SlotSelector: { eventId: string };
  Checkout: undefined;
  OrderConfirmation: { orderId: string; publicOrderNumber: string; totalCents: number };
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

  // Réhydrate la session depuis AsyncStorage au premier montage.
  useEffect(() => {
    void rehydrate();
  }, [rehydrate]);

  if (isLoading) {
    // Garde le splash visible pendant le chargement de session.
    return null;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName={token ? 'MainTabs' : 'Login'}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: THEME.bg },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />

        {/* Auth — plein écran au premier lancement, modale depuis l'intérieur */}
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* Flux de commande / deep links */}
        <Stack.Screen name="QRScanner" component={QRScannerScreen} />
        <Stack.Screen name="EventHome" component={EventHomeScreen} />
        <Stack.Screen name="FlaixOrder" component={FlaixOrderScreen} />
        <Stack.Screen name="SupplierCatalog" component={SupplierCatalogScreen} />
        <Stack.Screen name="Cart" component={CartScreen} />
        <Stack.Screen name="SlotSelector" component={SlotSelectorScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
        <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
