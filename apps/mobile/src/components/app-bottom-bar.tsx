import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
 * L'ICÔNE DU LIEU — une épingle de carte : une boule, et la hampe sous elle.
 *
 * Avant, un stade (`stadium-variant`). Il promettait un stade, alors que
 * l'écran liste des LIEUX — un bar, une salle, une buvette de club. Une
 * épingle ne promet rien d'autre qu'un endroit, et c'est exactement le sujet.
 *
 * Dessinée plutôt que prise dans une police d'icônes : les épingles toutes
 * faites sont des gouttes pleines, où la boule ne se distingue pas de la
 * pointe. Ici la boule est une forme à part — c'est elle qui porte l'orange
 * quand l'onglet est actif, et c'est ce qu'on voit en premier.
 *
 * Le gris inactif est celui des deux autres onglets (`teinte`) : un onglet qui
 * s'éteindrait d'une autre couleur se lirait comme un état, pas comme un repos.
 */
function IconeLieu({ actif, taille = 23 }: { actif: boolean; taille?: number }) {
  const couleur = teinte(actif);
  // Tracé pensé dans une boîte de 24, mis à l'échelle par le viewBox : les
  // coordonnées restent lisibles quelle que soit la taille demandée.
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24">
      {/* La hampe : elle part de sous la boule et s'affine jusqu'au sol.
          Un trait d'épaisseur constante donnait un clou ; l'effilé donne
          une épingle qui se pose. */}
      <Path d="M9.6 12.4 L14.4 12.4 L12.7 21.4 Q12 22.4 11.3 21.4 Z" fill={couleur} />
      <Circle cx={12} cy={8.6} r={5.6} fill={couleur} />
      {/* L'œil de l'épingle, évidé : sans lui la boule est un point plein et
          l'ensemble ne se lit plus comme une épingle à cette taille. */}
      <Circle cx={12} cy={8.6} r={2.1} fill={THEME.surface} />
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
