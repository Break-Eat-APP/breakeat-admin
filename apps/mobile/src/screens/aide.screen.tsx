import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { THEME } from '@lib/theme';
import { PageHeader } from '@components/page-header';
import { useAuthStore } from '@store/auth.store';
import { showAlert, confirmAction } from '@lib/alert';
import { apiSupprimerMonCompte } from '@lib/api/mobile-api';
import { messageServeur } from '@lib/message-serveur';

type Props = NativeStackScreenProps<RootStackParamList, 'Aide'>;

/**
 * L'adresse du service client — confirmée le 19/09/2026.
 *
 * Isolée ici pour n'avoir qu'une ligne à changer le jour venu. Et à ne jamais
 * changer à la légère : une adresse fausse est pire que pas de bouton du tout.
 * Le client croit avoir écrit, personne ne reçoit rien, et il attend une
 * réponse qui ne viendra jamais.
 */
const ADRESSE_SUPPORT = 'contact@breakeatapp.com';

/**
 * Les motifs, et pourquoi ils existent.
 *
 * Un message qui commence par « ça ne marche pas » coûte deux allers-retours
 * avant de pouvoir être traité. Le motif oriente la réponse dès la première
 * lecture, et le corps pré-rempli rappelle au client ce qu'on aura besoin de
 * savoir.
 */
const MOTIFS: { cle: string; titre: string; icone: keyof typeof Ionicons.glyphMap; amorce: string }[] =
  [
    {
      cle: 'commande',
      titre: 'Un problème avec une commande',
      icone: 'bag-handle-outline',
      amorce:
        'Numéro de commande :\nLieu et buvette :\nCe qui s’est passé :\n\n(vous le trouvez dans « Mes commandes »)',
    },
    {
      cle: 'paiement',
      titre: 'Un problème de paiement',
      icone: 'card-outline',
      amorce:
        'Numéro de commande :\nMontant concerné :\nCe qui s’est passé :\n\n(si vous avez été débité sans recevoir de commande, précisez-le : c’est traité en priorité)',
    },
    {
      cle: 'compte',
      titre: 'Mon compte',
      icone: 'person-outline',
      amorce: 'Ce que vous souhaitez (modification, suppression, autre) :\n',
    },
    {
      cle: 'autre',
      titre: 'Autre chose',
      icone: 'chatbubble-ellipses-outline',
      amorce: 'Votre message :\n',
    },
  ];

export function AideScreen({ navigation }: Props) {
  /**
   * SUPPRIMER SON COMPTE — ici plutôt que sous la déconnexion.
   *
   * Déplacé depuis le profil le 23/10. Les deux boutons s'y touchaient, et
   * seule la couleur les distinguait : l'un ferme une session, l'autre efface
   * un compte. Un geste irréversible ne doit pas être le voisin immédiat d'un
   * geste quotidien.
   *
   * Apple demande que la suppression soit FACILE À TROUVER (règle 5.1.1(v)).
   * « Aide & contact » reste une destination évidente pour qui cherche à
   * régler un problème de compte, et la section porte son propre titre.
   *
   * DEUX confirmations, comme avant : Apple les autorise expressément, et ce
   * geste s'atteint d'un seul doigt depuis un écran qu'on parcourt.
   */
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const supprimerCompte = () => {
    confirmAction(
      'Supprimer mon compte',
      'Ton nom, ton adresse e-mail, ton téléphone et tes connexions seront effacés, ' +
        'et tu seras déconnecté.\n\n' +
        'Tes commandes passées restent dans la comptabilité des clubs, sans ton nom : ' +
        'elles ne peuvent pas être effacées sans fausser leurs comptes.',
      () => {
        confirmAction(
          'Confirmer la suppression',
          'Cette action est définitive. Tu pourras te réinscrire, mais tu repartiras ' +
            'd’un compte vide : ni historique, ni points de fidélité.',
          () => {
            setSuppressionEnCours(true);
            void apiSupprimerMonCompte()
              .then(async () => {
                await useAuthStore.getState().clearAuth();
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login', params: { defaultTab: 'login' } }],
                });
              })
              .catch((e: unknown) => {
                // Un refus du serveur est ACTIONNABLE — « vous êtes le dernier
                // administrateur de tel club ». C'est sa phrase qu'il faut montrer.
                showAlert('Suppression impossible', messageServeur(e, 'Réessaie dans un instant.'));
              })
              .finally(() => setSuppressionEnCours(false));
          },
          { confirmLabel: 'Supprimer définitivement', destructive: true },
        );
      },
      { confirmLabel: 'Continuer', destructive: true },
    );
  };

  const { user } = useAuthStore();

  /**
   * Ouvre l'application de messagerie avec un message déjà préparé.
   *
   * Le pied de message porte le compte, la plateforme et la version : sans eux,
   * chaque échange commence par « quel compte ? quelle version ? », et une
   * réponse qui pouvait tenir en un message en demande trois.
   */
  const ecrire = async (motif: (typeof MOTIFS)[number]) => {
    const pied = [
      '',
      '—',
      `Compte : ${user?.email ?? 'non connecté'}`,
      `Appareil : ${Platform.OS} ${Platform.Version}`,
      'Application : Break Eat 1.1.0',
    ].join('\n');

    const adresse =
      `mailto:${ADRESSE_SUPPORT}` +
      `?subject=${encodeURIComponent(`Break Eat — ${motif.titre}`)}` +
      `&body=${encodeURIComponent(`${motif.amorce}${pied}`)}`;

    try {
      const possible = await Linking.canOpenURL(adresse);
      if (!possible) throw new Error('aucune application de messagerie');
      await Linking.openURL(adresse);
    } catch {
      // Aucune messagerie configurée : on ne laisse pas le client sans issue,
      // on lui donne l'adresse à recopier.
      showAlert(
        'Aucune messagerie configurée',
        `Écrivez-nous à ${ADRESSE_SUPPORT} en précisant « ${motif.titre} ».`,
      );
    }
  };

  return (
    <View style={styles.root}>
      <PageHeader title="Aide & contact" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.contenu} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Un souci avec une commande, un paiement, votre compte ? Choisissez ce qui s’en approche le
          plus : le message part avec les informations dont nous avons besoin pour vous répondre
          vite.
        </Text>

        <View style={styles.liste}>
          {MOTIFS.map((motif, index) => (
            <React.Fragment key={motif.cle}>
              {index > 0 ? <View style={styles.separateur} /> : null}
              <Pressable
                style={({ pressed }) => [styles.ligne, pressed && styles.pressee]}
                onPress={() => void ecrire(motif)}
              >
                <Ionicons name={motif.icone} size={19} color={THEME.orange} />
                <Text style={styles.ligneTexte}>{motif.titre}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.pied}>
          Vous pouvez aussi écrire directement à {ADRESSE_SUPPORT}. Pour un problème survenu au
          comptoir pendant un événement, le plus rapide reste de vous adresser au stand : l’équipe a
          votre commande sous les yeux.
        </Text>

        {/* MON COMPTE — sa propre section, séparée des motifs de contact :
            supprimer son compte n'est pas écrire au support. */}
        <Text style={styles.titreSection}>Mon compte</Text>
        <View style={styles.liste}>
          <Pressable
            style={({ pressed }) => [styles.ligne, pressed && styles.pressee]}
            onPress={supprimerCompte}
            disabled={suppressionEnCours}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={19} color={DANGER} />
            <Text style={[styles.ligneTexte, { color: DANGER }]}>
              {suppressionEnCours ? 'Suppression…' : 'Supprimer mon compte'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
        <Text style={styles.noteSuppression}>
          Définitif. Tes commandes passées restent dans la comptabilité des clubs, sans ton
          nom : la loi impose de conserver les pièces comptables.
        </Text>
      </ScrollView>
    </View>
  );
}

/** Le rouge des gestes irréversibles. Jamais utilisé ailleurs dans l'écran. */
const DANGER = '#b91c1c';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  titreSection: {
    color: THEME.inkSoft,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  noteSuppression: { color: THEME.grey, fontSize: 12, lineHeight: 17 },
  contenu: { padding: 20, gap: 18 },
  intro: { color: THEME.inkSoft, fontSize: 14, lineHeight: 20 },
  liste: {
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    borderWidth: 1,
    borderColor: THEME.border,
    overflow: 'hidden',
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  pressee: { backgroundColor: THEME.bgSubtle },
  ligneTexte: { flex: 1, color: THEME.ink, fontSize: 15, fontWeight: '600' },
  chevron: { color: THEME.grey, fontSize: 20 },
  separateur: { height: 1, backgroundColor: THEME.border, marginLeft: 47 },
  pied: { color: THEME.grey, fontSize: 12.5, lineHeight: 18 },
});
