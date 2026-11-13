import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { visuelDeLieu } from '@lib/visuel-lieu';

/**
 * L'IMAGE D'UN LIEU, À LA FORME DE L'IMAGE — un seul composant pour toute l'app.
 *
 * Elle était découpée en ROND, d'abord sur le ticket de « Mes commandes »
 * (corrigé le 12/11), puis encore dans l'en-tête de l'écran du lieu (signalé
 * par Rémi le 13/11) : une image carrée y perdait ses coins. Deux écrans, deux
 * copies de la même règle, et l'une avait divergé. Elle vit désormais ICI.
 *
 * Le cadre suit les proportions réelles de l'image (`Image.getSize`) : carrée,
 * elle reste carrée ; en largeur, elle s'élargit — dans des bornes, pour ne pas
 * écraser le nom à côté. Coins simplement adoucis.
 *
 * Le LOGO garde un fond blanc : ces en-têtes sont orange vif, et un écusson
 * posé à même l'orange perd ses couleurs (un logo au fond blanc y ferait en
 * plus un carré blanc). La PHOTO, elle, remplit le cadre, sans fond.
 * Rien si le lieu n'a pas d'image — un cadre vide serait une tache sans raison.
 */
export function ImageDuLieu({
  nom,
  logoUrl,
  photoUrl,
  hauteur,
  rayon = Math.round(hauteur * 0.2),
  style,
}: {
  nom: string;
  logoUrl?: string | null;
  photoUrl?: string | null;
  hauteur: number;
  rayon?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const visuel = visuelDeLieu({ name: nom, imageUrl: logoUrl, photoUrl }, 'logo');
  const uri = visuel.type === 'image' ? visuel.uri : null;
  // Carré tant que les proportions ne sont pas connues : c'est le cas courant.
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (!uri) return;
    let actif = true;
    Image.getSize(
      uri,
      (l, h) => {
        if (actif && l > 0 && h > 0) setRatio(Math.min(Math.max(l / h, 0.6), 1.8));
      },
      () => undefined,
    );
    return () => {
      actif = false;
    };
  }, [uri]);

  if (visuel.type !== 'image') return null;
  const logo = visuel.cadrage === 'contain';
  return (
    <View
      style={[
        styles.cadre,
        { height: hauteur, width: Math.round(hauteur * ratio), borderRadius: rayon },
        logo && styles.fond,
        style,
      ]}
    >
      <Image
        source={{ uri: visuel.uri }}
        style={logo ? styles.logo : styles.pleine}
        resizeMode={visuel.cadrage}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fond: { backgroundColor: '#fff' },
  logo: { width: '86%', height: '86%' },
  pleine: { width: '100%', height: '100%' },
});
