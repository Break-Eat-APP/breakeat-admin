import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { THEME, HEAD } from '@lib/theme';
import { useNotifStore } from '@store/notif.store';
import { navigateTo } from '@navigation/nav-ref';
import { PastilleSuivi } from '@components/pastille-suivi';
import { useEtatPastille } from '@lib/use-etat-pastille';
import type { RootStackParamList } from '@navigation/root-navigator';

/**
 * Barre du bas PERSISTANTE — rendue en overlay au-dessus de chaque écran
 * (hors du Stack), façon application native.
 *
 * Trois places : Lieux — la PASTILLE — Notifications. Le PANIER et le PROFIL
 * en sont sortis le 16/10 : c'est Flaix qui tient le panier, et le profil se
 * rejoint par l'avatar du bandeau. Trois places pour trois intentions, plutôt
 * que cinq dont deux redondantes.
 *
 * L'éclair plutôt que le logo dans la pastille : un logo répété à chaque écran
 * ne dit rien de ce que le bouton FAIT. L'éclair dit la rapidité — la promesse
 * de l'app — et se lit à 24 pixels, ce qu'un lockup ne fait pas.
 *
 * Les notifications étaient une icône du bandeau orange de l'accueil, donc
 * introuvables depuis tout autre écran. Ici, elles suivent le client partout.
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

/**
 * LE CREUX SOUS LA PASTILLE.
 *
 * La barre était un rectangle blanc arrondi, et la pastille posée dessus :
 * elle avait l'air COLLÉE. Le creux la détache — le fond de la barre
 * s'écarte autour d'elle, et on voit passer l'écran entre les deux.
 *
 * Dessiné en vecteur plutôt qu'avec des `View` : une encoche concave ne
 * s'obtient pas avec des bordures arrondies, quel que soit l'empilement.
 * `react-native-svg` est déjà embarqué (l'anneau de suivi s'en sert).
 */
const RAYON_BARRE = HAUTEUR_BARRE / 2;
/**
 * Rayon du creux : l'anneau de la pastille fait 80 px (40 de rayon), et on
 * lui laisse 6 px d'air tout autour. Trop serré, le creux disparaît sous
 * l'anneau ; trop large, la barre se coupe en deux.
 */
const RAYON_ENCOCHE = 46;

/**
 * LE RACCORD DE PART ET D'AUTRE DU CREUX.
 *
 * Sans lui, le bord horizontal rencontrait le cercle du creux à la verticale :
 * un ANGLE VIF, deux fois, de chaque côté de la pastille. L'œil l'accroche
 * immédiatement — c'est ce qui distingue une encoche dessinée d'une encoche
 * bricolée.
 *
 * On intercale donc un petit cercle TANGENT au bord du haut et au creux. Son
 * centre est à (cx ± √(e² + 2·e·f), f) : la tangence à la droite `y = 0` impose
 * l'ordonnée `f`, et la tangence EXTÉRIEURE au creux impose que la distance
 * entre les deux centres vaille `e + f`. Le reste se déduit.
 */
const RACCORD = 14;

/** Le contour de la barre : deux bouts ronds, et un creux raccordé en douceur. */
function traceBarre(largeur: number): string {
  const h = HAUTEUR_BARRE;
  const r = RAYON_BARRE;
  const cx = largeur / 2;
  const e = RAYON_ENCOCHE;
  const f = RACCORD;

  // Écart horizontal entre l'axe et le centre du raccord (voir ci-dessus).
  const dx = Math.sqrt(e * e + 2 * e * f);
  // Le point où les deux cercles se touchent : sur le segment qui joint leurs
  // centres, à `e` du centre du creux.
  const pxDroite = cx + (e / (e + f)) * dx;
  const pxGauche = cx - (e / (e + f)) * dx;
  const py = (e / (e + f)) * f;

  return [
    `M ${r} 0`,
    // Bord haut, jusqu'au début du raccord gauche.
    `H ${cx - dx}`,
    // Raccord gauche : le bord plonge doucement vers le creux.
    `A ${f} ${f} 0 0 1 ${pxGauche} ${py}`,
    // Le creux lui-même.
    `A ${e} ${e} 0 0 0 ${pxDroite} ${py}`,
    // Raccord droit : on remonte vers le bord haut, aussi doucement.
    `A ${f} ${f} 0 0 1 ${cx + dx} 0`,
    `H ${largeur - r}`,
    `A ${r} ${r} 0 0 1 ${largeur - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

/**
 * Écrans où la barre est masquée (plein écran / parcours bloquant).
 *
 * `FlaixOrder` en fait partie : la page de commande Flaix s'affiche en plein
 * écran, et la barre flottante se posait PAR-DESSUS son bas de page — c'est
 * exactement là qu'un bouton « Payer » se trouve.
 */
const HIDDEN_ON: Array<keyof RootStackParamList> = ['Login', 'QRScanner', 'FlaixOrder'];

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

/**
 * LA COULEUR D'UN ONGLET — une seule règle pour les trois.
 *
 * Orange quand on y est, gris sourd sinon. Un onglet qui s'éteindrait d'une
 * autre couleur se lirait comme un état particulier, pas comme un repos.
 */
const teinte = (actif: boolean) => (actif ? THEME.orange : THEME.inkSoft);

/**
 * L'ICÔNE DU LIEU — l'épingle officielle de la marque.
 *
 * Elle remplace celle que j'avais dessinée faute de fichier : une
 * approximation à la main, qui n'engageait que moi. Ce tracé-ci vient du SVG
 * livré par le client (« logo officiel break eat v2 »), et c'est lui qui fait
 * foi.
 *
 * ON NE GARDE QUE L'ORANGE. Le fichier d'origine superpose des remplissages
 * BLANCS sous chaque tracé coloré — ils servaient à poser l'épingle sur un
 * fond blanc. Conservés ici, ils resteraient blancs quand l'onglet s'éteint,
 * et l'icône grise aurait un cœur blanc au milieu d'une barre blanche. Les
 * trois tracés orange suffisent à dessiner la forme, et se teintent d'un
 * bloc.
 *
 * Trois formes : l'ombre portée au sol, le contour de l'épingle, et l'œil.
 * Elles arrivent dans cet ordre, donc l'œil se pose en dernier — c'est ce qui
 * le rend visible.
 */
function IconeLieu({ actif, taille = 24 }: { actif: boolean; taille?: number }) {
  const couleur = teinte(actif);
  // Le viewBox est celui de la boîte englobante des tracés dans le fichier
  // source : il recadre l'épingle, qui y flottait au milieu d'un format 1440×810.
  return (
    <Svg width={taille * (202.7 / 330.5)} height={taille} viewBox="618.5 239.8 202.7 330.5">
      <Path d="M 719.964844 567 C 694.140625 567 674.667969 557.765625 674.667969 545.519531 C 674.667969 533.277344 694.140625 524.039062 719.964844 524.039062 C 745.789062 524.039062 765.261719 533.277344 765.261719 545.519531 C 765.261719 557.765625 745.78125 567.007812 719.960938 567.007812 Z M 719.964844 530.84375 C 697.929688 530.84375 681.464844 538.59375 681.464844 545.523438 C 681.464844 552.453125 697.933594 560.203125 719.964844 560.203125 C 742 560.203125 758.464844 552.453125 758.464844 545.523438 C 758.464844 538.59375 741.992188 530.835938 719.960938 530.835938 Z M 719.964844 530.84375" fill={couleur} />
      <Path d="M 719.914062 548.914062 C 718.652344 548.914062 717.492188 548.214844 716.90625 547.097656 L 631.097656 384.144531 C 625.070312 374.121094 621.785156 352.007812 621.785156 343.417969 C 621.785156 288.042969 665.058594 242.992188 718.246094 242.992188 C 718.621094 242.992188 718.992188 243.003906 719.359375 243.019531 L 719.976562 243.039062 L 720.464844 243.019531 C 720.835938 243.007812 721.207031 242.992188 721.578125 242.992188 C 774.765625 242.992188 818.039062 288.042969 818.039062 343.417969 C 818.039062 352.007812 814.753906 374.121094 808.726562 384.144531 L 722.921875 547.097656 C 722.324219 548.21875 721.167969 548.917969 719.910156 548.917969 Z M 718.246094 249.800781 C 668.808594 249.800781 628.585938 291.800781 628.585938 343.421875 C 628.585938 352.664062 632.183594 372.839844 636.96875 380.714844 C 637.003906 380.773438 637.035156 380.835938 637.070312 380.894531 L 719.914062 538.222656 L 802.761719 380.894531 C 802.792969 380.835938 802.828125 380.773438 802.863281 380.714844 C 807.644531 372.839844 811.242188 352.664062 811.242188 343.421875 C 811.242188 291.800781 771.019531 249.800781 721.582031 249.800781 C 721.289062 249.800781 721.003906 249.8125 720.714844 249.820312 L 719.980469 249.84375 L 719.113281 249.820312 C 718.808594 249.820312 718.519531 249.804688 718.230469 249.804688 Z M 718.246094 249.800781" fill={couleur} />
      <Path d="M 719.914062 387.40625 C 689.699219 387.40625 665.117188 362.824219 665.117188 332.609375 C 665.117188 302.394531 689.699219 277.8125 719.914062 277.8125 C 750.128906 277.8125 774.707031 302.394531 774.707031 332.609375 C 774.707031 362.824219 750.128906 387.398438 719.921875 387.398438 Z M 719.914062 284.613281 C 693.449219 284.613281 671.917969 306.144531 671.917969 332.609375 C 671.917969 359.074219 693.449219 380.605469 719.914062 380.605469 C 746.378906 380.605469 767.90625 359.074219 767.90625 332.609375 C 767.90625 306.144531 746.386719 284.605469 719.921875 284.605469 Z M 719.914062 284.613281" fill={couleur} />
    </Svg>
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
  // Selecteur SCALAIRE : rendre un objet ici re-rendrait la barre a chaque
  // changement, sur tous les ecrans.
  //
  // Le PANIER n'a plus d'onglet depuis le 16/10 : c'est Flaix qui tient le
  // panier et les produits. L'écran existe toujours et reste atteignable
  // depuis le parcours de commande d'un lieu non basculé.
  const nonLues = useNotifStore((e) => e.nonLues);
  // Appele AVANT le retour anticipe ci-dessous : un hook ne se saute pas.
  const etatPastille = useEtatPastille(currentRoute);
  // La barre est tendue entre deux marges de 14 px : sa largeur se mesure,
  // elle ne se devine pas (un petit écran la rétrécirait sous le tracé).
  const { width: largeurEcran } = useWindowDimensions();
  const largeurBarre = largeurEcran - 28;

  if (!currentRoute || HIDDEN_ON.includes(currentRoute as keyof RootStackParamList)) {
    return null;
  }

  const isLieux = currentRoute === 'Lieux';
  const isCommandes = currentRoute === 'Commandes';
  const isNotifs = currentRoute === 'Notifications';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 16 }]}>
      <View style={styles.bar}>
        {/*
          Le FOND, derrière les onglets. L'ombre est peinte DANS le tracé
          (un second contour décalé, très pâle) plutôt que posée sur la vue :
          une ombre de plateforme a besoin d'un fond opaque, et ce fond-ci
          est une forme trouée. Peinte, elle rend pareil sur iOS, Android et
          web — et c'est le web qui sert l'app aux clients sans installation.
        */}
        <Svg
          width={largeurBarre}
          height={HAUTEUR_BARRE + 6}
          style={styles.fond}
          pointerEvents="none"
        >
          <Path d={traceBarre(largeurBarre)} fill="rgba(45, 41, 38, 0.10)" translateY={3} />
          <Path d={traceBarre(largeurBarre)} fill={THEME.surface} />
        </Svg>
        <Onglet
          libelle="Lieux"
          actif={isLieux}
          onPress={() => navigateTo('Lieux')}
          icone={<IconeLieu actif={isLieux} />}
        />
        {/* Mes commandes — la pastille surélevée. */}
        <Pressable style={styles.fabWrap} onPress={() => navigateTo('Commandes')} hitSlop={6}>
          <View style={styles.fabCadre}>
            <PastilleSuivi etat={etatPastille} actif={isCommandes} />
          </View>
          <Text style={[styles.fabLabel, !isCommandes && styles.fabLabelInactive]} numberOfLines={1}>
            Mes commandes
          </Text>
        </Pressable>

        <Onglet
          // « Notifications », et non « Alertes » : c'est le mot que porte
          // l'ecran qui s'ouvre, celui du reglage dans le profil, et celui
          // du systeme. Deux mots pour une meme chose font chercher deux
          // endroits differents.
          libelle="Notifications"
          actif={isNotifs}
          compte={nonLues}
          onPress={() => navigateTo('Notifications')}
          icone={
            <Ionicons
              // Une cloche PLEINE et orange dès qu'il y a du nouveau : la
              // pastille chiffrée seule se rate d'un coup d'œil, et le client
              // ne pensait pas à ouvrir l'écran.
              name={isNotifs || nonLues > 0 ? 'notifications' : 'notifications-outline'}
              size={23}
              color={teinte(isNotifs || nonLues > 0)}
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
  // Le fond est dessiné (voir `traceBarre`) : cette vue ne porte plus ni
  // couleur ni rayon, seulement la disposition des onglets.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
    paddingHorizontal: 4,
  },
  fond: { position: 'absolute', top: 0, left: 0 },

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
  // 118 et non 82 : « Mes commandes » ne tient pas dans 82 px et se
  // tronquait en « Mes command… ». La barre n'a plus que trois places
  // depuis le retrait du panier et du profil — la largeur est là.
  fabWrap: { width: 118, alignItems: 'center', justifyContent: 'center' },
  // L'anneau deborde de 8 px autour du disque. On remonte de 38 au lieu de
  // 32 : la pastille doit se loger DANS le creux et le dépasser, sinon le
  // creux se voit sans que le bouton paraisse détaché — le pire des deux.
  fabCadre: { marginTop: -38 },
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
