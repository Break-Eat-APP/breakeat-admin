import React from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

// Marque officielle « B éclair » (logo v2), éclair évidé + fond transparent.
// Deux déclinaisons pré-colorées (react-native-web n'applique pas `tintColor`) :
//   • white  → sur fond orange (bandeau, pastille active)
//   • orange → sur fond clair (login, pastille inactive)
const MARK_WHITE = require('../../assets/logo-mark.png');
const MARK_ORANGE = require('../../assets/logo-mark-orange.png');

/** Ratio largeur/hauteur de la marque (≈ 480×533). */
const RATIO = 0.9;

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
