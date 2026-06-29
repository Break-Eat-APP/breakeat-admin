import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { THEME, FONT } from '@lib/theme';
import { PageHeader } from '@components/page-header';

type Props = NativeStackScreenProps<RootStackParamList, 'FlaixOrder'>;

export function FlaixOrderScreen({ route }: Props) {
  const { flaixVenueId } = route.params;
  return (
    <View style={styles.root}>
      <PageHeader title="Commande Flaix" />
      <View style={styles.body}>
        <MaterialCommunityIcons name="lightning-bolt" size={48} color={THEME.orange} />
        <Text style={styles.title}>Commande via Flaix</Text>
        <Text style={styles.sub}>
          Ce lieu utilise Flaix pour la commande. L'intégration arrive bientôt.
        </Text>
        {flaixVenueId ? <Text style={styles.meta}>Réf. Flaix : {flaixVenueId}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { color: THEME.ink, fontSize: 20, fontFamily: FONT.bold, marginTop: 6 },
  sub: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.regular },
  meta: { color: THEME.grey, fontSize: 12, marginTop: 12, fontFamily: FONT.regular },
});
