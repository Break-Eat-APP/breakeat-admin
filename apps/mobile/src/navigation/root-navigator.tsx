import React, { useEffect } from 'react';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from '@store/auth.store';
import { LoginScreen } from '@screens/login.screen';
import { QRScannerScreen } from '@screens/qr-scanner.screen';
import { EventHomeScreen } from '@screens/event-home.screen';
import { SupplierCatalogScreen } from '@screens/supplier-catalog.screen';
import { CartScreen } from '@screens/cart.screen';
import { SlotSelectorScreen } from '@screens/slot-selector.screen';
import { CheckoutScreen } from '@screens/checkout.screen';
import { OrderConfirmationScreen } from '@screens/order-confirmation.screen';
import { OrderTrackingScreen } from '@screens/order-tracking.screen';

/**
 * Full route param map — Phase 13.
 *
 * All screens live in a single stack to support deep links
 * from the QR code scheme: breakeat://event/<uuid>
 */
export type RootStackParamList = {
  // Auth
  Login: { pendingEventId?: string } | undefined;

  // Main app flow
  QRScanner: undefined;
  EventHome: { eventId: string };
  SupplierCatalog: { eventId: string; supplierId: string };
  Cart: undefined;
  SlotSelector: { eventId: string };
  Checkout: undefined;
  OrderConfirmation: { orderId: string; publicOrderNumber: string; totalCents: number };
  OrderTracking: { orderId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Deep link configuration.
 * breakeat://event/<eventId>  →  EventHomeScreen
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['breakeat://'],
  config: {
    screens: {
      EventHome: 'event/:eventId',
    },
  },
};

export function RootNavigator() {
  const { token, isLoading, rehydrate } = useAuthStore();

  // Rehydrate from AsyncStorage on first mount
  useEffect(() => {
    void rehydrate();
  }, [rehydrate]);

  if (isLoading) {
    // Keep splash visible while loading session
    return null;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0f172a' },
        }}
      >
        {/* Entry point depends on auth state */}
        {!token ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : null}

        {/* QR Scanner — home screen for logged-in users */}
        <Stack.Screen name="QRScanner" component={QRScannerScreen} />

        {/* Event flow */}
        <Stack.Screen name="EventHome" component={EventHomeScreen} />
        <Stack.Screen name="SupplierCatalog" component={SupplierCatalogScreen} />
        <Stack.Screen name="Cart" component={CartScreen} />
        <Stack.Screen name="SlotSelector" component={SlotSelectorScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
        <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />

        {/* Login always accessible (for non-authed checkout flow) */}
        {token ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
