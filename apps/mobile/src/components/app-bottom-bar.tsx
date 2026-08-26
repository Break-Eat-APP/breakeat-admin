import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { THEME, shadowSoft, FONT } from '@lib/theme';
import { BreakEatLogo } from '@components/break-eat-logo';
import { navigateTo } from '@navigation/nav-ref';
import type { RootStackParamList } from '@navigation/root-navigator';

/**
 * Barre du bas PERSISTANTE — rendue en overlay au-dessus de chaque écran
 * (hors du Stack), façon application native : Lieux · Mes commandes (gros
 * bouton central) · Panier. Toujours accessible pour revenir à l'accueil.
 */

/**
 * Hauteur reservee sous le contenu pour ne pas passer sous la barre.
 *
 * Valeur PLANCHER, sans zone sure : la barre flotte a `insets.bottom + 16` et
 * mesure 70 (le bouton central, 72, deborde legerement). Sur un ecran sans
 * encoche, 104 suffit.
 *
 * Sur un iPhone a encoche, `insets.bottom` vaut ~34 : la barre monte alors
 * jusqu'a ~122, et un bouton cale a 104 se retrouve recouvert sur sa moitie
 * basse. C'est exactement ce qui arrivait au bouton « Choisir un creneau ».
 *
 * Preferer `useBottomBarSpace()`, qui ajoute la zone sure.
 */
export const BOTTOM_BAR_SPACE = 104;

/**
 * Espace a reserver sous un contenu ou un bouton fixe, zone sure comprise.
 *
 * A utiliser partout ou un element doit rester AU-DESSUS de la barre. La
 * constante seule ne suffit pas : elle ignore l’encoche, et le defaut ne se
 * voit que sur les appareils qui en ont un.
 */
export function useBottomBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BOTTOM_BAR_SPACE;
}

/** Écrans où la barre est masquée (plein écran / parcours bloquant). */
const HIDDEN_ON: Array<keyof RootStackParamList> = ['Login', 'QRScanner'];

export function AppBottomBar({ currentRoute }: { currentRoute?: string }) {
  const insets = useSafeAreaInsets();

  if (!currentRoute || HIDDEN_ON.includes(currentRoute as keyof RootStackParamList)) {
    return null;
  }

  const isLieux = currentRoute === 'Lieux';
  const isCommandes = currentRoute === 'Commandes';
  const isPanier = currentRoute === 'Cart';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 16 }]}>
      <View style={[styles.bar, shadowSoft]}>
        {/* Lieux */}
        <Pressable style={styles.tab} onPress={() => navigateTo('Lieux')}>
          <MaterialCommunityIcons
            name="stadium-variant"
            size={26}
            color={isLieux ? THEME.orange : THEME.grey}
          />
          <Text style={[styles.tabLabel, isLieux && styles.tabLabelActive]}>Lieux</Text>
        </Pressable>

        {/* Mes commandes — gros bouton central surélevé */}
        <Pressable style={styles.fabWrap} onPress={() => navigateTo('Commandes')}>
          <View style={styles.fab}>
            <BreakEatLogo size={56} variant="white" />
          </View>
          <Text style={[styles.fabLabel, isCommandes && styles.tabLabelActive]}>Mes commandes</Text>
        </Pressable>

        {/* Panier */}
        <Pressable style={styles.tab} onPress={() => navigateTo('Cart')}>
          <Ionicons
            name={isPanier ? 'cart' : 'cart-outline'}
            size={26}
            color={isPanier ? THEME.orange : THEME.grey}
          />
          <Text style={[styles.tabLabel, isPanier && styles.tabLabelActive]}>Panier</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
    borderRadius: 36,
    backgroundColor: THEME.surface,
    paddingHorizontal: 6,
  },

  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  tabLabel: { fontSize: 10, fontFamily: FONT.medium, color: THEME.grey, marginTop: 2 },
  tabLabelActive: { color: THEME.orange },

  fabWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
