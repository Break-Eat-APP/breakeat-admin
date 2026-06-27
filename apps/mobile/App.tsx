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
import { queryClient } from '@lib/query/query-client';
import { RootNavigator } from '@navigation/root-navigator';
import { useAppStore } from '@store/app.store';
import { FONT } from '@lib/theme';

// Police de marque (Fredoka) par défaut sur tout le texte — styles explicites priment.
const RNTextWithDefaults = Text as unknown as { defaultProps?: { style?: unknown } };
RNTextWithDefaults.defaultProps = RNTextWithDefaults.defaultProps ?? {};
RNTextWithDefaults.defaultProps.style = { fontFamily: FONT.regular };

/**
 * Point d'entrée de production. Enveloppe l'app de :
 *  1. polices Fredoka (chargées avant le rendu)
 *  2. SafeAreaProvider
 *  3. QueryClientProvider (TanStack Query)
 *  4. RootNavigator (React Navigation)
 */
export default function App() {
  const setReady = useAppStore((s) => s.setReady);
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) setReady(true);
  }, [setReady, fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootNavigator />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
