import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { THEME, FONT } from '@lib/theme';
import { PageHeader } from '@components/page-header';

type Props = NativeStackScreenProps<RootStackParamList, 'FlaixOrder'>;

/**
 * L'ÉCRAN D'ATTENTE DU RELAIS FLAIX.
 *
 * Il n'ouvre encore aucune adresse : le mécanisme du lien par événement n'est
 * pas tranché (voir `brain/FRONTIERE_FLAIX_OPS.md`). En attendant, cet écran
 * doit au moins être HONNÊTE et ne pas enfermer le client — l'audit du 10/10 le
 * décrivait justement comme un cul-de-sac.
 *
 * Deux garde-fous, donc : on n'y arrive plus que si le lieu est réellement
 * configuré (`venue-discovery.screen.tsx` retombe sinon sur l'événement du
 * lieu), et on offre toujours le retour.
 */
export function FlaixOrderScreen({ route, navigation }: Props) {
  const { flaixVenueId } = route.params;
  return (
    <View style={styles.root}>
      <PageHeader title="Commande" />
      <View style={styles.body}>
        <MaterialCommunityIcons name="lightning-bolt" size={48} color={THEME.orange} />
        <Text style={styles.title}>Commande en ligne</Text>
        <Text style={styles.sub}>
          La commande de ce lieu se fait sur sa page dédiée. Elle n'est pas encore
          accessible depuis l'application.
        </Text>
        <Pressable style={styles.retour} onPress={() => navigation.goBack()}>
          <Text style={styles.retourTexte}>Retour aux lieux</Text>
        </Pressable>
        {flaixVenueId ? <Text style={styles.meta}>Réf. {flaixVenueId}</Text> : null}
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
  // Un écran sans issue est un écran cassé : le retour est toujours offert.
  retour: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: THEME.orange,
  },
  retourTexte: { color: '#fff', fontSize: 15, fontFamily: FONT.bold },
});
