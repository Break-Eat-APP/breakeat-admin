import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { partagerLApplication } from '@lib/partage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { useAuthStore } from '@store/auth.store';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { PageHeader } from '@components/page-header';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { showAlert, confirmAction } from '@lib/alert';
import { DemandeCoordonnees } from '@components/demande-coordonnees';
import { apiMonProfil, apiSupprimerMonCompte, type MonProfil } from '@lib/api/mobile-api';
import { messageServeur } from '@lib/message-serveur';
import {
  demanderNotifs,
  lireEtatNotifs,
  ouvrirReglagesNotifs,
  type EtatNotifs,
} from '@lib/permission-notifs';
import { THEME, shadowCard, FONT } from '@lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  // Espace sous le contenu : la barre flottante ne doit rien recouvrir.
  // Calcule a l'execution car il depend de la zone sure de l'appareil.
  const espaceBas = useBottomBarSpace();
  const navigation = useNavigation<Nav>();
  const { user, token, clearAuth } = useAuthStore();
  const { status: locStatus, optedOut, request: requestLocation, disable: disableLocation } = useUserLocation();

  /**
   * LE PROFIL COMPLET, lu au serveur.
   *
   * Le compte gardé en mémoire ne retient que l'e-mail et le nom affiché. Le
   * prénom, le nom et le téléphone — ceux qui partent chez Flaix — n'y sont
   * pas : il faut les demander pour pouvoir les montrer, et donc les corriger.
   */
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [editionOuverte, setEditionOuverte] = useState(false);

  const chargerProfil = useCallback(async () => {
    if (!token) return;
    try {
      setProfil(await apiMonProfil());
    } catch (e: unknown) {
      // Information secondaire : son absence ne doit pas vider l'écran. On
      // ouvrira simplement la feuille sur des champs vides.
      console.warn('apiMonProfil a échoué:', e);
    }
  }, [token]);

  useEffect(() => {
    void chargerProfil();
  }, [chargerProfil]);

  /**
   * SUPPRIMER SON COMPTE — irréversible, et dit comme tel.
   *
   * Exigé par Apple (règle 5.1.1(v)) : une app qui permet de créer un compte
   * doit permettre de le supprimer DANS l'app. Il n'y avait aucun moyen de le
   * faire, nulle part.
   *
   * DEUX confirmations, et c'est délibéré. Apple autorise expressément les
   * étapes de confirmation, et ce geste est atteint d'un seul doigt depuis un
   * menu qu'on parcourt distraitement. La première explique ce qui part et ce
   * qui reste ; la seconde ne demande plus qu'un oui franc.
   *
   * Le second message dit que les COMMANDES RESTENT : le client y a droit
   * avant de décider, et il le découvrirait autrement en rouvrant un reçu.
   */
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const handleSupprimerCompte = () => {
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
                await clearAuth();
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login', params: { defaultTab: 'login' } }],
                });
              })
              .catch((e: unknown) => {
                // Un refus du serveur est ACTIONNABLE — « vous êtes le dernier
                // administrateur de tel club ». C'est sa phrase qu'il faut
                // montrer, pas un « erreur » générique.
                showAlert(
                  'Suppression impossible',
                  messageServeur(e, 'Réessaie dans un instant.'),
                );
              })
              .finally(() => setSuppressionEnCours(false));
          },
          { confirmLabel: 'Supprimer définitivement', destructive: true },
        );
      },
      { confirmLabel: 'Continuer', destructive: true },
    );
  };

  const handleLogout = () => {
    confirmAction(
      'Déconnexion',
      'Voulez-vous vraiment vous déconnecter ?',
      () => {
        void clearAuth();
        navigation.reset({ index: 0, routes: [{ name: 'Login', params: { defaultTab: 'login' } }] });
      },
      { confirmLabel: 'Se déconnecter', destructive: true },
    );
  };

  return (
    <View style={styles.root}>
      <PageHeader title="Profil" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: espaceBas }]}>

      {token && user ? (
        <View style={[styles.card, shadowCard]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profil?.displayName ?? user.displayName ?? user.email).charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{profil?.displayName ?? user.displayName}</Text>
          <Text style={styles.email}>{user.email}</Text>

          {/*
            CE QUI PART CHEZ FLAIX, affiché tel quel.

            Un client ne corrige que ce qu'il VOIT. Annoncer « Mes
            informations » sans montrer leur état obligerait à ouvrir la
            feuille pour savoir s'il y a quelque chose à corriger — et la
            ligne manquante est justement celle qu'on oublie.
          */}
          <View style={styles.infos}>
            <Ligne libelle="Prénom" valeur={profil?.firstName} />
            <Ligne libelle="Nom" valeur={profil?.lastName} />
            <Ligne libelle="Téléphone" valeur={profil?.phone} />
          </View>

          <Pressable style={styles.modifier} onPress={() => setEditionOuverte(true)}>
            <Ionicons name="create-outline" size={16} color={THEME.orange} />
            <Text style={styles.modifierTexte}>Modifier mes informations</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, shadowCard]}>
          <Text style={styles.guestTitle}>Vous n'êtes pas connecté</Text>
          <Text style={styles.guestSub}>
            Connectez-vous pour retrouver vos commandes et aller plus vite au paiement.
          </Text>
          <Pressable style={styles.cta} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.ctaText}>Se connecter / S'inscrire</Text>
          </Pressable>
        </View>
      )}

      {/* Liens secondaires */}
      <View style={[styles.menu, shadowCard]}>
        <LocationMenuItem
          locStatus={locStatus}
          optedOut={optedOut}
          onEnable={requestLocation}
          onDisable={disableLocation}
        />
        <View style={styles.divider} />
        <NotificationsMenuItem />
        <View style={styles.divider} />
        {token ? (
          <>
            <MenuItem
              label="Mes informations"
              icon="person-outline"
              onPress={() => setEditionOuverte(true)}
            />
            <View style={styles.divider} />
          </>
        ) : null}
        <MenuItem label="Aide & contact" onPress={() => navigation.navigate('Aide')} />
        <View style={styles.divider} />
        {/* Le partage : la feuille du système porte déjà WhatsApp, iMessage et
            le reste. Rien à intégrer, et le client retrouve l'application qu'il
            utilise tous les jours. */}
        <MenuItem label="Inviter un ami" onPress={() => void partagerLApplication()} />
        <View style={styles.divider} />
        <MenuItem label="Mentions légales" onPress={() => showAlert('Bientôt', 'Disponible prochainement.')} />
        <View style={styles.divider} />
        <MenuItem label="Confidentialité" onPress={() => showAlert('Bientôt', 'Disponible prochainement.')} />
      </View>

        {token && (
          <>
            <Pressable style={styles.logout} onPress={handleLogout}>
              <Text style={styles.logoutText}>Se déconnecter</Text>
            </Pressable>

            {/* En bas, et en rouge : il doit se TROUVER — Apple demande qu'il
                soit facile à repérer — sans pour autant côtoyer la
                déconnexion, dont il n'est pas la variante. */}
            <Pressable
              style={styles.supprimer}
              onPress={handleSupprimerCompte}
              disabled={suppressionEnCours}
            >
              <Text style={styles.supprimerTexte}>
                {suppressionEnCours ? 'Suppression…' : 'Supprimer mon compte'}
              </Text>
            </Pressable>
            <Text style={styles.supprimerNote}>
              Définitif. Tes commandes passées restent dans la comptabilité des clubs,
              sans ton nom.
            </Text>
          </>
        )}
      </ScrollView>

      {/* La MÊME feuille qu'avant une commande, en mode édition : un second
          formulaire aurait divergé du premier à la première correction. */}
      <DemandeCoordonnees
        visible={editionOuverte}
        profil={profil}
        mode="profil"
        onTermine={(enregistre) => {
          setEditionOuverte(false);
          // On relit plutôt que de recopier la saisie : le serveur normalise
          // (espaces, casse) et c'est SA version qui fait foi.
          if (enregistre) void chargerProfil();
        }}
      />
    </View>
  );
}

/** Une information du compte, ou le mot qui dit qu'elle manque. */
function Ligne({ libelle, valeur }: { libelle: string; valeur?: string | null }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLibelle}>{libelle}</Text>
      <Text style={[styles.ligneValeur, !valeur && styles.ligneVide]} numberOfLines={1}>
        {valeur || 'À compléter'}
      </Text>
    </View>
  );
}

function MenuItem({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={onPress}
    >
      {icon ? (
        <View style={styles.menuRow}>
          <Ionicons name={icon} size={18} color={THEME.ink} style={styles.menuIcon} />
          <Text style={styles.menuLabel}>{label}</Text>
        </View>
      ) : (
        <Text style={styles.menuLabel}>{label}</Text>
      )}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/**
 * L'ENTRÉE « NOTIFICATIONS » DU MENU.
 *
 * Elle annonçait « Notifications indisponibles » sur tous les iPhone : elle
 * interrogeait `globalThis.Notification`, l'API du NAVIGATEUR, absente de
 * React Native. L'état vient désormais de `lib/permission-notifs`, qui
 * demande à `expo-notifications` en natif et au navigateur sur le web — les
 * deux mondes où cette app est livrée.
 *
 * Et activer ici ENREGISTRE le jeton : une permission accordée sans jeton
 * donnait un client persuadé d'être abonné, qui ne recevait rien.
 */
function NotificationsMenuItem() {
  const [etat, setEtat] = useState<EtatNotifs>('a-demander');
  const [occupe, setOccupe] = useState(false);

  // La lecture est ASYNCHRONE en natif : elle ne peut pas servir de valeur
  // initiale. On part donc de « à demander » et on corrige dès la réponse.
  useEffect(() => {
    let vivant = true;
    void lireEtatNotifs().then((e) => {
      if (vivant) setEtat(e);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const active = etat === 'accordee';

  const label =
    active            ? 'Notifications activées' :
    etat === 'refusee' ? 'Notifications refusées' :
    etat === 'indisponible' ? 'Notifications indisponibles sur cet appareil' :
    'Activer les notifications';

  const handlePress = () => {
    if (active || occupe) return;

    if (etat === 'indisponible') {
      showAlert(
        'Notifications',
        Platform.OS === 'web'
          ? "Ce navigateur ne sait pas afficher de notifications."
          : "Les notifications demandent un vrai téléphone : un simulateur n'en reçoit aucune.",
      );
      return;
    }

    if (etat === 'refusee') {
      // iOS ne represente jamais sa demande une fois refusée. On emmène donc
      // le client là où il peut revenir dessus, au lieu de lui décrire un
      // cadenas de navigateur qui n'existe pas sur son téléphone.
      confirmAction(
        'Notifications refusées',
        'Elles se réactivent depuis les réglages de ton téléphone, à la ligne Break Eat.',
        () => {
          void ouvrirReglagesNotifs().then((ouvert) => {
            if (!ouvert) {
              showAlert(
                'Réglages',
                "Ouvre Réglages › Break Eat › Notifications pour les réactiver.",
              );
            }
          });
        },
        { confirmLabel: 'Ouvrir les réglages' },
      );
      return;
    }

    setOccupe(true);
    void demanderNotifs()
      .then(setEtat)
      .finally(() => setOccupe(false));
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.menuRow}>
        <Ionicons
          name={active ? 'notifications' : 'notifications-outline'}
          size={18}
          color={active ? THEME.orange : THEME.ink}
          style={styles.menuIcon}
        />
        <Text style={[styles.menuLabel, active && styles.menuLabelActive]} numberOfLines={1}>
          {occupe ? 'Activation…' : label}
        </Text>
      </View>
      {active ? (
        <Ionicons name="checkmark-circle" size={18} color={THEME.orange} />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

type LocStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

function LocationMenuItem({
  locStatus,
  optedOut,
  onEnable,
  onDisable,
}: {
  locStatus: LocStatus;
  optedOut: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  // « Active » = position obtenue ET non coupée par l'utilisateur.
  const active = locStatus === 'granted' && !optedOut;
  const label =
    active                     ? 'Localisation activée' :
    locStatus === 'requesting' ? 'Localisation en cours…' :
    locStatus === 'denied'     ? 'Localisation bloquée' :
    optedOut                   ? 'Localisation désactivée' :
    'Gestion de ma géolocalisation';

  const handlePress = () => {
    if (active) {
      // Bascule OFF (côté app).
      onDisable();
      return;
    }
    // OFF → ON : demande la position (affiche l'aide si le navigateur bloque).
    onEnable();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.menuRow}>
        <Ionicons
          name={active ? 'location' : 'location-outline'}
          size={18}
          color={active ? THEME.orange : THEME.ink}
          style={styles.menuIcon}
        />
        <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>{label}</Text>
      </View>
      {active ? (
        <View style={styles.toggleOn}>
          <Text style={styles.toggleOnText}>Désactiver</Text>
        </View>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { padding: 16 },

  card: {
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 30, fontFamily: FONT.bold },
  name: { color: THEME.ink, fontSize: 18, fontFamily: FONT.bold },
  email: { color: THEME.inkSoft, fontSize: 14, marginTop: 2 },

  infos: {
    alignSelf: 'stretch',
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 6,
  },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 9,
  },
  ligneLibelle: { color: THEME.inkSoft, fontSize: 13.5, fontFamily: FONT.regular },
  ligneValeur: { color: THEME.ink, fontSize: 14, fontFamily: FONT.semibold, flexShrink: 1 },
  // « À compléter » se lit comme une invitation, pas comme une valeur : il
  // garde la couleur sourde des libellés et renonce au gras.
  ligneVide: { color: THEME.grey, fontFamily: FONT.regular },
  modifier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.orangeTint,
  },
  modifierTexte: { color: THEME.orange, fontSize: 14, fontFamily: FONT.semibold },

  guestTitle: { color: THEME.ink, fontSize: 16, fontFamily: FONT.bold, marginBottom: 6 },
  guestSub: { color: THEME.inkSoft, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  cta: {
    backgroundColor: THEME.orange,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: THEME.radius.control,
  },
  ctaText: { color: '#fff', fontFamily: FONT.bold, fontSize: 15 },

  menu: { backgroundColor: THEME.surface, borderRadius: THEME.radius.card, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  pressed: { opacity: 0.6 },
  menuLabel: { color: THEME.ink, fontSize: 15 },
  menuLabelActive: { color: THEME.orange },
  toggleOn: {
    backgroundColor: THEME.orangeTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.pill,
  },
  toggleOnText: { color: THEME.orange, fontSize: 13, fontFamily: FONT.semibold },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { marginRight: 10 },
  chevron: { color: THEME.grey, fontSize: 22 },
  divider: { height: 1, backgroundColor: THEME.border, marginLeft: 18 },

  logout: { alignItems: 'center', paddingVertical: 18, marginTop: 8 },
  logoutText: { color: THEME.orange, fontSize: 15, fontFamily: FONT.semibold },

  supprimer: { alignItems: 'center', paddingVertical: 12 },
  // Rouge, mais SANS fond plein : un bouton rouge massif en bas d'un menu
  // attire le doigt. On veut qu'il se trouve, pas qu'il se propose.
  supprimerTexte: { color: '#b91c1c', fontSize: 14.5, fontFamily: FONT.semibold },
  supprimerNote: {
    color: THEME.grey,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 2,
  },
});
