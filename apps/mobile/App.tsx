import './src/instrument'; // Sentry must be first
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
  Raleway_800ExtraBold,
} from '@expo-google-fonts/raleway';
import { Oswald_400Regular, Oswald_500Medium, Oswald_600SemiBold } from '@expo-google-fonts/oswald';
import { queryClient } from '@lib/query/query-client';
import { RootNavigator } from '@navigation/root-navigator';
import { useAppStore } from '@store/app.store';

// Raleway Medium par défaut sur tout le texte.
const RNTextWithDefaults = Text as unknown as { defaultProps?: { style?: unknown } };
RNTextWithDefaults.defaultProps = RNTextWithDefaults.defaultProps ?? {};
RNTextWithDefaults.defaultProps.style = { fontFamily: 'Raleway_500Medium' };

/**
 * Point d'entrée de production. Enveloppe l'app de :
 *  1. polices Fredoka (chargées avant le rendu)
 *  2. SafeAreaProvider
 *  3. QueryClientProvider (TanStack Query)
 *  4. RootNavigator (React Navigation)
 */
export default function App() {
  const setReady = useAppStore((s) => s.setReady);
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
    Raleway_800ExtraBold,
    Oswald_400Regular,
    Oswald_500Medium,
    Oswald_600SemiBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) setReady(true);
  }, [setReady, ready]);

  // Ne pas rester bloqué sur écran blanc si une police échoue à charger.
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
