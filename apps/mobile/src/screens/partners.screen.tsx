import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@components/page-header';
import { BreakEatLogo } from '@components/break-eat-logo';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { THEME, shadowCard, FONT } from '@lib/theme';

/** Partenaires Break Eat (clubs, salles & restaurateurs). */
const PARTNERS: string[] = [
  "Arena d'Aix-en-Provence",
  'Spartiates de Marseille',
  'Basilic Restauration',
  'Dôme de Marseille',
  'Palais des Sports de Marseille',
  'Blue Stars de Marseille',
  'Handball Plan de Cuques',
  'PAUC',
];

export function PartnersScreen() {
  // Espace sous le contenu : la barre flottante ne doit rien recouvrir.
  // Calcule a l'execution car il depend de la zone sure de l'appareil.
  const espaceBas = useBottomBarSpace();
  return (
    <View style={styles.root}>
      <PageHeader title="Nos lieux" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: espaceBas }]}>
        <Text style={styles.intro}>
          Ils nous font confiance — clubs, salles et restaurateurs qui proposent Break Eat.
        </Text>

        <View style={[styles.list, shadowCard]}>
          {PARTNERS.map((name, i) => (
            <View key={name}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={styles.iconCircle}>
                  <BreakEatLogo size={22} variant="orange" />
                </View>
                <Text style={styles.name}>{name}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>D'autres lieux arrivent bientôt.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { padding: 16 },

  intro: { color: THEME.inkSoft, fontSize: 14, lineHeight: 20, fontFamily: FONT.medium, marginBottom: 16 },

  list: { backgroundColor: THEME.surface, borderRadius: THEME.radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, color: THEME.ink, fontSize: 15, fontFamily: FONT.semibold },
  divider: { height: 1, backgroundColor: THEME.border, marginLeft: 16 },

  footer: { color: THEME.grey, fontSize: 13, textAlign: 'center', marginTop: 16, fontFamily: FONT.regular },
});
