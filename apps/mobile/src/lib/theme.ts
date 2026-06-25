/**
 * Thème de l'app mobile — « chaleureux premium » blanc/orange.
 *
 * Valeurs miroir des tokens `@break-eat/brand` (source de vérité côté web), inlinées
 * ici pour rester autonome sous Metro (pas de résolution de package workspace en
 * bare RN). Si une couleur change dans `packages/brand/src/brand.ts`, répercuter ici.
 *
 * Les ombres web (chaînes CSS de BRAND.shadowCard) sont retranscrites en objets de
 * style React Native (iOS shadow* + Android elevation).
 */
import { Platform, type ViewStyle } from 'react-native';

export const THEME = {
  // Accent orange
  orange: '#FC4002',
  orangeDark: '#DA3702',
  orangeSoft: '#FDB9A3',
  orangeTint: 'rgba(252, 64, 2, 0.08)',

  // Neutres chauds
  ink: '#241f1d', // texte principal (anthracite chaud)
  inkSoft: '#6b6460', // texte secondaire / labels
  grey: '#a8a29e', // hints discrets
  border: '#efeae6', // filets très discrets
  bg: '#ffffff', // canevas BLANC
  bgSubtle: '#f4f1ee', // remplissage doux (champ recherche, chips)
  surface: '#ffffff', // cartes

  radius: { card: 16, control: 12, pill: 999 },
} as const;

/** Famille Fredoka (chargée au démarrage). Police de marque — friendly & arrondie. */
export const FONT = {
  regular: 'Fredoka_400Regular',
  medium: 'Fredoka_500Medium',
  semibold: 'Fredoka_600SemiBold',
  bold: 'Fredoka_700Bold',
} as const;

/** Ombre douce et neutre d'une carte au repos (équiv. BRAND.shadowCard). */
export const shadowCard: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#2d2926',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 3 },
  // react-native-web (preview) : box-shadow CSS (les shadow* iOS ne s'appliquent pas).
  web: { boxShadow: '0 1px 2px rgba(45,41,38,0.04), 0 4px 14px rgba(45,41,38,0.06)' },
  default: {},
}) as ViewStyle;

/** Élévation un cran plus marquée (modale / survol — équiv. BRAND.shadowSoft). */
export const shadowSoft: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#2d2926',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  android: { elevation: 8 },
  web: { boxShadow: '0 2px 6px rgba(45,41,38,0.06), 0 12px 32px rgba(45,41,38,0.10)' },
  default: {},
}) as ViewStyle;
