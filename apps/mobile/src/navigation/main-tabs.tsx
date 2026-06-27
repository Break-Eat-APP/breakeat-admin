import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { THEME, shadowSoft, FONT } from '@lib/theme';
import { BreakEatLogo } from '@components/break-eat-logo';
import { VenueDiscoveryScreen } from '@screens/venue-discovery.screen';
import { OrderHistoryScreen } from '@screens/order-history.screen';
import { ProfileScreen } from '@screens/profile.screen';

/**
 * Barre d'onglets de l'app (partagée prod + preview).
 *
 * 5 emplacements façon Burger King : Lieux · Mes commandes · [Commander FAB] ·
 * Panier · Autre. Le gros bouton central « Commander » renvoie vers « Mes commandes »
 * (le parcours de commande arrivera progressivement).
 */
export type MainTabParamList = {
  Lieux: undefined;
  Panier: undefined;
  Commandes: undefined;
  Autre: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Gros bouton central « Mes commandes » surélevé (logo B) — façon Burger King. */
function CommandesFab({ onPress }: BottomTabBarButtonProps) {
  return (
    <Pressable onPress={onPress} style={styles.fabWrap}>
      <View style={styles.fab}>
        <BreakEatLogo size={40} variant="white" />
      </View>
      <Text style={styles.fabLabel}>Mes commandes</Text>
    </Pressable>
  );
}

/** Onglet Panier — placeholder tant que le parcours de commande n'est pas branché. */
function PanierTabScreen() {
  return (
    <View style={styles.stub}>
      <Ionicons name="cart-outline" size={44} color={THEME.orange} />
      <Text style={styles.stubTitle}>Votre panier est vide</Text>
      <Text style={styles.stubSub}>Choisissez un lieu dans « Lieux » pour démarrer une commande.</Text>
    </View>
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
        name="Panier"
        component={PanierTabScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="cart-outline" size={24} color={color} /> }}
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
        name="Autre"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={24} color={color} /> }}
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
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: THEME.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
    borderWidth: 5,
    borderColor: '#fff',
    ...shadowSoft,
  },
  fabLabel: { fontSize: 10, fontFamily: FONT.semibold, color: THEME.orange, marginTop: 2 },

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
