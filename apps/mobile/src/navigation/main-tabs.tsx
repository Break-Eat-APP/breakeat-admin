import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { THEME, shadowSoft, FONT } from '@lib/theme';
import { BreakEatLogo } from '@components/break-eat-logo';
import { VenueDiscoveryScreen } from '@screens/venue-discovery.screen';
import { OrderHistoryScreen } from '@screens/order-history.screen';

/**
 * Barre d'onglets : Lieux · [Mes commandes = gros bouton central] · Panier.
 * Le profil (Menu) est accessible depuis l'icône hamburger dans le bandeau orange.
 */
export type MainTabParamList = {
  Lieux: undefined;
  Commandes: undefined;
  Panier: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Gros bouton central « Mes commandes » surélevé (logo B) — façon Burger King. */
function CommandesFab({ onPress }: BottomTabBarButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.fabWrap}>
      <View style={styles.fab}>
        <BreakEatLogo size={62} variant="white" />
      </View>
      <Text style={styles.fabLabel}>Mes commandes</Text>
    </Pressable>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: THEME.orange,
        tabBarInactiveTintColor: THEME.grey,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Lieux"
        component={VenueDiscoveryScreen}
        options={{
          tabBarIcon: ({ color }) => <MaterialCommunityIcons name="stadium-variant" size={26} color={color} />,
        }}
      />
      <Tab.Screen
        name="Commandes"
        component={OrderHistoryScreen}
        options={{
          tabBarLabel: 'Mes commandes',
          tabBarButton: (props) => <CommandesFab {...props} />,
        }}
      />
      <Tab.Screen
        name="Panier"
        component={OrderHistoryScreen}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Cart' as never);
          },
        })}
        options={{
          tabBarLabel: 'Panier',
          tabBarIcon: ({ color }) => <Ionicons name="cart-outline" size={26} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    height: 70,
    borderRadius: 36,
    backgroundColor: THEME.surface,
    borderTopWidth: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 6,
    ...shadowSoft,
  },
  tabLabel: { fontSize: 10, fontFamily: FONT.medium, marginTop: 2 },

  fabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: THEME.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -38,
    borderWidth: 5,
    borderColor: '#fff',
    ...shadowSoft,
  },
  fabLabel: { fontSize: 10, fontFamily: FONT.semibold, color: THEME.orange, marginTop: 2 },
});
