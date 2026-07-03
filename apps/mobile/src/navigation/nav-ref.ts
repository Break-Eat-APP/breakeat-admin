import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@navigation/root-navigator';

/**
 * Référence globale au conteneur de navigation — permet à la barre du bas
 * (rendue HORS du Stack, en overlay persistant) de naviguer sans hook de screen.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateTo<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name],
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error — surcharge générique de navigate (params optionnels selon l'écran)
    navigationRef.navigate(name, params);
  }
}
