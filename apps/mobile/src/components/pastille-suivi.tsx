import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { THEME } from '@lib/theme';
import { JAUNE, type EtatPastille } from '@lib/suivi-commande';
import { BLEU_REMBOURSEMENT } from '@components/remboursement-banner';

// L'eclair de la marque, deja sur son fond orange — et c'est EXACTEMENT le
// meme : #FD4000, releve au pixel dans le fichier d'origine. Le raccord avec
// le disque est donc invisible, meme quand l'eclair bouge.
const ECLAIR = require('../../assets/eclair-neon.png');

const VERT = '#16a34a';
const PISTE = '#EFE9E4';

/** Encombrement total : l'anneau entoure le disque de 8 px de chaque cote. */
export const TAILLE_PASTILLE = 80;
const DISQUE = 64;
const RAYON = 36;
const EPAISSEUR = 4;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

interface Apparence {
  /** Part de l'anneau remplie, de 0 a 1. */
  progression: number;
  couleur: string;
  badge?: 'checkmark' | 'arrow-undo';
  /** Le seul moment ou le client doit bouger : on insiste. */
  appel?: boolean;
}

const APPARENCES: Record<EtatPastille, Apparence> = {
  repos: { progression: 0, couleur: PISTE },
  recue: { progression: 1 / 3, couleur: JAUNE },
  preparation: { progression: 2 / 3, couleur: THEME.orange },
  prete: { progression: 1, couleur: VERT, appel: true },
  recuperee: { progression: 1, couleur: VERT, badge: 'checkmark' },
  remboursee: { progression: 1, couleur: BLEU_REMBOURSEMENT, badge: 'arrow-undo' },
};

const CercleAnime = Animated.createAnimatedComponent(Circle);

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
 * La pastille centrale : l'éclair de la marque, entouré de l'anneau qui dit où
 * en est la commande.
 *
 * L'anneau avance par PALIERS RÉELS — un tiers à la réception, deux tiers en
 * préparation, plein quand c'est prêt — jamais par un pourcentage inventé : on
 * ne sait pas si une préparation en est à 30 ou à 50 %.
 */
export function PastilleSuivi({ etat, actif }: { etat: EtatPastille; actif: boolean }) {
  const apparence = APPARENCES[etat];
  const reduites = useAnimationsReduites();

  // ── L'anneau glisse d'un palier au suivant.
  const progression = useRef(new Animated.Value(apparence.progression)).current;
  useEffect(() => {
    Animated.timing(progression, {
      toValue: apparence.progression,
      duration: reduites ? 0 : 900,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      // Une propriete SVG : le pilote natif ne sait pas l'animer.
      useNativeDriver: false,
    }).start();
  }, [apparence.progression, progression, reduites]);
  const decalage = progression.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCONFERENCE, 0],
  });

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
        <CercleAnime
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
          <Animated.Image
            source={ECLAIR}
            resizeMode="cover"
            style={[
              styles.eclair,
              {
                transform: [
                  { translateY: flottement.interpolate({ inputRange: [0, 1], outputRange: [3, -4] }) },
                  { rotate: flottement.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) },
                  // Agrandi : le mouvement ne decouvre jamais le bord de l'image.
                  { scale: 1.12 },
                ],
              },
            ]}
          />
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
    backgroundColor: THEME.orange,
    // Ombre ORANGE, pas grise : la pastille parait posee au-dessus de la barre.
    shadowColor: THEME.orange,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  ombreActive: { shadowOpacity: 0.6, shadowRadius: 16, elevation: 12 },
  disque: {
    width: '100%',
    height: '100%',
    borderRadius: DISQUE / 2,
    overflow: 'hidden',
    borderWidth: 5,
    borderColor: '#fff',
    backgroundColor: THEME.orange,
  },
  eclair: { width: '100%', height: '100%' },
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
