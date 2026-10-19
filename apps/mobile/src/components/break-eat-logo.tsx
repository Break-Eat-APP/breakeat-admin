import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

// Marque officielle « B éclair » (logo v2), éclair évidé + fond transparent.
// Deux déclinaisons pré-colorées (react-native-web n'applique pas `tintColor`) :
//   • white  → sur fond orange (bandeau, pastille active)
//   • orange → sur fond clair (login, pastille inactive)
const MARK_WHITE = require('../../assets/logo-mark.png');
const MARK_ORANGE = require('../../assets/logo-mark-orange.png');

/**
 * La marque est fournie sur un CARRÉ (480×480), d'où ce ratio de 1.
 *
 * Le carré n'est pas un choix d'affichage : `app.config.js` donne ces
 * mêmes fichiers comme icône iOS, comme `adaptiveIcon` Android et comme
 * image de démarrage, et les trois exigent une image carrée. Le B y est
 * centré avec sa marge ; `contain` fait le reste ici.
 */
const RATIO = 1;

export function BreakEatLogo({
  size = 40,
  variant = 'white',
  style,
}: {
  /** Hauteur en px (largeur calculée selon le ratio). */
  size?: number;
  variant?: 'white' | 'orange';
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={variant === 'orange' ? MARK_ORANGE : MARK_WHITE}
      resizeMode="contain"
      style={[{ width: size * RATIO, height: size }, style]}
    />
  );
}

export default BreakEatLogo;
