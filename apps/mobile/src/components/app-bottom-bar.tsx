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

// Geometrie REELLE de la barre — a lire avec `styles`, en bas de ce fichier.
// Ces trois nombres sont la seule source des calculs ci-dessous : les modifier
// dans `styles` sans les reporter ici remettrait un bouton sous la barre.
const ECART_BAS = 16; // `wrap` : bottom = insets.bottom + 16
const HAUTEUR_BARRE = 70; // `bar`
const DEBORD_PASTILLE = 37; // `fab` : 72 de haut, marginTop -38 → deborde vers le haut

/**
 * Hauteur occupee par la barre, hors zone sure.
 *
 * La pastille centrale COMPTE : elle deborde de 37 px au-dessus de la barre.
 * Une valeur qui l'ignore laisse le bouton « Mes commandes » mordre sur ce qui
 * se trouve dessous — c'est ce qui arrivait au bouton « Choisir un creneau »,
 * dont la moitie basse disparaissait.
 *
 * Valeur PLANCHER : preferer `useBottomBarSpace()`, qui ajoute l'encoche.
 */
export const BOTTOM_BAR_SPACE = ECART_BAS + HAUTEUR_BARRE + DEBORD_PASTILLE;

/**
 * Espace a reserver SOUS un contenu ou un bouton en flux, zone sure comprise.
 *
 * A utiliser partout ou un element doit rester au-dessus de la barre. La
 * constante seule ne suffit pas : elle ignore l'encoche, et le defaut ne se
 * voit que sur les appareils qui en ont une.
 */
export function useBottomBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BOTTOM_BAR_SPACE;
}

/**
 * Position basse d'un element FLOTTANT (`position: 'absolute'`) pose au-dessus
 * de la barre — barre de panier, bandeau de connexion.
 *
 * Meme calcul que ci-dessus, plus un ecart : un `bottom` fixe, lui, ne connait
 * ni la hauteur de la barre ni l'encoche. « Voir mon panier » etait cale a 32 —
 * soit derriere la barre entiere.
 */
export function useFloatingBarBottom(ecart = 12): number {
  return useBottomBarSpace() + ecart;
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
