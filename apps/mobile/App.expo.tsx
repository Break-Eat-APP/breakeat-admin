/**
 * App.expo — entrée de PRÉVISUALISATION Expo Go / web (voir le visuel sur iPhone/iPad
 * via un lien, sans build natif). Réutilise la barre d'onglets de production
 * (main-tabs) et les vrais écrans, mais remplace les cibles à dépendances natives
 * (EventHome/Flaix avec caméra, suivi) par des stubs.
 *
 * Entrée native de production = index.js / App.tsx (inchangés).
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';

import { queryClient } from '@lib/query/query-client';
import { useAppStore } from '@store/app.store';
import { useAuthStore } from '@store/auth.store';
import { THEME, FONT } from '@lib/theme';
import { MainTabs } from '@navigation/main-tabs';
import { LoginScreen } from '@screens/login.screen';
import type { RootStackParamList } from '@navigation/root-navigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Police de marque (Fredoka) par défaut sur tout le texte.
const RNTextWithDefaults = Text as unknown as { defaultProps?: { style?: unknown } };
RNTextWithDefaults.defaultProps = RNTextWithDefaults.defaultProps ?? {};
RNTextWithDefaults.defaultProps.style = { fontFamily: FONT.regular };

function StubScreen({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={styles.stub}>
      <MaterialCommunityIcons name={icon as never} size={44} color={THEME.orange} />
      <Text style={styles.stubTitle}>{title}</Text>
      <Text style={styles.stubSub}>{sub}</Text>
    </View>
  );
}

const EventHomeStub = (_: NativeStackScreenProps<RootStackParamList, 'EventHome'>) => (
  <StubScreen icon="stadium-variant" title="Sélection du lieu" sub="Ici, l'app de production passe le relais à Flaix pour la commande." />
);
const OrderTrackingStub = (_: NativeStackScreenProps<RootStackParamList, 'OrderTracking'>) => (
  <StubScreen icon="package-variant" title="Suivi de commande" sub="Aperçu non disponible dans la prévisualisation." />
);

export default function AppPreview() {
  const setReady = useAppStore((s) => s.setReady);
  const rehydrate = useAuthStore((s) => s.rehydrate);
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  useEffect(() => {
    setReady(true);
    void rehydrate();
  }, [setReady, rehydrate]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: THEME.bg } }}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="EventHome" component={EventHomeStub} />
            <Stack.Screen name="OrderTracking" component={OrderTrackingStub} />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  stub: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  stubTitle: { color: THEME.ink, fontSize: 18, fontFamily: FONT.bold, marginTop: 6 },
  stubSub: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.regular },
});
