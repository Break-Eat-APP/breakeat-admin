import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { THEME } from '@lib/theme';
import { PageHeader } from '@components/page-header';
import { useAuthStore } from '@store/auth.store';
import { showAlert } from '@lib/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'Aide'>;

/**
 * ⚠️ L'ADRESSE DU SERVICE CLIENT — à confirmer avant la mise en ligne.
 *
 * Une adresse fausse est pire que pas de bouton du tout : le client croit avoir
 * écrit, personne ne reçoit rien, et il attend une réponse qui ne viendra
 * jamais. Elle est isolée ici pour n'avoir qu'une ligne à changer.
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
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
