import React, { useEffect, useState } from 'react';
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
 * Les coordonnées du client — demandées avant une commande, OU corrigées
 * depuis le profil. Une seule feuille pour les deux.
 *
 *  · `commande` — « Pour aller plus vite », posée UNE fois avant la première
 *    commande Flaix. Ce n'est pas une étape de plus : la page de commande les
 *    demande de toute façon, à chaque match. Posée ici, la question ne revient
 *    jamais — et ni Apple ni Google ne donnent de numéro de téléphone, donc
 *    pour ces comptes c'était le seul moyen de l'obtenir. « Plus tard » est
 *    toujours offert, et mène à la commande quand même.
 *
 *  · `profil` — « Mes informations », pour corriger un numéro ou un nom mal
 *    saisi. Il n'existait aucun écran pour cela : une faute de frappe au
 *    moment de l'inscription repartait sur chaque commande.
 *
 * Deux feuilles séparées auraient divergé à la première correction — un champ
 * ajouté d'un côté, une règle de saisie de l'autre. Seuls les MOTS changent.
 */
export function DemandeCoordonnees({
  visible,
  profil,
  mode = 'commande',
  onTermine,
}: {
  visible: boolean;
  profil: MonProfil | null;
  mode?: 'commande' | 'profil';
  /** `enregistre` : vrai si le profil a changé — l'appelant doit recharger. */
  onTermine: (enregistre: boolean) => void;
}) {
  const edition = mode === 'profil';
  const [prenom, setPrenom] = useState(profil?.firstName ?? '');
  const [nom, setNom] = useState(profil?.lastName ?? '');
  const [tel, setTel] = useState(profil?.phone ?? '');
  const [affiche, setAffiche] = useState(profil?.displayName ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  /**
   * Les champs se REMPLISSENT à l'ouverture, pas à la création.
   *
   * `useState` ne lit sa valeur initiale qu'une fois. La feuille vit dans
   * l'écran et n'est pas démontée entre deux ouvertures : sans cet effet,
   * elle rouvrait sur les valeurs d'avant — ou vide, quand le profil n'était
   * pas encore chargé au premier rendu. On écrivait alors par-dessus ses
   * propres informations sans les voir.
   */
  useEffect(() => {
    if (!visible) return;
    setPrenom(profil?.firstName ?? '');
    setNom(profil?.lastName ?? '');
    setTel(profil?.phone ?? '');
    setAffiche(profil?.displayName ?? '');
    setErreur('');
  }, [visible, profil]);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await apiMettreAJourProfil({
        firstName: prenom.trim(),
        lastName: nom.trim(),
        phone: tel.trim(),
        // Le nom affiché n'est modifiable que depuis le profil : avant une
        // commande, il n'a rien à voir avec ce que Flaix demande, et une
        // question de plus à cet instant fait reculer.
        ...(edition ? { displayName: affiche.trim() } : {}),
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
          <Text style={styles.titre}>
            {edition ? 'Mes informations' : 'Pour commander plus vite'}
          </Text>
          <Text style={styles.sous}>
            {edition
              ? 'Ces informations pré-remplissent tes commandes. Ton adresse e-mail, elle, identifie ton compte et ne se change pas ici.'
              : 'Ces informations sont demandées au moment de payer. Saisies ici une fois, elles seront déjà remplies à chaque commande.'}
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

          {/* Le nom affiché : ce qu'on lit en tête de « Mes commandes ». Il ne
              part pas chez Flaix — d'où sa place ici seulement. */}
          {edition ? (
            <>
              <Text style={styles.label}>Nom affiché</Text>
              <TextInput
                value={affiche}
                onChangeText={setAffiche}
                placeholder="Comment t'appeler dans l'app"
                placeholderTextColor={THEME.grey}
                style={[styles.champ, NO_OUTLINE]}
              />
              <Text style={styles.labelEmail}>Adresse e-mail</Text>
              <Text style={styles.email}>{profil?.email ?? '—'}</Text>
            </>
          ) : null}

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <Pressable
            style={[styles.principal, envoi && styles.principalOccupe]}
            onPress={() => void enregistrer()}
            disabled={envoi}
          >
            {envoi ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.principalTexte}>
                {edition ? 'Enregistrer' : 'Enregistrer et commander'}
              </Text>
            )}
          </Pressable>

          {/* Toujours une sortie : avant une commande, la page Flaix redemandera
              ce qui manque ; depuis le profil, on renonce simplement. */}
          <Pressable onPress={() => onTermine(false)} disabled={envoi} hitSlop={8}>
            <Text style={styles.plusTard}>{edition ? 'Annuler' : 'Plus tard'}</Text>
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
  // L'e-mail se MONTRE sans se modifier : le voir rassure (« c'est bien mon
  // compte »), et son absence ferait chercher où le changer.
  labelEmail: { color: THEME.inkSoft, fontSize: 12.5, fontFamily: FONT.bold, marginTop: 14 },
  email: { color: THEME.grey, fontSize: 14.5, fontFamily: FONT.regular, marginTop: 3 },
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
