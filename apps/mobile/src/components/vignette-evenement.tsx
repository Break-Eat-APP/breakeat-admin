import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { initialesAdversaire } from '@lib/calendrier-saison';
import { THEME, HEAD } from '@lib/theme';

/**
 * CE QU'UN ÉVÉNEMENT MONTRE — une affiche, un blason, ou des initiales.
 *
 * Écrite pour le ruban du calendrier de saison, extraite ici le 06/11/2026
 * quand l'accueil s'est mis à lister des événements lui aussi. Deux écrans
 * dessinent désormais la même chose ; la recopier aurait garanti que l'un des
 * deux finisse par diverger — et c'est toujours celui qu'on regarde le moins
 * qui se trompe.
 *
 * ── POURQUOI L'AFFICHE A SA PROPRE FORME ─────────────────────────────
 *
 * Un écusson est rond, ou presque : il tient dans un cercle sans rien perdre.
 * Une affiche est un portrait dont TOUT le propos vit dans la hauteur — le
 * titre en haut, l'artiste au milieu, la date en bas. Glissée dans le même
 * cercle, il n'en reste que le centre : une tache de couleur.
 *
 * C'est pourquoi l'affiche est un CHAMP à part en base (`posterUrl`) : le code
 * doit savoir laquelle des deux il tient, pas le deviner à l'extension du
 * fichier ou aux proportions de l'image — deux indices qui se trompent.
 *
 * ── L'AFFICHE L'EMPORTE SUR LE BLASON ────────────────────────────────
 *
 * Les deux peuvent être remplis : c'est le derby dont le club a fait une
 * affiche. Le serveur ne tranche pas — il rend les deux. Ici on choisit
 * l'affiche : elle a été posée pour CET événement et porte son identité
 * propre, là où un blason ne désigne que le camp d'en face.
 */

/**
 * Le strict nécessaire pour dessiner.
 *
 * Une forme STRUCTURELLE, et non le type d'un écran : le calendrier de saison
 * et l'accueil servent deux objets différents, qui ont ces champs en commun.
 * Exiger l'un des deux types aurait obligé le second à fabriquer un objet
 * qu'il n'a pas.
 */
export interface VisuelEvenement {
  name: string;
  opponentName?: string | null;
  opponentLogoUrl?: string | null;
  posterUrl?: string | null;
}

/**
 * LES PROPORTIONS D'UNE AFFICHE — 2:3.
 *
 * C'est le format de tout ce qui s'imprime et se colle : A4, A3, le 40×60 des
 * panneaux. Les affiches de concert en sortent rarement.
 *
 * On ne LIT PAS les proportions réelles du fichier : il faudrait l'avoir
 * téléchargé, et un flyer carré ou en 4:5 doit s'afficher quand même. C'est
 * donc le CADRE qui impose la forme, et l'image qui s'y adapte.
 */
const RATIO_AFFICHE = 2 / 3;

/**
 * COMBIEN DE FOIS LE BLASON, quand l'affiche passe en lecture.
 *
 * Trois : assez pour reconnaître l'artiste et la date sur un flyer, assez peu
 * pour que le bouton « Commander » reste à l'écran sans faire défiler. Une
 * affiche pleine largeur a été essayée d'abord et écartée : dans une carte de
 * 343 pixels, un 2:3 fait 514 pixels de haut.
 */
const AFFICHE_EN_LECTURE = 3;

export function VignetteEvenement({
  evenement,
  taille,
  role = 'index',
  anneau = 'aucun',
}: {
  evenement: VisuelEvenement;
  /** Le diamètre du blason — et, en rôle d'index, la hauteur de l'affiche. */
  taille: number;
  /**
   * CE QU'ON FAIT DE L'IMAGE — la repérer, ou la lire.
   *
   * `index` : on parcourt du pouce, on reconnaît, on appuie. L'affiche y prend
   * la HAUTEUR DU BLASON, et ce n'est pas un raccourci : dans un ruban, chaque
   * case pose son libellé juste sous son image, et une affiche plus haute
   * décalerait le sien. Une rangée de dates désalignée se voit tout de suite.
   *
   * `lecture` : une seule image, et de la place. Elle passe en grand, et on ne
   * rogne plus rien.
   */
  role?: 'index' | 'lecture';
  anneau?: 'ouvert' | 'choisi' | 'aucun';
}) {
  const affiche = evenement.posterUrl?.trim();
  const logo = evenement.opponentLogoUrl?.trim();

  const bordure = {
    borderWidth: anneau === 'aucun' ? 1 : 2,
    borderColor:
      anneau === 'ouvert' ? THEME.orange : anneau === 'choisi' ? THEME.ink : THEME.border,
  };

  if (affiche) {
    const lecture = role === 'lecture';
    const hauteur = lecture ? taille * AFFICHE_EN_LECTURE : taille;
    const largeur = Math.round(hauteur * RATIO_AFFICHE);
    return (
      <View
        style={[
          styles.cadre,
          bordure,
          {
            width: largeur,
            height: hauteur,
            // Un arrondi PROPORTIONNEL : la même image doit avoir l'air du
            // même objet à 48 et à 132 pixels. Un rayon fixe paraît dur en
            // grand et avale les coins en petit. Le plancher de 6 évite
            // l'angle vif au plus petit format.
            borderRadius: Math.max(6, Math.round(hauteur * 0.08)),
          },
        ]}
      >
        <Image
          source={{ uri: affiche }}
          style={styles.pleine}
          /*
            `cover` EN INDEX, `contain` EN LECTURE — et l'asymétrie est le but.

            À 32 pixels de large on ne lit plus rien : ce qu'il faut, c'est un
            rectangle PLEIN aux couleurs du flyer, qu'on reconnaît entre deux
            ronds. `contain` n'y ajouterait que des bandes blanches.

            En lecture on lit : `contain` montre l'affiche ENTIÈRE — rogner y
            couperait le titre, qui est en haut de tous les flyers du monde.
          */
          resizeMode={lecture ? 'contain' : 'cover'}
        />
      </View>
    );
  }

  const cercle = { width: taille, height: taille, borderRadius: taille / 2, ...bordure };

  /*
    LE BLASON REMPLIT LE ROND — `cover`, et toute la surface.

    `contain` à 0,72 puis à 0,94 ont été essayés : les deux laissaient le
    blason flotter dans une couronne vide. LA CAUSE N'ÉTAIT PAS ICI. Les
    blasons que les clubs collent viennent de sites d'images et portent LEUR
    PROPRE MARGE — mesuré sur les adresses en production : 54 % de
    remplissage pour le PSG, 53 % pour Beşiktaş, dans des images de 3840×2160.

    `cover` rogne ce qui dépasse, et ici ce qui dépasse EST la marge : le
    dessin est centré et plus petit que le côté le plus court. Aucun des trois
    n'est entamé, tous passent à plus de 85 % du rond.

    Le risque est réel : un blason collé au bord de son fichier se ferait
    rogner. C'est le prix pour que le cas courant cesse d'être minuscule.
  */
  if (logo) {
    return (
      <View style={[styles.cadre, cercle]}>
        <Image source={{ uri: logo }} style={styles.pleine} resizeMode="cover" />
      </View>
    );
  }

  /*
    LE REPLI : un disque sourd aux initiales, jamais un trou ni une image
    cassée. Un calendrier sans blason reste utile ; un calendrier dont les
    blasons manquent à moitié est pire que pas de blason du tout.
  */
  return (
    <View style={[styles.cadre, styles.vide, cercle]}>
      <Text style={[styles.initiales, { fontSize: taille * 0.3 }]}>
        {initialesAdversaire(evenement.opponentName ?? null, evenement.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
    overflow: 'hidden',
  },
  pleine: { width: '100%', height: '100%' },
  vide: { backgroundColor: THEME.bgSubtle },
  initiales: { color: THEME.inkSoft, fontFamily: HEAD.bold },
});
