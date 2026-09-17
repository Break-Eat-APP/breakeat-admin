import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { HEAD } from '@lib/theme';

/**
 * Même rouge que le poste opérateur et la Live Activity : un manque se
 * reconnaît au premier coup d'œil, où qu'on le voie.
 */
export const ROUGE_MANQUANT = '#b91c1c';

export interface LigneAvecManque {
  productNameSnapshot: string;
  quantity: number;
  missingQuantity?: number;
}

/** « 1× Bière, 1× Frites » — vide si rien ne manque. */
export function resumeManquants(lignes: LigneAvecManque[]): string {
  return lignes
    .filter((l) => (l.missingQuantity ?? 0) > 0)
    .map((l) => `${l.missingQuantity}× ${l.productNameSnapshot}`)
    .join(', ');
}

/**
 * « Produit manquant » — signalé par le comptoir.
 *
 * Un seul composant pour « Mes commandes » et le suivi de commande : le client
 * doit lire la même phrase partout. Le détail dit QUOI manque, la phrase dit
 * OÙ aller. Ne rend rien s'il ne manque rien — c'est à l'appelant de ne pas
 * l'afficher une fois la commande terminée.
 */
export function MissingItemsBanner({
  lignes,
  comptoir,
  style,
}: {
  lignes: LigneAvecManque[];
  comptoir?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const resume = resumeManquants(lignes);
  if (!resume) return null;

  return (
    <View style={[styles.cadre, style]} accessibilityRole="alert">
      <Text style={styles.titre}>Produit manquant</Text>
      <Text style={styles.texte}>
        Il manque {resume}. Rendez-vous au point de retrait{comptoir ? ` ${comptoir}` : ''}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: {
    backgroundColor: '#fef2f2',
    borderColor: 'rgba(185, 28, 28, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
  },
  titre: { color: ROUGE_MANQUANT, fontSize: 14, fontFamily: HEAD.bold },
  texte: { color: '#7f1d1d', fontSize: 13.5, lineHeight: 19, fontFamily: HEAD.medium },
});
