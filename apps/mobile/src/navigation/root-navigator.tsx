import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlaceholderScreen } from '@screens/placeholder.screen';

/**
 * Root navigation stack — Phase 1 shell.
 *
 * Navigation structure added phase by phase:
 *   Phase 2 → AuthStack (Login, Register, ForgotPassword)
 *   Phase 3 → EventStack (EventList, EventDetail, VenueMap)
 *   Phase 4 → CatalogStack (Home, ProductDetail)
 *   Phase 5 → CartStack (Cart, Checkout, SlotSelector, Payment)
 *   Phase 6 → OrderStack (OrderStatus, OrderHistory)
 */
export type RootStackParamList = {
  Placeholder: undefined;
  // Phase 2+: Auth, Events, Catalog, Cart, Order...
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
