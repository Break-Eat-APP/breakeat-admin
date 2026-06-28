import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { THEME, FONT } from '@lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'FlaixOrder'>;

/**
 * Handoff Flaix — point d'entrée de la commande pour les lieux « Flaix activé ».
 *
 * STUB : l'intégration Flaix se fait par API (le contrat d'API Flaix n'est pas encore
 * défini — cf. REPRISE). On reçoit déjà `venueId` + `flaixVenueId` ; une fois le
 * contrat dispo, on appellera l'API Flaix ici (session de commande, plan, etc.).
 */
export function FlaixOrderScreen({ route }: Props) {
  const { flaixVenueId } = route.params;
  return (
    <SafeAreaView style={styles.root}>
      <MaterialCommunityIcons name="lightning-bolt" size={48} color={THEME.orange} />
      <Text style={styles.title}>Commande via Flaix</Text>
      <Text style={styles.sub}>
        Ce lieu utilise Flaix pour la commande. L'intégration arrive bientôt.
      </Text>
      {flaixVenueId ? <Text style={styles.meta}>Réf. Flaix : {flaixVenueId}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { color: THEME.ink, fontSize: 20, fontFamily: FONT.bold, marginTop: 6 },
  sub: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.regular },
  meta: { color: THEME.grey, fontSize: 12, marginTop: 12, fontFamily: FONT.regular },
});
