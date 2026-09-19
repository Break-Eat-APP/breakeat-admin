import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HEAD } from '@lib/theme';

/**
 * Dire au client qu'il a été remboursé — là où il regarde.
 *
 * La base savait déjà l'enregistrer (`REFUNDED`, `PARTIALLY_REFUNDED`), et
 * l'API le renvoyait déjà : personne ne le LISAIT. Une commande remboursée
 * s'affichait donc « Récupérée », comme si de rien n'était.
 *
 * Ce bandeau vaudra quel que soit l'avenir : que le remboursement soit déclenché
 * par nous ou par un système partenaire qui encaisse à notre place, c'est
 * toujours DANS CETTE APPLICATION que le client vient voir où en est sa
 * commande. L'exécution d'un remboursement dépend de qui encaisse ; son
 * affichage, non.
 */

/**
 * Bleu, et non rouge.
 *
 * Le rouge dit « problème » — il est déjà pris par l'annulation et le produit
 * manquant. Un remboursement est une information : l'argent revient. Le teinter
 * en rouge inquiéterait un client à qui il n'arrive, au fond, rien de grave.
 */
export const BLEU_REMBOURSEMENT = '#1d4ed8';
const BLEU_FOND = '#eef2ff';

/** Les deux seuls états qui intéressent le client. */
export type EtatPaiement = string | null | undefined;

export function estRembourse(paymentStatus: EtatPaiement): boolean {
  return paymentStatus === 'REFUNDED' || paymentStatus === 'PARTIALLY_REFUNDED';
}

export function RemboursementBanner({
  paymentStatus,
  style,
}: {
  paymentStatus: EtatPaiement;
  style?: StyleProp<ViewStyle>;
}) {
  if (!estRembourse(paymentStatus)) return null;

  const total = paymentStatus === 'REFUNDED';

  return (
    <View style={[styles.bandeau, style]}>
      <Ionicons name="arrow-undo-circle" size={17} color={BLEU_REMBOURSEMENT} />
      <View style={styles.texte}>
        <Text style={styles.titre}>
          {total ? 'Commande remboursée' : 'Remboursement partiel'}
        </Text>
        {/*
          Le délai est écrit NOIR SUR BLANC, et ce n'est pas du remplissage :
          l'argent ne revient pas à la seconde, et un client qui ne voit rien
          sur son compte le lendemain croit qu'on ne l'a pas remboursé. C'est le
          message qu'on nous écrit le plus souvent après un remboursement.
        */}
        <Text style={styles.detail}>
          {total
            ? 'Le montant a été renvoyé sur votre moyen de paiement.'
            : 'Une partie du montant a été renvoyée sur votre moyen de paiement.'}{' '}
          Comptez quelques jours ouvrés, selon votre banque.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bandeau: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: BLEU_FOND,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(29, 78, 216, 0.18)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  texte: { flex: 1, gap: 2 },
  titre: { color: BLEU_REMBOURSEMENT, fontSize: 13.5, fontFamily: HEAD.bold },
  detail: { color: BLEU_REMBOURSEMENT, fontSize: 12, lineHeight: 17, opacity: 0.85 },
});
