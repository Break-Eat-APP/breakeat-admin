import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { THEME } from '@lib/theme';
import { JAUNE, type EtatPastille } from '@lib/suivi-commande';
import { BLEU_REMBOURSEMENT } from '@components/remboursement-banner';

/**
 * Le tracé de l'éclair de la marque.
 *
 * Retracé depuis le fichier Canva du 21/09/2026 : Canva l'avait exporté en SVG,
 * mais en y enveloppant une IMAGE — impossible à recolorer. Son contour a été
 * suivi pixel par pixel puis simplifié en 31 sommets (angles arrondis compris),
 * et superposé à l'original pour contrôle. Copie propre : `logo/eclair-vectorise.svg`.
 *
 * Un VECTEUR et non une image : c'est ce qui permet de le recolorer à chaque
 * étape, là où l'éclair néon avait ses couleurs figées dans le fichier.
 */
const ECLAIR = {
  largeur: 467,
  hauteur: 778,
  trace:
    'M440 4 L450 4 L460 11 L463 17 L462 28 L296 297 L296 302 L300 306 L415 307 L424 314 ' +
    'L426 319 L426 327 L421 338 L410 354 L370 400 L246 536 L30 761 L17 774 L13 774 L10 771 ' +
    'L13 759 L130 471 L132 461 L127 456 L13 456 L8 455 L4 447 L75 295 L144 121 L150 114 L163 108 Z',
};

const VERT = '#16a34a';
const PISTE = '#EFE9E4';

/** Encombrement total : l'anneau entoure le disque de 8 px de chaque cote. */
export const TAILLE_PASTILLE = 80;
const DISQUE = 64;
/** Hauteur de l'éclair dans le disque ; sa largeur suit ses proportions. */
const HAUTEUR_ECLAIR = 40;
const LARGEUR_ECLAIR = Math.round((HAUTEUR_ECLAIR * ECLAIR.largeur) / ECLAIR.hauteur);
/**
 * Épaisseur du contour, en unités du dessin : ~1,2 px à l'écran. Avec des
 * jointures ARRONDIES, elle adoucit aussi les angles du tracé.
 */
const CONTOUR_ECLAIR = (1.2 * ECLAIR.hauteur) / HAUTEUR_ECLAIR;
const RAYON = 36;
const EPAISSEUR = 4;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

interface Apparence {
  /** Part de l'anneau remplie, de 0 a 1. */
  progression: number;
  /** Couleur de l'éclair ET de l'anneau : les deux disent la même chose. */
  couleur: string;
  /**
   * Contour de l'éclair, une nuance plus sombre.
   *
   * Indispensable au JAUNE : sur fond blanc, un éclair jaune sans contour se lit
   * à peine. Les autres couleurs en profitent aussi, plus discrètement.
   */
  contour: string;
  badge?: 'checkmark' | 'arrow-undo';
  /** Le seul moment ou le client doit bouger : on insiste. */
  appel?: boolean;
}

const APPARENCES: Record<EtatPastille, Apparence> = {
  // Au repos, l'orange de la marque — et PAS d'anneau : c'est l'absence
  // d'anneau qui distingue « rien en cours » de « en préparation », tous deux
  // orange.
  repos: { progression: 0, couleur: THEME.orange, contour: '#C73200' },
  recue: { progression: 1 / 3, couleur: JAUNE, contour: '#A16207' },
  preparation: { progression: 2 / 3, couleur: THEME.orange, contour: '#C73200' },
  prete: { progression: 1, couleur: VERT, contour: '#15803d', appel: true },
  recuperee: { progression: 1, couleur: VERT, contour: '#15803d', badge: 'checkmark' },
  remboursee: { progression: 1, couleur: BLEU_REMBOURSEMENT, contour: '#1e3a8a', badge: 'arrow-undo' },
};


/** « Réduire les animations » (iOS / Android) : on respecte le réglage. */
function useAnimationsReduites(): boolean {
  const [reduites, setReduites] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduites);
    const abonnement = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduites);
    return () => abonnement.remove();
  }, []);
  return reduites;
}

/**
 * Des valeurs qui glissent vers leur cible, image par image.
 *
 * Pourquoi pas `Animated` sur le dessin SVG : sur le WEB, les valeurs animées
 * passées à un tracé SVG ne se mettent pas à jour — l'anneau passait bien au
 * vert mais restait au tiers, et l'éclair restait jaune. Vérifié dans l'aperçu
 * web. Ici, ce sont de simples valeurs d'état : elles marchent partout, et ne
 * bougent que lors d'un changement d'étape, rare.
 *
 * Une transition interrompue repart de ce qui est AFFICHÉ, pas de l'ancienne
 * cible : pas de saut.
 */
function useGlissement(cible: readonly number[], duree: number): number[] {
  // La cible en texte : un tableau neuf à chaque rendu relancerait l'effet.
  const cle = cible.join(',');
  const [valeurs, setValeurs] = useState<number[]>(() => [...cible]);
  const affichees = useRef<number[]>([...cible]);
  useEffect(() => {
    const arrivee = cle.split(',').map(Number);
    const depart = affichees.current;
    if (duree === 0 || depart.every((v, i) => v === arrivee[i])) {
      affichees.current = arrivee;
      setValeurs(arrivee);
      return;
    }
    const debut = Date.now();
    let image = 0;
    const avancer = () => {
      const t = Math.min(1, (Date.now() - debut) / duree);
      const adouci = 1 - Math.pow(1 - t, 3);
      affichees.current = depart.map((v, i) => v + (arrivee[i] - v) * adouci);
      setValeurs(affichees.current);
      if (t < 1) image = requestAnimationFrame(avancer);
    };
    image = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(image);
  }, [cle, duree]);
  return valeurs;
}

/** `#rrggbb` → [r, g, b]. */
function versRgb(hex: string): number[] {
  return [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16));
}

/** Une couleur qui passe à la suivante en fondu, plutôt que de sauter. */
function useCouleurEnFondu(cible: string, duree: number): string {
  const [r, g, b] = useGlissement(versRgb(cible), duree);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * La pastille centrale : l'éclair de la marque, sur fond blanc, entouré de
 * l'anneau qui dit où en est la commande.
 *
 * L'éclair et l'anneau prennent la couleur de l'étape — jaune, orange, vert. Et
 * l'anneau avance par PALIERS RÉELS — un tiers à la réception, deux tiers en
 * préparation, plein quand c'est prêt — jamais par un pourcentage inventé : on
 * ne sait pas si une préparation en est à 30 ou à 50 %.
 */
export function PastilleSuivi({ etat, actif }: { etat: EtatPastille; actif: boolean }) {
  const apparence = APPARENCES[etat];
  const reduites = useAnimationsReduites();

  const remplissage = useCouleurEnFondu(apparence.couleur, reduites ? 0 : 600);
  const contour = useCouleurEnFondu(apparence.contour, reduites ? 0 : 600);

  // ── L'anneau glisse d'un palier au suivant.
  const [progression] = useGlissement([apparence.progression], reduites ? 0 : 900);
  const decalage = CIRCONFERENCE * (1 - progression);

  // ── L'éclair flotte : il monte, redescend et tangue, en permanence.
  const flottement = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduites) {
      flottement.setValue(0.5);
      return;
    }
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(flottement, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(flottement, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [flottement, reduites]);

  // ── L'onde verte, seulement quand la commande est prête.
  const onde = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!apparence.appel || reduites) {
      onde.setValue(0);
      return;
    }
    const boucle = Animated.loop(
      Animated.timing(onde, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [apparence.appel, onde, reduites]);

  return (
    <View style={styles.cadre}>
      <Svg width={TAILLE_PASTILLE} height={TAILLE_PASTILLE} style={styles.anneau}>
        {apparence.progression > 0 ? (
          <Circle cx={40} cy={40} r={RAYON} stroke={PISTE} strokeWidth={EPAISSEUR} fill="none" />
        ) : null}
        <Circle
          cx={40}
          cy={40}
          r={RAYON}
          stroke={apparence.couleur}
          strokeWidth={EPAISSEUR}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCONFERENCE} ${CIRCONFERENCE}`}
          strokeDashoffset={decalage}
          // Le trait part de MIDI et tourne dans le sens des aiguilles d'une
          // montre, comme on lit une progression.
          transform="rotate(-90 40 40)"
          opacity={apparence.progression > 0 ? 1 : 0}
        />
      </Svg>

      {apparence.appel ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.onde,
            {
              borderColor: apparence.couleur,
              opacity: onde.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: onde.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            },
          ]}
        />
      ) : null}

      {/* Deux vues imbriquees, et non une seule : sur iOS, une ombre posee sur
          la meme vue qu'un `overflow: hidden` est rognee avec le contenu. */}
      <View style={[styles.ombre, actif && styles.ombreActive]}>
        <View style={styles.disque}>
          <Animated.View
            style={{
              transform: [
                { translateY: flottement.interpolate({ inputRange: [0, 1], outputRange: [3, -4] }) },
                { rotate: flottement.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
              ],
            }}
          >
            <Svg
              width={LARGEUR_ECLAIR}
              height={HAUTEUR_ECLAIR}
              viewBox={`0 0 ${ECLAIR.largeur} ${ECLAIR.hauteur}`}
            >
              <Path
                d={ECLAIR.trace}
                fill={remplissage}
                stroke={contour}
                strokeWidth={CONTOUR_ECLAIR}
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </View>
      </View>

      {apparence.badge ? (
        <View style={[styles.badge, { backgroundColor: apparence.couleur }]}>
          <Ionicons name={apparence.badge} size={12} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const DECALAGE_DISQUE = (TAILLE_PASTILLE - DISQUE) / 2;

const styles = StyleSheet.create({
  cadre: { width: TAILLE_PASTILLE, height: TAILLE_PASTILLE },
  anneau: { position: 'absolute', left: 0, top: 0 },
  onde: {
    position: 'absolute',
    left: DECALAGE_DISQUE,
    top: DECALAGE_DISQUE,
    width: DISQUE,
    height: DISQUE,
    borderRadius: DISQUE / 2,
    borderWidth: 2,
  },
  ombre: {
    position: 'absolute',
    left: DECALAGE_DISQUE,
    top: DECALAGE_DISQUE,
    width: DISQUE,
    height: DISQUE,
    borderRadius: DISQUE / 2,
    // Un fond OPAQUE : une vue transparente ne projette aucune ombre sur iOS.
    backgroundColor: '#fff',
    // Ombre neutre : c'est elle, avec l'anneau, qui détache le disque blanc
    // de la barre blanche. Teintée, elle se battrait avec la couleur d'étape.
    shadowColor: THEME.ink,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  ombreActive: { shadowOpacity: 0.28, shadowRadius: 14, elevation: 10 },
  disque: {
    width: '100%',
    height: '100%',
    borderRadius: DISQUE / 2,
    overflow: 'hidden',
    backgroundColor: '#fff',
    // Un filet presque invisible : au repos, sans anneau, c'est lui qui trace
    // le bord du disque sur la barre.
    borderWidth: 1,
    borderColor: 'rgba(36, 31, 29, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
