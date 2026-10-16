import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { THEME, FONT } from '@lib/theme';
import { PageHeader } from '@components/page-header';
import { RelaisFlaix } from '@components/relais-flaix';

type Props = NativeStackScreenProps<RootStackParamList, 'FlaixOrder'>;

/**
 * LE RELAIS FLAIX.
 *
 * La commande de certains lieux se passe sur une page Flaix. Elle s'ouvre ici,
 * DANS l'application : Flaix fait partie de Break Eat, le client ne doit pas
 * voir qu'il change de maison.
 *
 * L'adresse arrive toute faite, RÉSOLUE PAR LE SERVEUR à partir de la date du
 * jour (`backend/src/common/helpers/fenetre-commande.ts`) : chaque événement
 * porte son lien, et c'est celui du match en cours qui remonte. L'app n'a
 * jamais à deviner une URL — le jour où Flaix change son format d'adresse,
 * rien ne tombe.
 *
 * Sans adresse, l'écran reste HONNÊTE et offre le retour : c'est le cul-de-sac
 * que l'audit du 10/10 avait relevé, et il ne doit pas revenir.
 */
export function FlaixOrderScreen({ route, navigation }: Props) {
  const { flaixVenueId, url, venueName } = route.params;
  const titre = venueName ?? 'Commande';

  if (url) {
    return (
      <View style={styles.root}>
        <PageHeader title={titre} />
        <RelaisFlaix url={url} titre={titre} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title="Commande" />
      <View style={styles.body}>
        <MaterialCommunityIcons name="lightning-bolt" size={48} color={THEME.orange} />
        <Text style={styles.title}>Commande en ligne</Text>
        <Text style={styles.sub}>
          La commande de ce lieu n&apos;est pas ouverte en ce moment. Reviens un peu avant
          le début de l&apos;événement.
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
