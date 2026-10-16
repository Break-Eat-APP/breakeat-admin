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

import { THEME, FONT } from '@lib/theme';
import { apiMettreAJourProfil, type MonProfil } from '@lib/api/mobile-api';

const NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

/**
 * « Pour aller plus vite » — les coordonnées demandées UNE fois.
 *
 * Ce n'est pas une étape de plus : la page de commande les demande de toute
 * façon, à chaque match. Posée ici, la question ne revient jamais — et ni
 * Apple ni Google ne donnent de numéro de téléphone, donc pour ces comptes
 * c'était le seul moyen de l'obtenir.
 *
 * « Plus tard » est toujours offert, et mène à la commande quand même : la
 * page Flaix redemandera simplement ce qui manque. Bloquer un client devant
 * un formulaire au moment où il veut consommer serait absurde.
 */
export function DemandeCoordonnees({
  visible,
  profil,
  onTermine,
}: {
  visible: boolean;
  profil: MonProfil | null;
  /** `enregistre` : vrai si le profil a changé — l'appelant doit recharger. */
  onTermine: (enregistre: boolean) => void;
}) {
  const [prenom, setPrenom] = useState(profil?.firstName ?? '');
  const [nom, setNom] = useState(profil?.lastName ?? '');
  const [tel, setTel] = useState(profil?.phone ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await apiMettreAJourProfil({
        firstName: prenom.trim(),
        lastName: nom.trim(),
        phone: tel.trim(),
      });
      onTermine(true);
    } catch (e) {
      // Le serveur dit POURQUOI il refuse (numéro mal formé, par exemple).
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onTermine(false)}>
      <View style={styles.fond}>
        <View style={styles.feuille}>
          <Text style={styles.titre}>Pour commander plus vite</Text>
          <Text style={styles.sous}>
            Ces informations sont demandées au moment de payer. Saisies ici une fois, elles
            seront déjà remplies à chaque commande.
          </Text>

          <Text style={styles.label}>Prénom</Text>
          <TextInput
            value={prenom}
            onChangeText={setPrenom}
            placeholder="Prénom"
            placeholderTextColor={THEME.grey}
            autoComplete="given-name"
            textContentType="givenName"
            style={[styles.champ, NO_OUTLINE]}
          />

          <Text style={styles.label}>Nom</Text>
          <TextInput
            value={nom}
            onChangeText={setNom}
            placeholder="Nom"
            placeholderTextColor={THEME.grey}
            autoComplete="family-name"
            textContentType="familyName"
            style={[styles.champ, NO_OUTLINE]}
          />

          <Text style={styles.label}>Téléphone</Text>
          <TextInput
            value={tel}
            onChangeText={setTel}
            placeholder="06 12 34 56 78"
            placeholderTextColor={THEME.grey}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={[styles.champ, NO_OUTLINE]}
          />

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <Pressable
            style={[styles.principal, envoi && styles.principalOccupe]}
            onPress={() => void enregistrer()}
            disabled={envoi}
          >
            {envoi ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.principalTexte}>Enregistrer et commander</Text>
            )}
          </Pressable>

          {/* Toujours une sortie : la page de commande redemandera ce qui manque. */}
          <Pressable onPress={() => onTermine(false)} disabled={envoi} hitSlop={8}>
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
    gap: 6,
  },
  titre: { color: THEME.ink, fontSize: 20, fontFamily: FONT.bold },
  sous: {
    color: THEME.inkSoft,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: FONT.regular,
    marginBottom: 10,
  },
  label: { color: THEME.inkSoft, fontSize: 12.5, fontFamily: FONT.bold, marginTop: 8 },
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
  },
  erreur: { color: '#b91c1c', fontSize: 13, marginTop: 10, fontFamily: FONT.regular },
  principal: {
    marginTop: 18,
    backgroundColor: THEME.orange,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  principalOccupe: { opacity: 0.7 },
  principalTexte: { color: '#fff', fontSize: 15.5, fontFamily: FONT.bold },
  plusTard: {
    color: THEME.inkSoft,
    fontSize: 14,
    fontFamily: FONT.medium,
    textAlign: 'center',
    marginTop: 14,
  },
});
