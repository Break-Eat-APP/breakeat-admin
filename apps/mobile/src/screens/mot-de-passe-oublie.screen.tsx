import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiConfirmerReinitialisation,
  apiDemanderReinitialisation,
} from '@lib/api/mobile-api';
import { messageServeur } from '@lib/message-serveur';
import { showAlert } from '@lib/alert';
import { THEME, shadowCard, HEAD } from '@lib/theme';
import { PageHeader } from '@components/page-header';

/**
 * « MOT DE PASSE OUBLIÉ » — le parcours qui n'existait pas.
 *
 * Le lien de l'écran de connexion affichait « Réinitialisation du mot de passe
 * à venir ». Un client qui perdait son mot de passe perdait son compte : son
 * historique, ses points de fidélité, ses lieux favoris. Son seul recours
 * était de s'inscrire avec une autre adresse.
 *
 * ── UN CODE À SIX CHIFFRES, ET PAS UN LIEN ─────────────────────
 *
 * Un lien cliquable dans un courriel devrait rouvrir l'application : liens
 * universels à déclarer chez Apple et chez Google, ou page web de repli à
 * écrire et à héberger. Un code se tape ici, dans l'écran où le client se
 * trouve déjà, et marche depuis n'importe quelle messagerie — y compris un
 * webmail ouvert sur l'ordinateur d'à côté.
 *
 * ── DEUX ÉTAPES DANS UN SEUL ÉCRAN ─────────────────────────────
 *
 * L'adresse reste visible à la seconde étape, et c'est voulu : le client vient
 * de la taper, il doit pouvoir vérifier qu'il n'a pas demandé un code pour une
 * autre boîte que celle qu'il va ouvrir. Deux écrans séparés l'auraient caché.
 *
 * ── CE QUE L'ÉCRAN NE DIT JAMAIS ───────────────────────────────
 *
 * Le serveur répond la même chose que l'adresse existe ou non — cette route ne
 * doit pas servir d'annuaire. L'écran suit : il annonce « si un compte existe,
 * un code vient de partir », et ne cherche pas à être plus précis qu'il ne
 * peut l'être.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'MotDePasseOublie'>;

export function MotDePasseOublieScreen({ navigation }: Props) {
  const [etape, setEtape] = useState<'adresse' | 'code'>('adresse');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const demander = async () => {
    const adresse = email.trim();
    if (!adresse.includes('@')) {
      setErreur('Indiquez votre adresse e-mail.');
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      await apiDemanderReinitialisation(adresse);
      setEtape('code');
    } catch (e) {
      setErreur(messageServeur(e, 'Demande impossible. Réessayez dans un instant.'));
    } finally {
      setEnvoi(false);
    }
  };

  const confirmer = async () => {
    const chiffres = code.trim();
    if (!/^\d{6}$/.test(chiffres)) {
      setErreur('Le code comporte six chiffres.');
      return;
    }
    if (motDePasse.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setEnvoi(true);
    setErreur('');
    try {
      await apiConfirmerReinitialisation({
        email: email.trim(),
        code: chiffres,
        nouveauMotDePasse: motDePasse,
      });
      /**
       * ON NE CONNECTE PAS AUTOMATIQUEMENT.
       *
       * Le serveur a fermé toutes les sessions — c'est le but : on reprend un
       * compte souvent parce qu'un autre l'avait pris. Le client retourne donc
       * à la connexion et tape son nouveau mot de passe : c'est la seule façon
       * de vérifier qu'il l'a bien noté, pendant qu'il peut encore le changer.
       */
      showAlert('Mot de passe modifié', 'Connectez-vous avec votre nouveau mot de passe.');
      navigation.goBack();
    } catch (e) {
      setErreur(messageServeur(e, 'Code invalide ou expiré. Demandez-en un nouveau.'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <View style={styles.page}>
      <PageHeader title="Mot de passe oublié" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled">
          {etape === 'adresse' ? (
            <>
              <Text style={styles.explication}>
                Indiquez l’adresse de votre compte. Si un compte existe, un code à six chiffres
                vous y sera envoyé.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Adresse e-mail"
                placeholderTextColor={THEME.grey}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
              />

              {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

              <Pressable
                style={[styles.bouton, envoi && styles.boutonInactif]}
                onPress={demander}
                disabled={envoi}
              >
                {envoi ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.boutonTexte}>Envoyer le code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {/* L'ADRESSE RESTE VISIBLE : le client doit pouvoir vérifier
                  qu'il ouvre la bonne boîte, et se corriger si ce n'est pas
                  celle-là. */}
              <Text style={styles.explication}>
                Un code à six chiffres vient de partir vers{' '}
                <Text style={styles.adresse}>{email.trim()}</Text>, s’il existe un compte à cette
                adresse. Il est valable 15 minutes.
              </Text>

              <TextInput
                style={[styles.input, styles.inputCode]}
                placeholder="000000"
                placeholderTextColor={THEME.grey}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />

              <View style={styles.champMotDePasse}>
                <TextInput
                  style={styles.inputMotDePasse}
                  placeholder="Nouveau mot de passe (8 caractères minimum)"
                  placeholderTextColor={THEME.grey}
                  value={motDePasse}
                  onChangeText={setMotDePasse}
                  secureTextEntry={!visible}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8}>
                  <Ionicons
                    name={visible ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={THEME.grey}
                  />
                </Pressable>
              </View>

              {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

              <Pressable
                style={[styles.bouton, envoi && styles.boutonInactif]}
                onPress={confirmer}
                disabled={envoi}
              >
                {envoi ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.boutonTexte}>Changer le mot de passe</Text>
                )}
              </Pressable>

              {/* Revenir en arrière plutôt que renvoyer un code depuis ici :
                  une nouvelle demande ANNULE le code précédent, et un client
                  qui appuie deux fois se retrouverait avec un code mort dans
                  sa boîte et un autre en route. L'étape d'avant le dit. */}
              <Pressable style={styles.retour} onPress={() => setEtape('adresse')} hitSlop={6}>
                <Text style={styles.retourTexte}>Changer d’adresse ou demander un autre code</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: THEME.bg },
  flex: { flex: 1 },
  corps: { padding: 20, gap: 14 },
  explication: { color: THEME.inkSoft, fontSize: 14, lineHeight: 21 },
  adresse: { color: THEME.ink, fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: THEME.ink,
    ...shadowCard,
  },
  inputCode: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  champMotDePasse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    ...shadowCard,
  },
  inputMotDePasse: { flex: 1, paddingVertical: 14, fontSize: 15, color: THEME.ink },
  erreur: { color: '#b91c1c', fontSize: 13, lineHeight: 19 },
  bouton: {
    backgroundColor: THEME.orange,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  boutonInactif: { opacity: 0.6 },
  boutonTexte: { color: '#fff', fontSize: 16, ...HEAD },
  retour: { alignItems: 'center', paddingVertical: 10 },
  retourTexte: { color: THEME.orange, fontSize: 13, textDecorationLine: 'underline' },
});
