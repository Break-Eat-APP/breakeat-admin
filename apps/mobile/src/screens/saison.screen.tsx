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
  apiDestinationDeCommande,
  apiGetPublicVenue,
  apiMonProfil,
  type EvenementDeSaison,
  type MonProfil,
  type PublicVenue,
} from '@lib/api/mobile-api';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { showAlert } from '@lib/alert';
import { heureDOuverture, ouvertALaCommande } from '@lib/ouverture-lieu';
import {
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
  /** Le match qu'on allait ouvrir quand la demande de coordonnées a surgi. */
  const [matchEnAttente, setMatchEnAttente] = useState<string | null>(null);
  /** Le temps d'aller demander la destination : le bouton ne doit pas partir deux fois. */
  const [envoiCommande, setEnvoiCommande] = useState(false);

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

    /**
     * ON N'OUVRE JAMAIS UNE ADRESSE QUI PORTE ENCORE UNE ÉTIQUETTE.
     *
     * Le serveur ne substituait l'identité que pour un client CONNECTÉ : un
     * visiteur recevait le lien brut — `phone=[#Votre portable]` — et cet
     * écran l'ouvrait quand même. Flaix écrivait ce texte dans son
     * formulaire ; et comme le `#` d'une étiquette ouvre un FRAGMENT d'URL,
     * tout ce qui suivait la première ne lui arrivait même pas.
     *
     * Le serveur est corrigé et retire désormais ce qu'il ne peut pas
     * remplir. Ce garde-ci reste, et il n'est pas redondant : une réponse
     * mise en cache, une version ancienne de l'API ou une régression future
     * referaient le même trou. Mieux vaut annoncer que la commande est
     * indisponible que d'envoyer le client chez un partenaire avec une
     * adresse cassée.
     */
    if (url.includes('[#')) {
      console.warn('Lien Flaix encore étiqueté — ouverture refusée');
      showAlert(
        'Commande indisponible',
        'La commande de ce match n’est pas prête. Réessaie dans un instant, ' +
          'ou mets à jour l’application.',
      );
      return;
    }

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
    if (!lieu || !selection) return;

    // Parcours Break Eat : c'est l'écran de l'événement qui prend le relais.
    if (!lieu.flaixEnabled) {
      if (lieu.currentEventId) navigation.navigate('EventHome', { eventId: lieu.currentEventId });
      return;
    }

    void ouvrirFlaixPour(selection.id);
  };

  /**
   * LA DESTINATION EST CELLE DU MATCH CHOISI — demandée au serveur.
   *
   * Le bouton ouvrait le lien COURANT DU LIEU, quel que soit le match
   * sélectionné. Tant qu'un lieu n'ouvrait qu'une rencontre à la fois, cela
   * revenait au même. Avec deux épreuves le même jour dans le même stade,
   * c'était la porte ouverte à commander pour la mauvaise.
   *
   * Et c'est le SERVEUR qui tranche : cet écran peut être ouvert depuis dix
   * minutes et croire une commande ouverte alors qu'elle vient de fermer.
   * Mieux vaut un refus clair qu'un paiement pour un match qui ne prend
   * plus rien.
   */
  const ouvrirFlaixPour = async (eventId: string): Promise<void> => {
    if (!lieu) return;
    setEnvoiCommande(true);
    try {
      const destination = await apiDestinationDeCommande(lieu.id, eventId);

      // Ses coordonnées lui éviteront de se reconnecter chez Flaix — on les
      // demande ici plutôt que de le laisser les ressaisir là-bas.
      if (destination.attendIdentite) {
        try {
          const p = profil ?? (await apiMonProfil());
          setProfil(p);
          if (coordonneesManquantes(p)) {
            setMatchEnAttente(eventId);
            setDemandeOuverte(true);
            return;
          }
        } catch {
          // Profil illisible (réseau) : on n'empêche pas de commander. La
          // page de commande demandera ce qui manque, comme avant.
        }
      }

      ouvrirFlaix(destination.url);
    } catch (e: unknown) {
      console.warn('apiDestinationDeCommande a échoué:', e);
      showAlert(
        'Commande indisponible',
        'La commande de ce match n’est pas ouverte pour le moment. Réessaie dans un instant.',
      );
      // L'écran peut être en retard sur la réalité : on le relit.
      void charger();
    } finally {
      setEnvoiCommande(false);
    }
  };

  // ── Ce que le bandeau annonce ─────────────────────────────────────

  const ouvert = lieu ? ouvertALaCommande(lieu) : false;
  /**
   * L'HEURE S'ÉCRIT 08:00, PAS « 8 h ».
   *
   * `heureDOuverture` rend déjà « 08:00 ». On passait par `heureLisible` pour
   * en faire « 8 h », une forme plus française mais plus lente à lire : on
   * hésite une demi-seconde entre 8 h du matin et 8 h du soir, et le zéro de
   * tête lève le doute sans y penser. Sur un écran qu'on consulte en marchant
   * vers le stade, cette demi-seconde compte.
   */
  const ouvreA = lieu ? heureDOuverture(lieu) : null;

  /**
   * CE QUE LE BANDEAU ANNONCE — ET CE QU'IL TAIT.
   *
   * « Commande ouverte » a été retiré : quand la commande est ouverte, le
   * bouton de chaque match le dit déjà, et le client est en train de
   * l'utiliser. Répéter l'état normal en haut de l'écran occupe la ligne la
   * plus lue pour une information que personne ne cherche.
   *
   * `null` fait disparaître la pastille entière, pas seulement son texte : une
   * pastille vide serait une tache orange sans raison.
   */
  const etatCommande = (): { icone: keyof typeof Ionicons.glyphMap; texte: string } | null => {
    if (ouvert) return null;
    if (ouvreA) return { icone: 'time-outline', texte: `La commande ouvre à ${ouvreA}` };
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

  // Une seule evaluation : l’appeler deux fois dans le rendu refaisait le
  // travail, et laissait croire que les deux appels pouvaient differer.
  const etat = etatCommande();

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

        {/* Calculé UNE fois : l'appeler deux fois refaisait le travail à
            chaque rendu, et laissait croire que les deux appels pouvaient
            répondre différemment. */}
        {chargement || !etat ? null : (
          <View style={styles.pastille}>
            <Ionicons name={etat.icone} size={14} color="rgba(255,255,255,0.9)" />
            <Text style={styles.pastilleTexte} numberOfLines={1}>
              {etat.texte}
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
                  {/* `lecture` : la carte n'a qu'une image, elle peut la
                      donner en grand — une affiche de concert y passe de 32
                      pixels de large à 88, et devient lisible. */}
                  <Vignette match={selection} taille={44} role="lecture" />
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
                  // DÉSARMÉ LE TEMPS D'ALLER CHERCHER LA DESTINATION. Deux
                  // appuis rapides partiraient sinon deux fois, et le
                  // second écraserait le premier avec un aller-retour de
                  // retard — on ouvrirait la page d'avant.
                  <Pressable
                    style={[styles.bouton, envoiCommande && styles.boutonEnCours]}
                    onPress={commander}
                    disabled={envoiCommande}
                  >
                    <Text style={styles.boutonTexte}>
                      {envoiCommande ? 'Un instant…' : 'Commander'}
                    </Text>
                    {envoiCommande ? null : (
                      <Ionicons name="arrow-forward" size={17} color="#fff" />
                    )}
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
          const match = matchEnAttente;
          setMatchEnAttente(null);
          if (!match) return;

          // Enregistré : le SERVEUR remplit l'adresse avec les nouvelles
          // coordonnées. On la redemande donc — sinon le client saisirait
          // son numéro ici et la page de commande le redemanderait.
          //
          // « Plus tard » : on la redemande aussi, et on ouvre telle quelle.
          // Dans les deux cas une seule chose compte — que l'adresse soit
          // celle du match CHOISI.
          if (enregistre) setProfil(null);
          void ouvrirFlaixPour(match);
        }}
      />    </View>
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
    return `La commande ouvre à ${lieu.heureOuvertureCommande} le jour du match`;
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
      /*
        OUVERT L'EMPORTE SUR PASSÉ.

        Les deux peuvent être vrais en même temps, et ce n'est pas un défaut
        de calcul : un club qui laisse son événement au statut ACTIVE après
        le match le garde commandable — c'est la règle du parcours Break Eat
        (`cheminDeCommande`), et `ouvert` la reflète fidèlement.

        Mais estomper une case tout en la cerclant d'orange, avec « ouvert »
        écrit dessous, c'est se contredire à l'écran. Entre « c'est fini » et
        « tu peux commander », le supporter n'a besoin que du second : c'est
        le seul des deux sur lequel il peut agir.
      */
      style={[styles.case, match.passe && !match.ouvert && styles.casePassee]}
      accessibilityRole="button"
      accessibilityLabel={`${match.opponentName ?? match.name}, ${libelleDateLongue(match.startAt)}`}
      accessibilityState={{ selected: selectionne }}
    >
      <Vignette
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
 * LES PROPORTIONS D'UNE AFFICHE — 2:3.
 *
 * C'est le format de tout ce qui s'imprime et se colle : A4, A3, le 40×60 des
 * panneaux. Les affiches de concert en sortent rarement.
 *
 * On ne LIT PAS les proportions réelles du fichier : il faudrait l'avoir
 * téléchargé, et un flyer carré ou en 4:5 doit s'afficher quand même. C'est
 * donc le CADRE qui impose la forme, et l'image qui s'y adapte — rognée dans
 * le ruban, entière dans la carte. Voir `Vignette`.
 */
const RATIO_AFFICHE = 2 / 3;

/**
 * COMBIEN DE FOIS LE BLASON, quand l'affiche passe en lecture.
 *
 * Trois : assez pour reconnaître l'artiste et la date sur un flyer, assez peu
 * pour que le bouton « Commander » reste à l'écran sans faire défiler.
 *
 * Une affiche PLEINE LARGEUR a été essayée d'abord, et écartée : dans une
 * carte de 343 pixels de large, un 2:3 fait 514 pixels de haut — il pousse le
 * bouton sous le bord de l'écran, et le seul geste utile de la carte disparaît
 * derrière l'image.
 */
const AFFICHE_EN_LECTURE = 3;

/**
 * CE QUE LA CASE MONTRE — une affiche, un blason, ou des initiales.
 *
 * Trois formes, et une seule règle pour choisir : ce que le club a saisi. Un
 * calendrier dont les images manquent à moitié est pire que pas d'images du
 * tout, d'où le repli final sur un disque sourd aux initiales — jamais un trou
 * ni une image cassée.
 *
 * ── POURQUOI L'AFFICHE A SA PROPRE FORME ───────────────────
 *
 * Un écusson est rond, ou presque : il tient dans un cercle sans rien perdre.
 * Une affiche est un portrait dont TOUT le propos vit dans la hauteur — le
 * titre en haut, l'artiste au milieu, la date en bas. Glissée dans le même
 * cercle de 48 pixels, il n'en reste que le centre : une tache de couleur.
 *
 * C'est pourquoi la forme suit la donnée, et non l'inverse. Et c'est pourquoi
 * l'affiche est un CHAMP à part en base (`posterUrl`) : le code doit savoir
 * laquelle des deux il tient, pas le deviner à l'extension du fichier ou aux
 * proportions de l'image — deux indices qui se trompent.
 *
 * ── L'AFFICHE L'EMPORTE SUR LE BLASON ────────────────────
 *
 * Les deux peuvent être remplis : c'est le derby dont le club a fait une
 * affiche. Le serveur ne tranche pas — il rend les deux, et garde donc le
 * blason pour le jour où on voudrait les montrer ensemble. Ici on choisit
 * l'affiche : elle a été posée pour CET événement et porte son identité
 * propre, là où un blason ne désigne que le camp d'en face.
 */
function Vignette({
  match,
  taille,
  role = 'index',
  anneau = 'aucun',
}: {
  match: EvenementDeSaison;
  /** Le diamètre du blason — et, en rôle d'index, la hauteur de l'affiche. */
  taille: number;
  /**
   * CE QU'ON FAIT DE L'IMAGE — la repérer, ou la lire.
   *
   * `index` (le ruban) : on parcourt du pouce, on reconnaît, on appuie.
   * L'affiche y prend la HAUTEUR DU BLASON, et ce n'est pas un raccourci :
   * chaque case pose son libellé juste sous son image. Une affiche plus haute
   * décalerait le sien de quelques pixels, et une rangée de dates désalignée
   * se voit tout de suite.
   *
   * `lecture` (la carte du bas) : une seule image, et de la place. Elle passe
   * en grand, et on ne rogne plus rien.
   */
  role?: 'index' | 'lecture';
  anneau?: 'ouvert' | 'choisi' | 'aucun';
}) {
  const affiche = match.posterUrl?.trim();
  const logo = match.opponentLogoUrl?.trim();

  const bordure = {
    borderWidth: anneau === 'aucun' ? 1 : 2,
    borderColor:
      anneau === 'ouvert' ? THEME.orange : anneau === 'choisi' ? THEME.ink : THEME.border,
  };

  if (affiche) {
    const lecture = role === 'lecture';
    const hauteur = lecture ? taille * AFFICHE_EN_LECTURE : taille;
    const largeur = Math.round(hauteur * RATIO_AFFICHE);
    return (
      <View
        style={[
          styles.blason,
          bordure,
          {
            width: largeur,
            height: hauteur,
            // Un arrondi PROPORTIONNEL : la même image doit avoir l'air du
            // même objet à 48 et à 132 pixels. Un rayon fixe paraît dur en
            // grand et avale les coins en petit. Le plancher de 6 évite
            // l'angle vif au format du ruban.
            borderRadius: Math.max(6, Math.round(hauteur * 0.08)),
          },
        ]}
      >
        <Image
          source={{ uri: affiche }}
          style={{ width: '100%', height: '100%' }}
          /*
            `cover` DANS LE RUBAN, `contain` DANS LA CARTE — et l'asymétrie
            est le but.

            À 32 pixels de large on ne lit plus rien : ce qu'il faut, c'est un
            rectangle PLEIN aux couleurs du flyer, qu'on reconnaît entre deux
            ronds. `contain` n'y ajouterait que des bandes blanches.

            Dans la carte on lit : `contain` montre l'affiche ENTIÈRE. C'est
            exactement ce qu'on cherchait — rogner y couperait le titre, qui
            est en haut de tous les flyers du monde. Le fond de la vignette est
            celui de la carte, donc les bandes d'un flyer qui n'est pas en 2:3
            ne se voient pas.
          */
          resizeMode={lecture ? 'contain' : 'cover'}
        />
      </View>
    );
  }

  const cadre = { width: taille, height: taille, borderRadius: taille / 2, ...bordure };

  /*
    LE BLASON — `contain`, et à 0,94 du cercle.

    `contain` et non `cover` : un écusson recadré perd son contour, et c'est le
    contour qui le rend reconnaissable.

    0,94 et non 0,72 : 0,72 était 1/√2, le plus grand CARRÉ qui tienne
    entièrement dans le cercle. Mathématiquement prudent, visuellement timide —
    le blason flottait au milieu d'une couronne vide, et un écusson qu'on ne
    distingue pas ne sert à rien sur un ruban qu'on parcourt du pouce. À 0,94
    les quatre coins de l'image débordent et sont rognés par `overflow: hidden`,
    sans conséquence : un écusson est rond, en bouclier ou en losange, et ses
    coins sont vides. Le contour, lui, reste entier.
  */
  if (logo) {
    return (
      <View style={[styles.blason, cadre]}>
        <Image
          source={{ uri: logo }}
          style={{ width: taille * 0.94, height: taille * 0.94 }}
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
    // En NOIR, et non en gris : c'est un repère de navigation dans une liste
    // qu'on fait défiler, pas une légende.
    color: THEME.ink,
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
  boutonEnCours: { opacity: 0.6 },
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
