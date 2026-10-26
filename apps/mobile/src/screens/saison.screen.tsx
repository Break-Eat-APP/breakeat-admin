import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiGetPublicVenue,
  apiMonProfil,
  type EvenementDeSaison,
  type MonProfil,
  type PublicVenue,
} from '@lib/api/mobile-api';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { cheminDeCommande, heureDOuverture, ouvertALaCommande } from '@lib/ouverture-lieu';
import {
  heureLisible,
  initialesAdversaire,
  libelleAttente,
  libelleDateLongue,
  libelleJour,
  parMois,
} from '@lib/calendrier-saison';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { DemandeCoordonnees } from '@components/demande-coordonnees';
import { THEME, shadowCard, HEAD, FONT } from '@lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Saison'>;

/**
 * LA SAISON D'UN LIEU — le calendrier, et la porte de la commande.
 *
 * Avant cet écran, toucher un lieu envoyait DIRECTEMENT chez Flaix. Deux
 * conséquences, et aucune n'était voulue :
 *
 *  · on quittait Break Eat sans savoir contre qui on jouait, ni même qu'un
 *    match avait lieu ;
 *  · un lieu dont la commande ouvrait plus tard affichait « fermé » trois
 *    heures avant le coup d'envoi, sans dire que ça ouvrirait. Un écran qui
 *    se tait fait partir le client.
 *
 * ── CE QUI DÉCIDE DE LA FORME ─────────────────────────────────────────
 *
 * UN SEUL RUBAN, PAS DE LISTE. Le choix grille/liste a été écarté : une case
 * fait soixante pixels, le nom de l'adversaire n'y tient pas ; élargie, la
 * case devient une ligne, et une suite de lignes est une liste. Les deux
 * idées menaient au même objet. Le ruban sert donc d'INDEX — on y trouve les
 * matchs à l'œil, sans lire une date — et le match touché s'écrit en entier
 * dans la carte du bas, qui a la place du nom, de l'heure et du bouton.
 *
 * LE LIEN DE COMMANDE PART D'UN SEUL ENDROIT : le bouton « Commander » de
 * cette carte. Toucher un blason ne fait que choisir — on ne sort pas de
 * l'app par surprise, et il n'y a qu'un chemin à vérifier le jour où Flaix
 * change quelque chose.
 *
 * L'OPACITÉ DIT LE TEMPS, PAS L'IMPORTANCE. Les matchs joués s'estompent, le
 * cerclage orange dit « la commande est ouverte », le cerclage sombre dit
 * seulement « c'est celui que tu regardes ». Trois états, et pas un quatrième :
 * un ruban où tout est nuancé ne hiérarchise plus rien.
 *
 * ── LE VOCABULAIRE ───────────────────────────────────────────────────
 *
 * Ce qui ouvre ici, c'est LA COMMANDE — jamais les buvettes. Le client
 * commande la veille et retire à la mi-temps : les deux moments n'ont rien à
 * voir. Les CRÉNEAUX DE RETRAIT se règlent dans Flaix et peuvent y changer
 * sans que Break Eat l'apprenne : cet écran ne les annonce jamais.
 */
export function SaisonScreen({ route, navigation }: Props) {
  const { venueId, venueName } = route.params;
  const insets = useSafeAreaInsets();
  const espaceBas = useBottomBarSpace();
  const { coords } = useUserLocation();

  const [lieu, setLieu] = useState<PublicVenue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Le match touché. `null` : on s'en remet au choix par défaut ci-dessous. */
  const [choisi, setChoisi] = useState<string | null>(null);

  // La demande de coordonnées, posée UNE fois avant la première commande
  // Flaix : c'est ce qui évite au client de se reconnecter chez Flaix.
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [demandeOuverte, setDemandeOuverte] = useState(false);

  /**
   * Le lieu se relit À CHAQUE RETOUR sur l'écran, et pas une fois pour toutes.
   *
   * Tout ce qui compte ici change avec l'horloge : la case ouverte, l'heure
   * d'ouverture, le lien du jour. Un client qui laisse l'app ouverte pendant
   * le trajet verrait sinon l'état d'il y a une heure — et toucherait un
   * bouton qui ne marche plus.
   */
  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setLieu(await apiGetPublicVenue(venueId, coords ?? undefined));
    } catch (e: unknown) {
      console.warn('apiGetPublicVenue a échoué:', e);
      setErreur('Impossible de charger ce lieu pour le moment. Réessaie plus tard.');
    } finally {
      setChargement(false);
    }
  }, [venueId, coords]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger]),
  );

  const saison = lieu?.saison ?? [];

  /**
   * SUR QUOI L'ÉCRAN S'OUVRE, sans que personne n'ait touché à rien.
   *
   * Dans l'ordre : le match dont la commande est ouverte — c'est pour lui
   * qu'on est venu ; sinon le prochain ; sinon le dernier joué, pour qu'un
   * lieu en fin de saison ne s'ouvre pas sur une carte vide.
   */
  const parDefaut = useMemo(() => {
    const ouvert = saison.find((m) => m.ouvert);
    if (ouvert) return ouvert.id;
    const prochain = saison.find((m) => !m.passe);
    if (prochain) return prochain.id;
    return saison.length > 0 ? saison[saison.length - 1].id : null;
  }, [saison]);

  // Le choix est VALIDÉ contre la liste du moment : un rechargement qui fait
  // disparaître le match touché (annulé entre-temps) ne doit pas laisser la
  // carte du bas sur un match qui n'existe plus.
  const selectionId = choisi && saison.some((m) => m.id === choisi) ? choisi : parDefaut;
  const selection = saison.find((m) => m.id === selectionId) ?? null;

  const mois = useMemo(() => parMois(saison, new Date()), [saison]);
  const rienAVenir = saison.length > 0 && !saison.some((m) => !m.passe);

  // ── Ouvrir la commande ────────────────────────────────────────────

  const ouvrirFlaix = (url: string) => {
    if (!lieu) return;
    navigation.navigate('FlaixOrder', {
      venueId: lieu.id,
      flaixVenueId: lieu.flaixVenueId,
      url,
      venueName: lieu.name,
    });
  };

  /** Ce que la page de commande va redemander, et qu'on peut lui éviter. */
  const coordonneesManquantes = (p: MonProfil | null) =>
    !p?.phone?.trim() || !p?.firstName?.trim() || !p?.lastName?.trim();

  /**
   * LE SEUL ENDROIT D'OÙ PART UNE COMMANDE.
   *
   * La règle du chemin n'est pas réécrite ici : `cheminDeCommande` la tient,
   * et le serveur a marqué la même case `ouvert` avec la même règle. Deux
   * écritures avaient déjà divergé le 10/10 — un lieu s'annonçait « Ouvert »
   * et refusait au doigt.
   */
  const commander = () => {
    if (!lieu) return;
    const chemin = cheminDeCommande(lieu);

    if (chemin === 'flaix' && lieu.flaixOrderUrl) {
      const url = lieu.flaixOrderUrl;
      // Le lien porte-t-il des coordonnées à pré-remplir ? S'il n'en attend
      // aucune, il n'y a rien à demander : on ouvre.
      const attendUneIdentite = /[?&](firstname|lastname|mail|email|phone|tel)=/i.test(url);
      if (!attendUneIdentite) {
        ouvrirFlaix(url);
        return;
      }

      void (async () => {
        try {
          const p = profil ?? (await apiMonProfil());
          setProfil(p);
          if (coordonneesManquantes(p)) {
            setDemandeOuverte(true);
            return;
          }
        } catch {
          // Profil illisible (réseau) : on n'empêche pas de commander. La page
          // de commande demandera ce qui manque, comme avant.
        }
        ouvrirFlaix(url);
      })();
      return;
    }

    if (chemin === 'evenement' && lieu.currentEventId) {
      navigation.navigate('EventHome', { eventId: lieu.currentEventId });
    }
  };

  // ── Ce que le bandeau annonce ─────────────────────────────────────

  const ouvert = lieu ? ouvertALaCommande(lieu) : false;
  // `heureDOuverture` rend « 08:00 » ; `heureLisible` en fait « 8 h ».
  const ouvreA = lieu ? heureDOuverture(lieu) : null;

  const etatCommande = (): { icone: keyof typeof Ionicons.glyphMap; texte: string } => {
    if (ouvert) return { icone: 'ellipse', texte: 'Commande ouverte' };
    if (ouvreA) return { icone: 'time-outline', texte: `La commande ouvre à ${heureLisible(ouvreA)}` };
    if (lieu?.prochainEvenement) {
      const quand = libelleAttente(lieu.prochainEvenement.startAt, new Date());
      return {
        icone: 'calendar-outline',
        texte: quand
          ? `Prochain match ${quand}`
          : `Prochain match ${libelleDateLongue(lieu.prochainEvenement.startAt)}`,
      };
    }
    return { icone: 'calendar-outline', texte: 'Aucun match programmé' };
  };

  return (
    <View style={styles.root}>
      {/*
        LE BANDEAU, comme sur l'écran des lieux : orange, un seul coin arrondi
        en bas à gauche. Il porte le retour, le nom du lieu, et UNE SEULE
        ligne — l'état de la commande. C'est ce que le supporter lit en
        premier et, le plus souvent, la seule chose qu'il lira.

        Ce qui n'y figure PAS : le nombre de buvettes. Il change d'un match à
        l'autre et ne répond à aucune question qu'on se pose ; il occuperait
        la ligne la plus lue de l'écran pour ne rien dire.
      */}
      <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
        <View style={styles.bandRow}>
          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Lieux'))}
            hitSlop={14}
            style={styles.retour}
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.titre} numberOfLines={1}>
            {lieu?.name ?? venueName}
          </Text>
        </View>

        {chargement ? null : (
          <View style={styles.pastille}>
            <Ionicons
              name={etatCommande().icone}
              size={ouvert ? 9 : 14}
              color={ouvert ? '#fff' : 'rgba(255,255,255,0.9)'}
            />
            <Text style={styles.pastilleTexte} numberOfLines={1}>
              {etatCommande().texte}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: espaceBas }]}
        showsVerticalScrollIndicator={false}
      >
        {chargement ? (
          <View style={styles.centre}>
            <ActivityIndicator color={THEME.orange} />
          </View>
        ) : erreur ? (
          <View style={styles.centre}>
            <Ionicons name="cloud-offline-outline" size={26} color={THEME.grey} />
            <Text style={styles.vide}>{erreur}</Text>
            <Pressable style={styles.reessayer} onPress={() => void charger()}>
              <Text style={styles.reessayerTexte}>Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {mois.map((m) => (
              <View key={m.cle} style={styles.mois}>
                <Text style={styles.moisTitre}>{m.libelle}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.ruban}
                >
                  {m.matchs.map((match) => (
                    <CaseMatch
                      key={match.id}
                      match={match}
                      selectionne={match.id === selectionId}
                      onPress={() => setChoisi(match.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}

            {/*
              RIEN DE PROGRAMMÉ ENCORE — et il faut le dire.

              Un lieu dont la saison n'est pas saisie n'affiche que des matchs
              estompés. Sans cette phrase, l'app a l'air d'avoir perdu la
              suite du calendrier.
            */}
            {rienAVenir ? (
              <Text style={styles.note}>
                Les prochains matchs apparaîtront ici dès que le club les programme.
              </Text>
            ) : null}

            {saison.length === 0 ? (
              <View style={styles.centre}>
                <Ionicons name="calendar-outline" size={26} color={THEME.grey} />
                <Text style={styles.vide}>
                  {ouvert
                    ? 'Ce lieu prend les commandes en continu.'
                    : 'Aucun match programmé sur ce lieu pour l’instant.'}
                </Text>
              </View>
            ) : null}

            {/*
              LA CARTE DU MATCH — ce que la case ne peut pas porter.

              Le nom de l'adversaire, l'heure, et le bouton. C'est ce qui a
              remplacé la vue « liste » : l'information y est au complet, sans
              second écran à maintenir.
            */}
            {selection ? (
              <View style={[styles.carte, shadowCard]}>
                <View style={styles.carteHaut}>
                  <Blason match={selection} taille={44} />
                  <View style={styles.carteTextes}>
                    <Text style={styles.carteNom} numberOfLines={2}>
                      {selection.opponentName ?? selection.name}
                    </Text>
                    <Text style={styles.carteDate} numberOfLines={1}>
                      {libelleDateLongue(selection.startAt)}
                    </Text>
                  </View>
                </View>

                {selection.ouvert ? (
                  <Pressable style={styles.bouton} onPress={commander}>
                    <Text style={styles.boutonTexte}>Commander</Text>
                    <Ionicons name="arrow-forward" size={17} color="#fff" />
                  </Pressable>
                ) : (
                  /*
                    DEUX TONS, ET ILS NE DISENT PAS LA MÊME CHOSE.

                    L'orange annonce quelque chose qui VA ARRIVER — la
                    commande ouvrira à telle heure, il y a une raison de
                    revenir. Un match terminé n'annonce rien : en orange, il
                    attirait l'œil vers la seule ligne de l'écran où il n'y a
                    rien à faire.
                  */
                  <View style={[styles.attente, selection.passe && styles.attenteFinie]}>
                    <Ionicons
                      name={selection.passe ? 'checkmark-done-outline' : 'time-outline'}
                      size={15}
                      color={selection.passe ? THEME.inkSoft : THEME.orangeDark}
                    />
                    <Text
                      style={[styles.attenteTexte, selection.passe && styles.attenteTexteFini]}
                    >
                      {phraseAttente(selection, lieu)}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <DemandeCoordonnees
        visible={demandeOuverte}
        profil={profil}
        onTermine={(enregistre) => {
          setDemandeOuverte(false);
          if (!enregistre) {
            // « Plus tard » : on ouvre avec l'adresse telle quelle.
            if (lieu?.flaixOrderUrl) ouvrirFlaix(lieu.flaixOrderUrl);
            return;
          }
          // Enregistré : le SERVEUR reconstruit l'adresse avec les nouvelles
          // coordonnées, donc on relit le lieu AVANT d'ouvrir — sinon le
          // client saisirait son numéro et la page le redemanderait.
          setProfil(null);
          void (async () => {
            try {
              const frais = await apiGetPublicVenue(venueId, coords ?? undefined);
              setLieu(frais);
              if (frais.flaixOrderUrl) ouvrirFlaix(frais.flaixOrderUrl);
            } catch {
              if (lieu?.flaixOrderUrl) ouvrirFlaix(lieu.flaixOrderUrl);
            }
          })();
        }}
      />
    </View>
  );
}

/**
 * CE QU'ON DIT QUAND LA COMMANDE N'EST PAS OUVERTE.
 *
 * L'heure précise n'est annonçable que sur un lieu FLAIX : là, l'ouverture
 * est une heure fixe réglée sur le lieu (`ordersOpenAt`), la même pour tous
 * ses matchs. Sur un lieu au parcours Break Eat, c'est le club qui active son
 * événement à la main — annoncer « 8 h » y serait une promesse inventée.
 */
function phraseAttente(match: EvenementDeSaison, lieu: PublicVenue | null): string {
  if (match.passe) return 'Match terminé';
  if (lieu?.flaixEnabled) {
    return `La commande ouvre à ${heureLisible(lieu.heureOuvertureCommande)} le jour du match`;
  }
  return 'La commande n’est pas encore ouverte';
}

/** Une case du ruban : le blason, et le jour en dessous. */
function CaseMatch({
  match,
  selectionne,
  onPress,
}: {
  match: EvenementDeSaison;
  selectionne: boolean;
  onPress: () => void;
}) {
  const attente = libelleAttente(match.startAt, new Date());
  // « dans 5 jours » ne tient pas sous une case ; « demain » si.
  const sousTitre = match.ouvert
    ? 'ouvert'
    : attente === "aujourd'hui" || attente === 'demain'
      ? attente
      : libelleJour(match.startAt);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.case, match.passe && styles.casePassee]}
      accessibilityRole="button"
      accessibilityLabel={`${match.opponentName ?? match.name}, ${libelleDateLongue(match.startAt)}`}
      accessibilityState={{ selected: selectionne }}
    >
      <Blason
        match={match}
        taille={48}
        anneau={match.ouvert ? 'ouvert' : selectionne ? 'choisi' : 'aucun'}
      />
      <Text
        style={[styles.caseJour, match.ouvert && styles.caseJourOuvert]}
        numberOfLines={1}
      >
        {sousTitre}
      </Text>
    </Pressable>
  );
}

/**
 * LE BLASON DE L'ADVERSAIRE — ou ses initiales.
 *
 * Un calendrier sans blason reste utile ; un calendrier dont les blasons
 * manquent à moitié est pire que pas de blason. D'où le repli : un disque
 * sourd portant les initiales, jamais un trou ni une image cassée.
 *
 * `contain` et non `cover` : un écusson recadré perd son contour, et c'est le
 * contour qui le rend reconnaissable.
 */
function Blason({
  match,
  taille,
  anneau = 'aucun',
}: {
  match: EvenementDeSaison;
  taille: number;
  anneau?: 'ouvert' | 'choisi' | 'aucun';
}) {
  const logo = match.opponentLogoUrl?.trim();
  const cadre = {
    width: taille,
    height: taille,
    borderRadius: taille / 2,
    borderWidth: anneau === 'aucun' ? 1 : 2,
    borderColor:
      anneau === 'ouvert' ? THEME.orange : anneau === 'choisi' ? THEME.ink : THEME.border,
  };

  if (logo) {
    return (
      <View style={[styles.blason, cadre]}>
        <Image
          source={{ uri: logo }}
          style={{ width: taille * 0.72, height: taille * 0.72 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <View style={[styles.blason, styles.blasonVide, cadre]}>
      <Text style={[styles.initiales, { fontSize: taille * 0.3 }]}>
        {initialesAdversaire(match.opponentName, match.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  scroll: { paddingTop: 16 },

  band: {
    backgroundColor: THEME.orange,
    paddingBottom: 16,
    paddingHorizontal: 12,
    borderBottomLeftRadius: 26,
  },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retour: { padding: 4, borderRadius: 8 },
  /**
   * `minWidth: 0` N'EST PAS DÉCORATIF.
   *
   * Sans lui, un nom long — « Parc des Sports Marcel-Michelin B » — pousse la
   * rangée plus large que l'écran sur react-native-web : le bandeau orange
   * s'arrête avant le bord droit, et toute la page défile de travers. C'est
   * le web qui sert l'app aux clients sans installation, donc ça se voit.
   */
  titre: {
    flex: 1,
    minWidth: 0,
    color: '#fff',
    fontSize: 18,
    fontFamily: HEAD.bold,
    paddingRight: 8,
  },

  pastille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    marginTop: 12,
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  pastilleTexte: { color: '#fff', fontSize: 13, fontFamily: HEAD.semibold },

  mois: { marginBottom: 18 },
  moisTitre: {
    color: THEME.inkSoft,
    fontSize: 12.5,
    fontFamily: HEAD.semibold,
    marginLeft: 18,
    marginBottom: 10,
  },
  ruban: { paddingHorizontal: 16, gap: 10 },

  case: { width: 62, alignItems: 'center' },
  // L'opacité dit le TEMPS : le match est joué, il s'efface.
  casePassee: { opacity: 0.4 },
  caseJour: {
    marginTop: 7,
    fontSize: 11,
    color: THEME.inkSoft,
    fontFamily: FONT.medium,
    textAlign: 'center',
  },
  caseJourOuvert: { color: THEME.orange, fontFamily: FONT.bold },

  blason: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
    overflow: 'hidden',
  },
  blasonVide: { backgroundColor: THEME.bgSubtle },
  initiales: { color: THEME.inkSoft, fontFamily: HEAD.bold },

  carte: {
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    marginHorizontal: 16,
    marginTop: 4,
    padding: 15,
  },
  carteHaut: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  carteTextes: { flex: 1 },
  carteNom: { color: THEME.ink, fontSize: 16, fontFamily: HEAD.bold },
  carteDate: { color: THEME.inkSoft, fontSize: 12.5, fontFamily: FONT.medium, marginTop: 3 },

  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: THEME.orange,
    borderRadius: THEME.radius.control,
    paddingVertical: 14,
  },
  boutonTexte: { color: '#fff', fontSize: 15, fontFamily: HEAD.bold },

  attente: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    backgroundColor: THEME.orangeTint,
    borderRadius: THEME.radius.control,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  attenteFinie: { backgroundColor: THEME.bgSubtle },
  attenteTexte: {
    color: THEME.orangeDark,
    fontSize: 12.5,
    fontFamily: FONT.medium,
    flexShrink: 1,
  },
  attenteTexteFini: { color: THEME.inkSoft },

  note: {
    color: THEME.grey,
    fontSize: 12.5,
    fontFamily: FONT.regular,
    lineHeight: 18,
    marginHorizontal: 18,
    marginBottom: 18,
  },

  centre: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 32 },
  vide: {
    color: THEME.inkSoft,
    fontSize: 13.5,
    fontFamily: FONT.medium,
    textAlign: 'center',
    lineHeight: 19,
  },
  reessayer: {
    marginTop: 4,
    backgroundColor: THEME.orangeTint,
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  reessayerTexte: { color: THEME.orange, fontSize: 13.5, fontFamily: HEAD.bold },
});
