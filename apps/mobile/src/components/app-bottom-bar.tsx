import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { THEME, shadowSoft, HEAD } from '@lib/theme';
import { useCartStore } from '@store/cart.store';
import { useNotifStore } from '@store/notif.store';
import { navigateTo } from '@navigation/nav-ref';
import { PastilleSuivi } from '@components/pastille-suivi';
import { useEtatPastille } from '@lib/use-etat-pastille';
import type { RootStackParamList } from '@navigation/root-navigator';

/**
 * Barre du bas PERSISTANTE — rendue en overlay au-dessus de chaque écran
 * (hors du Stack), façon application native.
 *
 * Cinq places : Lieux · Panier — la PASTILLE — Alertes · Profil. À gauche le
 * parcours d'achat, à droite ce qui appartient au client, et au milieu ce pour
 * quoi il rouvre l'application : ses commandes en cours.
 *
 * L'éclair plutôt que le logo dans la pastille : un logo répété à chaque écran
 * ne dit rien de ce que le bouton FAIT. L'éclair dit la rapidité — la promesse
 * de l'app — et se lit à 24 pixels, ce qu'un lockup ne fait pas.
 *
 * Alertes et Profil étaient jusqu'ici deux icônes dans le bandeau orange de
 * l'accueil, donc introuvables depuis tout autre écran. Ici, elles suivent le
 * client partout.
 */

// Geometrie REELLE de la barre — a lire avec `styles`, en bas de ce fichier.
// Ces trois nombres sont la seule source des calculs ci-dessous : les modifier
// dans `styles` sans les reporter ici remettrait un bouton sous la barre.
const ECART_BAS = 16; // `wrap` : bottom = insets.bottom + 16
const HAUTEUR_BARRE = 70; // `bar`
// `fabCadre` : l'anneau (80 px) remonte de 32 px, ce qui laisse le disque
// exactement ou il etait avant l'anneau. Debord reel ~30 px ; 34 est la borne
// HAUTE — on arrondit vers le haut, jamais vers le bas : trop d'espace reserve
// ne se voit pas, trop peu cache un bouton.
const DEBORD_PASTILLE = 34;

/**
 * Hauteur occupee par la barre, hors zone sure.
 *
 * La pastille centrale COMPTE : elle deborde au-dessus de la barre. Une valeur
 * qui l'ignore laisse le bouton « Mes commandes » mordre sur ce qui se trouve
 * dessous — c'est ce qui arrivait au bouton « Choisir un creneau », dont la
 * moitie basse disparaissait.
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

/**
 * Le compte porté par une icône.
 *
 * Au-delà de 99, « 99+ » : trois chiffres ne tiennent pas dans une pastille de
 * 18 px, et l'écart entre 128 et 214 n'intéresse plus personne.
 */
function Pastille({ compte }: { compte: number }) {
  if (compte <= 0) return null;
  return (
    <View style={[styles.badge, compte > 9 && styles.badgeLarge]}>
      <Text style={styles.badgeText}>{compte > 99 ? '99+' : compte}</Text>
    </View>
  );
}

function Onglet({
  icone,
  libelle,
  actif,
  compte = 0,
  onPress,
}: {
  icone: React.ReactNode;
  libelle: string;
  actif: boolean;
  compte?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tab} onPress={onPress} hitSlop={6}>
      <View>
        {icone}
        <Pastille compte={compte} />
      </View>
      <Text style={[styles.tabLabel, actif && styles.tabLabelActive]} numberOfLines={1}>
        {libelle}
      </Text>
      {/* Le point sous l'onglet actif. L'orange seul se perd chez les daltoniens
          et sur un écran en plein soleil ; une forme, non. */}
      <View style={[styles.dot, actif && styles.dotActive]} />
    </Pressable>
  );
}

export function AppBottomBar({ currentRoute }: { currentRoute?: string }) {
  const insets = useSafeAreaInsets();
  // Selecteurs SCALAIRES : rendre un objet ici re-rendrait la barre a chaque
  // changement du panier, sur tous les ecrans.
  const articles = useCartStore((e) => e.items.reduce((total, i) => total + i.quantity, 0));
  const nonLues = useNotifStore((e) => e.nonLues);
  // Appele AVANT le retour anticipe ci-dessous : un hook ne se saute pas.
  const etatPastille = useEtatPastille(currentRoute);

  if (!currentRoute || HIDDEN_ON.includes(currentRoute as keyof RootStackParamList)) {
    return null;
  }

  const isLieux = currentRoute === 'Lieux';
  const isPanier = currentRoute === 'Cart';
  const isCommandes = currentRoute === 'Commandes';
  const isAlertes = currentRoute === 'Notifications';
  const isProfil = currentRoute === 'Profile';

  const teinte = (actif: boolean) => (actif ? THEME.orange : THEME.inkSoft);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 16 }]}>
      <View style={[styles.bar, shadowSoft]}>
        <Onglet
          libelle="Lieux"
          actif={isLieux}
          onPress={() => navigateTo('Lieux')}
          icone={
            <MaterialCommunityIcons name="stadium-variant" size={23} color={teinte(isLieux)} />
          }
        />
        <Onglet
          libelle="Panier"
          actif={isPanier}
          compte={articles}
          onPress={() => navigateTo('Cart')}
          icone={
            <Ionicons
              name={isPanier ? 'cart' : 'cart-outline'}
              size={23}
              color={teinte(isPanier)}
            />
          }
        />

        {/* Mes commandes — la pastille surélevée. */}
        <Pressable style={styles.fabWrap} onPress={() => navigateTo('Commandes')} hitSlop={6}>
          <View style={styles.fabCadre}>
            <PastilleSuivi etat={etatPastille} actif={isCommandes} />
          </View>
          <Text style={[styles.fabLabel, !isCommandes && styles.fabLabelInactive]} numberOfLines={1}>
            Commandes
          </Text>
        </Pressable>

        <Onglet
          libelle="Alertes"
          actif={isAlertes}
          compte={nonLues}
          onPress={() => navigateTo('Notifications')}
          icone={
            <Ionicons
              name={isAlertes ? 'notifications' : 'notifications-outline'}
              size={23}
              color={teinte(isAlertes)}
            />
          }
        />
        <Onglet
          libelle="Profil"
          actif={isProfil}
          onPress={() => navigateTo('Profile')}
          icone={
            <Ionicons
              name={isProfil ? 'person-circle' : 'person-circle-outline'}
              size={24}
              color={teinte(isProfil)}
            />
          }
        />
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
    borderRadius: 35,
    backgroundColor: THEME.surface,
    paddingHorizontal: 4,
  },

  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  tabLabel: {
    fontSize: 10,
    fontFamily: HEAD.semibold,
    color: THEME.inkSoft,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  tabLabelActive: { color: THEME.orange },

  // Le point garde sa place meme eteint : sans cela, l'onglet actif se
  // decalerait de trois pixels vers le haut a chaque changement d'ecran.
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: THEME.orange },

  // Largeur FIXE, et non `flex` : la pastille ne doit pas retrecir sur un
  // petit ecran au point de mordre sur « Panier ».
  fabWrap: { width: 82, alignItems: 'center', justifyContent: 'center' },
  // L'anneau deborde de 8 px autour du disque : on remonte le cadre d'autant
  // de plus, pour que le disque ne bouge pas d'un pixel.
  fabCadre: { marginTop: -32 },
  fabLabel: {
    fontSize: 10,
    fontFamily: HEAD.bold,
    color: THEME.orange,
    // L'anneau garde 2 px vides sous son trait : on les reprend, sinon le
    // libelle frole le bas de la barre.
    marginTop: -2,
    letterSpacing: 0.2,
  },
  fabLabelInactive: { color: THEME.inkSoft },

  badge: {
    position: 'absolute',
    top: -6,
    left: 13,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: THEME.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeLarge: { left: 10 },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: HEAD.bold, lineHeight: 13 },
});
