import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { THEME, FONT, HEAD } from '@lib/theme';
import { apiNoterCommande } from '@lib/api/mobile-api';
import { messageServeur } from '@lib/message-serveur';
import { demanderNoteAppStore } from '@lib/note-app-store';

const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

/**
 * LES ÉTOILES D'UNE COMMANDE.
 *
 * Posées APRÈS le retrait, et sur la buvette qui a préparé — pas sur Break
 * Eat. Le client note ce qu'il a vécu au comptoir ; c'est au club que
 * l'information sert.
 *
 * Le commentaire reste FACULTATIF, et c'est ce qui fait la différence entre
 * quelques retours et beaucoup : exiger un texte ferait chuter la
 * participation à presque rien. La plupart des gens veulent dire « c'était
 * bien » d'un geste, pas rédiger.
 */
export function NoterCommande({
  visible,
  orderId,
  buvette,
  onFini,
}: {
  visible: boolean;
  orderId: string;
  /** Le nom de la buvette : on note quelqu'un, pas « une commande ». */
  buvette: string | null;
  /** `note` non nulle quand l'avis est parti — l'appelant rafraîchit. */
  onFini: (note: number | null) => void;
}) {
  const [etoiles, setEtoiles] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const fermer = (note: number | null) => {
    setEtoiles(0);
    setCommentaire('');
    setErreur('');
    onFini(note);
  };

  const envoyer = async () => {
    if (etoiles === 0) return;
    setEnvoi(true);
    setErreur('');
    try {
      await apiNoterCommande(orderId, {
        stars: etoiles,
        comment: commentaire.trim() || undefined,
      });
      /**
       * UNE BONNE NOTE OUVRE LA DEMANDE D'AVIS APPLE — pas l'inverse.
       *
       * On ne sollicite la fiche App Store qu'après un retour positif : aller
       * chercher une note publique auprès de quelqu'un qui vient de mettre
       * deux étoiles, c'est demander un mauvais avis.
       */
      if (etoiles >= 4) void demanderNoteAppStore();
      fermer(etoiles);
    } catch (e) {
      setErreur(messageServeur(e, 'Impossible d’enregistrer ta note pour le moment.'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => fermer(null)}>
      <View style={styles.fond}>
        <View style={styles.feuille}>
          <Text style={styles.titre}>Comment ça s’est passé ?</Text>
          <Text style={styles.sous}>
            {buvette
              ? `Ton retrait chez ${buvette}. Ça aide le club à savoir ce qui marche.`
              : 'Ton retrait. Ça aide le club à savoir ce qui marche.'}
          </Text>

          <View style={styles.etoiles}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setEtoiles(n)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}
              >
                <Ionicons
                  name={n <= etoiles ? 'star' : 'star-outline'}
                  size={38}
                  color={n <= etoiles ? THEME.orange : THEME.border}
                />
              </Pressable>
            ))}
          </View>

          {/* Le champ n'apparaît QU'APRÈS un choix d'étoiles : avant, il
              transforme un geste d'une seconde en formulaire, et on perd
              ceux qui voulaient juste donner leur note. */}
          {etoiles > 0 ? (
            <TextInput
              value={commentaire}
              onChangeText={setCommentaire}
              placeholder="Un mot à ajouter ? (facultatif)"
              placeholderTextColor={THEME.grey}
              multiline
              maxLength={1000}
              style={[styles.champ, NO_OUTLINE]}
            />
          ) : null}

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <Pressable
            style={[styles.principal, (envoi || etoiles === 0) && styles.principalInactif]}
            onPress={() => void envoyer()}
            disabled={envoi || etoiles === 0}
          >
            {envoi ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.principalTexte}>Envoyer</Text>
            )}
          </Pressable>

          <Pressable onPress={() => fermer(null)} disabled={envoi} hitSlop={8}>
            <Text style={styles.plusTard}>Plus tard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(28, 25, 23, 0.45)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 24,
    paddingBottom: 34,
  },
  titre: { color: THEME.ink, fontSize: 20, fontFamily: HEAD.bold },
  sous: {
    color: THEME.inkSoft,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: FONT.regular,
    marginTop: 6,
  },
  // Les étoiles respirent : à 38 px et bien espacées, on ne touche pas la
  // quatrième en visant la troisième.
  etoiles: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 22,
    marginBottom: 6,
  },
  champ: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: THEME.ink,
    fontFamily: FONT.regular,
    backgroundColor: '#fff',
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 14,
  },
  erreur: { color: '#b91c1c', fontSize: 13, marginTop: 10, fontFamily: FONT.regular },
  principal: {
    marginTop: 18,
    backgroundColor: THEME.orange,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  principalInactif: { opacity: 0.45 },
  principalTexte: { color: '#fff', fontSize: 15.5, fontFamily: FONT.bold },
  plusTard: {
    color: THEME.inkSoft,
    fontSize: 14,
    fontFamily: FONT.medium,
    textAlign: 'center',
    marginTop: 14,
  },
});
