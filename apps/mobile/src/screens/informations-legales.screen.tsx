import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@navigation/root-navigator';
import { PageHeader } from '@components/page-header';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { DOCUMENTS_LEGAUX, documentParCle } from '@lib/textes-legaux';
import { THEME, shadowCard, FONT, HEAD } from '@lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * INFORMATIONS LÉGALES — les quatre documents, lisibles dans l'app.
 *
 * Avant, « Mentions légales » et « Confidentialité » ouvraient tous deux une
 * boîte « Bientôt — Disponible prochainement ». Deux entrées qui ne menaient
 * nulle part, dans un menu où l'on vient précisément chercher une réponse.
 *
 * Une seule entrée les regroupe désormais : un client qui cherche « les
 * conditions » ne sait pas d'avance laquelle des quatre il veut, et quatre
 * lignes au milieu des réglages feraient du menu un sommaire.
 *
 * Le texte est rendu DANS l'application, pas servi en PDF : voir
 * `lib/textes-legaux.ts` pour les raisons.
 */
export function InformationsLegalesScreen() {
  const navigation = useNavigation<Nav>();
  const espaceBas = useBottomBarSpace();

  return (
    <View style={styles.root}>
      <PageHeader title="Informations légales" />
      <ScrollView contentContainerStyle={[styles.contenu, { paddingBottom: espaceBas }]}>
        <Text style={styles.intro}>
          Les documents qui encadrent l’utilisation de Break Eat. Ils sont
          consultables ici à tout moment, même sans réseau.
        </Text>

        {DOCUMENTS_LEGAUX.map((doc) => (
          <Pressable
            key={doc.cle}
            style={({ pressed }) => [styles.carte, shadowCard, pressed && styles.pressee]}
            onPress={() => navigation.navigate('DocumentLegal', { cle: doc.cle })}
            accessibilityRole="button"
            accessibilityLabel={`Ouvrir ${doc.titre}`}
          >
            <View style={styles.carreIcone}>
              <Ionicons name="document-text-outline" size={19} color={THEME.orange} />
            </View>
            <View style={styles.texte}>
              <Text style={styles.titre}>{doc.titre}</Text>
              <Text style={styles.resume}>{doc.resume}</Text>
              <Text style={styles.version}>{doc.version}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * UN document, en entier.
 *
 * Pas de repli, pas d'onglets : un texte contractuel se lit d'un bout à
 * l'autre, et un client qui cherche une clause précise balaie les titres.
 * Replier les sections lui ferait ouvrir vingt et un panneaux.
 */
export function DocumentLegalScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'DocumentLegal'>>();
  const espaceBas = useBottomBarSpace();
  const doc = documentParCle(params.cle);

  if (!doc) {
    return (
      <View style={styles.root}>
        <PageHeader title="Document" />
        <View style={styles.centre}>
          <Text style={styles.absent}>Ce document n’est pas disponible.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title={doc.titre} />
      <ScrollView contentContainerStyle={[styles.contenu, { paddingBottom: espaceBas }]}>
        <Text style={styles.docVersion}>{doc.version}</Text>

        {doc.sections.map((section) => (
          <View key={section.titre} style={styles.section}>
            <Text style={styles.sectionTitre}>{section.titre}</Text>
            {section.paragraphes.map((p, i) => (
              <Text key={i} style={styles.paragraphe}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  contenu: { padding: 16 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  absent: { color: THEME.grey, fontSize: 14, fontFamily: FONT.regular },

  intro: {
    color: THEME.inkSoft,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: FONT.regular,
    marginBottom: 16,
  },

  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    padding: 15,
    marginBottom: 11,
  },
  pressee: { opacity: 0.65 },
  carreIcone: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: THEME.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texte: { flex: 1 },
  titre: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold },
  resume: {
    color: THEME.inkSoft,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: FONT.regular,
    marginTop: 3,
  },
  // La date rassure sur l'actualité du document — et c'est elle qu'on cite
  // quand on veut savoir quelle version on a acceptée.
  version: { color: THEME.grey, fontSize: 11.5, fontFamily: FONT.regular, marginTop: 4 },
  chevron: { color: THEME.grey, fontSize: 22 },

  docVersion: {
    color: THEME.grey,
    fontSize: 12.5,
    fontFamily: FONT.regular,
    marginBottom: 18,
  },
  section: { marginBottom: 22 },
  sectionTitre: {
    color: THEME.orange,
    fontSize: 15,
    fontFamily: HEAD.bold,
    marginBottom: 8,
  },
  // Interligne généreux : c'est un texte dense qu'on lit sur un téléphone, et
  // serré il décourage avant la troisième ligne.
  paragraphe: {
    color: THEME.ink,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FONT.regular,
    marginBottom: 9,
  },
});
