import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  DeviceEventEmitter,
  Linking,
  SectionList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  formatOrderNumber,
  numeroDeCommandeNu,
  apiLienRecu,
  apiGetMyOrders,
  apiMarkArrived,
  formatPrice,
  formatTime,
  type Order,
} from '@lib/api/mobile-api';
import { NoterCommande } from '@components/noter-commande';
import { useAuthStore } from '@store/auth.store';
import { showAlert } from '@lib/alert';
import { THEME, shadowCard, HEAD } from '@lib/theme';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { BuvettePlanViewer } from '@components/buvette-plan-viewer';
import { endTrackingForFinishedOrders } from '@lib/live-activity-tracking';
import { EVT_COMMANDES_A_RECHARGER } from '@lib/hooks/use-deep-links';
import { useCartStore } from '@store/cart.store';
import { useSuiviStore } from '@store/suivi.store';
import { JAUNE_FOND, JAUNE_TEXTE } from '@lib/suivi-commande';
import { MissingItemsBanner } from '@components/missing-items-banner';
import { RemboursementBanner } from '@components/remboursement-banner';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Rafraîchissement du suivi live tant qu'au moins une commande est en cours. */
const LIVE_POLL_MS = 10_000;

const GREEN = '#16a34a';
const GREEN_TINT = 'rgba(22, 163, 74, 0.10)';
const RED = '#dc2626';
const RED_TINT = 'rgba(220, 38, 38, 0.10)';
/*
 * LE VIOLET DU REÇU A ÉTÉ RETIRÉ (03/11/2026).
 *
 * Il donnait au reçu une couleur à lui, distincte de l'orange de la marque.
 * L'intention était juste ; le résultat ne l'était plus une fois la carte
 * passée en ticket blanc : sur un fond clair, un bouton violet plein tirait
 * l'œil PLUS FORT que le numéro de commande — c'est-à-dire plus fort que la
 * seule chose qu'on vient chercher.
 *
 * Le reçu et la note sont désormais deux boutons à bordure fine, tous deux
 * secondaires, et « Y aller » est le seul bouton plein de la carte. Une seule
 * couleur pleine, donc une seule hiérarchie.
 */

/**
 * Parcours client résumé en 3 étapes visibles : reçue → en préparation → prête.
 * Les statuts backend PAID et ACCEPTED partagent l'étape « reçue » (l'acceptation
 * par le stand n'est pas une information actionnable pour le client).
 */
type Phase = 'received' | 'preparing' | 'ready' | 'done' | 'cancelled';

interface StatusUi {
  phase: Phase;
  label: string;
  color: string;
  tint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * LE DIAMETRE D'UNE ENCOCHE DE TICKET.
 *
 * Partage par les trois (haut, gauche, droite) : trois valeurs voisines
 * mais distinctes se verraient, et c'est exactement ce qui fait qu'un
 * ticket dessine a la main a l'air dessine a la main.
 */
/**
 * Les encoches de la DÉCHIRURE, plus grandes que celle du haut (demande du
 * 09/11 : « plus imposantes »). Ce sont elles qui font lire « ticket » : à
 * 18 px elles passaient pour un défaut du bord.
 */
const ENCOCHE_COTE = 34;
/** Les encoches en demi-cercle du haut et du bas, au centre (maquette du 09/11). */
const ENCOCHE_CENTRE = 56;
/**
 * LE FOND DE PAGE EST ORANGE PÂLE (demande de Rémi, 10/11). Il était orange
 * vif comme l'en-tête du ticket, et orange sur orange ne se lisait pas.
 * OPAQUE, pas une transparence : les encoches en prennent la couleur — ce
 * sont des trous dans le ticket, on doit voir le fond à travers.
 */
const FOND_PAGE = '#FFE9DF';
/** Le beige des pointillés de la déchirure. */
const BEIGE_DECHIRURE = '#D9BF98';
/** Assez de tirets pour le plus large des téléphones ; le surplus est rogné. */
const TIRETS = Array.from({ length: 34 }, (_, i) => i);
/** Le violet du reçu : distinct de l'orange des gestes, et du gris du reste. */
const VIOLET = '#6D28D9';

const STATUS_UI: Record<string, StatusUi> = {
  PAID: { phase: 'received', label: 'Commande reçue', color: JAUNE_TEXTE, tint: JAUNE_FOND, icon: 'receipt-outline' },
  ACCEPTED: { phase: 'received', label: 'Commande reçue', color: JAUNE_TEXTE, tint: JAUNE_FOND, icon: 'receipt-outline' },
  PREPARING: { phase: 'preparing', label: 'En préparation', color: THEME.orange, tint: THEME.orangeTint, icon: 'flame-outline' },
  READY: { phase: 'ready', label: 'Prête à retirer', color: GREEN, tint: GREEN_TINT, icon: 'checkmark-circle-outline' },
  PICKED_UP: { phase: 'done', label: 'Récupérée', color: GREEN, tint: GREEN_TINT, icon: 'bag-check-outline' },
  COMPLETED: { phase: 'done', label: 'Terminée', color: GREEN, tint: GREEN_TINT, icon: 'bag-check-outline' },
  RECOVERED: { phase: 'done', label: 'Restituée', color: THEME.grey, tint: THEME.bgSubtle, icon: 'refresh-outline' },
  CANCELLED: { phase: 'cancelled', label: 'Annulée', color: RED, tint: RED_TINT, icon: 'close-circle-outline' },
};

const FALLBACK_UI: StatusUi = {
  phase: 'received',
  label: 'En cours',
  color: THEME.inkSoft,
  tint: THEME.bgSubtle,
  icon: 'ellipsis-horizontal',
};

const ui = (status: string): StatusUi => STATUS_UI[status] ?? FALLBACK_UI;

/**
 * Les trois pastilles, dans l'ordre ou on les lit.
 *
 * Une LISTE plutot que trois blocs recopies : trois boutons ecrits a la main
 * finissent par diverger d'un pixel ou d'une graisse, et c'est toujours le
 * troisieme qu'on oublie.
 */
const FILTRES: { cle: 'toutes' | 'encours' | 'terminees'; libelle: string }[] = [
  { cle: 'toutes', libelle: 'Toutes' },
  { cle: 'encours', libelle: 'En cours' },
  { cle: 'terminees', libelle: 'Récupérées' },
];
const isLive = (status: string): boolean => {
  const p = ui(status).phase;
  return p === 'received' || p === 'preparing' || p === 'ready';
};

/**
 * Étapes de la barre de progression (dans l'ordre du parcours) — les MÊMES
 * couleurs que l'anneau de la pastille : le client lit la même chose en bas de
 * l'écran et sur sa commande.
 *
 * `texte` à part pour la réception : le jaune vif se voit sur un trait, mais
 * écrit sur fond blanc il ne se lit presque pas.
 */
/**
 * LES TROIS PHASES VISIBLES, ET RIEN D'AUTRE.
 *
 * Ce tableau portait aussi un libelle et deux couleurs par etape, du temps ou
 * la carte affichait trois traits LEGENDES. La barre actuelle ne lit que
 * l'ordre : des donnees qu'aucun code ne touche finissent par mentir, et
 * personne ne s'en apercoit puisque personne ne les lit.
 */
const STEPS: Phase[] = ['received', 'preparing', 'ready'];

/**
 * RÉCUPÉRÉE, et pas seulement « terminée ».
 *
 * Une commande annulée ou restituée est terminée aussi, mais le client ne l'a
 * pas eue entre les mains. Deux conséquences, qui avaient été manquées :
 *  · seule une commande RÉCUPÉRÉE se note — le serveur refuse les autres
 *    (`noterCommande`), et le client lisait alors « pas encore récupérée »
 *    sous une commande annulée ;
 *  · la pastille « Récupérées » ne montre qu'elles. Les annulées restent
 *    visibles sous « Toutes », dans la section « Terminées ».
 */
const estRecuperee = (status: string): boolean => status === 'PICKED_UP' || status === 'COMPLETED';

export function OrderHistoryScreen() {
  // Espace sous le contenu : la barre flottante ne doit rien recouvrir.
  // Calcule a l'execution car il depend de la zone sure de l'appareil.
  const espaceBas = useBottomBarSpace();
  const navigation = useNavigation<Nav>();
  const { token } = useAuthStore();

  const [orders, setOrders] = useState<Order[]>([]);
  // Commande dont on regarde le plan — porte le plan ET le nom de la buvette,
  // pour que le titre dise devant laquelle se presenter.
  const [planAffiche, setPlanAffiche] = useState<Order | null>(null);
  /** La commande dont on demande la note. Porte le nom de la buvette : on
   *  note quelqu'un, pas « une commande ». */
  const [commandeANoter, setCommandeANoter] = useState<Order | null>(null);
  /**
   * Le client arrive-t-il de la page de paiement ?
   *
   * Sur le WEB, Stripe renvoie vers `/commandes?paye=1` : la page se recharge
   * entierement, et le code qui attendait la commande cote application a
   * disparu avec elle. Sans ce relais, la liste s'affiche vide pendant que le
   * webhook cree la commande — le client vient de payer et croit avoir perdu
   * son argent.
   *
   * `window` n'existe pas en natif : on le lit via globalThis plutot que
   * d'elargir les types du projet pour trois mots.
   */
  const [vientDePayer, setVientDePayer] = useState(() => {
    const g = globalThis as { location?: { search?: string } };
    return (g.location?.search ?? '').includes('paye=1');
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const recues = await apiGetMyOrders();
      setOrders(recues);
      // La pastille de la barre du bas lit ces mêmes commandes : on les lui
      // donne plutôt que de la laisser refaire l'appel.
      useSuiviStore.getState().publier(recues);
      // Une commande remise n'a plus rien a suivre : on ferme sa carte sur
      // l'ecran verrouille, sans dependre d'une poussee APNs qui peut manquer.
      void endTrackingForFinishedOrders(recues);
    } catch (e: unknown) {
      console.warn('apiGetMyOrders a échoué:', e);
      setError('Impossible de charger tes commandes pour le moment.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  /** « Je suis arrivé » — prévient la buvette que le client attend au retrait. */
  const markArrived = useCallback(async (orderId: string) => {
    // Mise à jour optimiste : le retour visuel doit être immédiat même en réseau
    // dégradé (stade bondé). Rollback si l'appel échoue.
    const stamp = new Date().toISOString();
    setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, customerArrivedAt: stamp } : o)));
    try {
      await apiMarkArrived(orderId);
    } catch (e: unknown) {
      console.warn('apiMarkArrived a échoué:', e);
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, customerArrivedAt: null } : o)));
      showAlert('Signalement impossible', "Ta présence n'a pas pu être envoyée. Réessaie dans un instant.");
    }
  }, []);

  // Suivi live : on ne sonde que s'il reste une commande en cours (économie
  // batterie/réseau — une liste 100 % terminée est figée).
  const hasLive = orders.some((o) => isLive(o.status));

  /**
   * LES PASTILLES ET LES SECTIONS FONT DEUX TRAVAUX DIFFERENTS.
   *
   * Les sections RANGENT — ce qui attend le client, puis ce qui est derriere
   * lui. Les commandes arrivaient melangees, la plus recente en tete : une
   * commande recuperee hier pouvait passer devant celle qu'on attend au
   * comptoir.
   *
   * Les pastilles REDUISENT. Elles ne servent a rien sur trois commandes ;
   * elles servent quand l'historique d'une saison s'est accumule et qu'on
   * cherche celle de ce soir.
   */
  const [filtre, setFiltre] = useState<'toutes' | 'encours' | 'terminees'>('toutes');

  const sections = useMemo(() => {
    const enCours = orders.filter((o) => isLive(o.status));
    // « Récupérées » ne garde que ce que le client a eu en main ; « Toutes »
    // montre aussi les annulées et les restituées.
    const terminees = orders.filter(
      (o) => !isLive(o.status) && (filtre !== 'terminees' || estRecuperee(o.status)),
    );
    const garder = (quoi: 'encours' | 'terminees') => filtre === 'toutes' || filtre === quoi;
    return [
      ...(garder('encours') && enCours.length > 0
        ? [{ titre: 'En cours', data: enCours }]
        : []),
      ...(garder('terminees') && terminees.length > 0
        ? [{ titre: 'Terminées', data: terminees }]
        : []),
    ];
  }, [orders, filtre]);
  useEffect(() => {
    if (!token || !hasLive) return;
    const t = setInterval(() => void load(), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [token, hasLive, load]);

  // Le minuteur ci-dessus ne suffit pas : iOS SUSPEND les minuteurs JavaScript
  // dès que l'app passe en arrière-plan ou que l'écran se verrouille. Au retour,
  // la liste affiche donc l'état d'il y a dix minutes jusqu'au prochain tic —
  // c'est exactement ce qu'on voyait : « je dois actualiser à la main ».
  //
  // On recharge donc à chaque REPRISE réelle : retour au premier plan, et
  // retour sur l'écran depuis un autre onglet.
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') void load();
    });
    return () => sub.remove();
  }, [token, load]);

  /**
   * Attente courte apres un paiement web.
   *
   * La commande nait du webhook Stripe, pas de l'application : il s'ecoule le
   * plus souvent moins d'une seconde, parfois davantage. On sonde donc jusqu'a
   * ce qu'elle apparaisse, et au plus trente secondes — au-dela ce n'est plus
   * un delai de traitement, et faire tourner un sablier indefiniment ne
   * renseigne personne.
   */
  /**
   * Le panier a fait son office : on le vide.
   *
   * Sur le WEB, la page est entierement rechargee par le retour de Stripe :
   * le code qui vidait le panier apres paiement a disparu avec elle. Le panier
   * restait donc plein, et l'application reproposait de regler ce qui venait de
   * l'etre -- « je reste sur une page ou je dois valider mon paiement ».
   *
   * On vide sur la seule presence de `paye=1`, sans attendre la commande :
   * Stripe ne renvoie sur cette adresse qu'apres un reglement accepte. Garder
   * les articles ferait courir le risque bien pire d'un second paiement.
   */
  useEffect(() => {
    if (!vientDePayer) return;
    useCartStore.getState().resetCart();
  }, [vientDePayer]);

  useEffect(() => {
    if (!vientDePayer || !token) return;
    if (orders.length > 0) {
      setVientDePayer(false);
      return;
    }
    const fin = setTimeout(() => setVientDePayer(false), 30_000);
    const tic = setInterval(() => void load(), 2_000);
    return () => {
      clearTimeout(fin);
      clearInterval(tic);
    };
  }, [vientDePayer, token, orders.length, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Arrivee signalee depuis l'ecran verrouille : recharger tout de suite plutot
  // que d'attendre le sondage — le client vient d'appuyer, il attend la preuve.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(EVT_COMMANDES_A_RECHARGER, () => void load());
    return () => sub.remove();
  }, [load]);

  if (!token) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.screenTitle}>Mes commandes</Text>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Connecte-toi pour voir tes commandes.</Text>
          <Pressable style={styles.cta} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.ctaText}>Se connecter</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Mes commandes</Text>
        {hasLive && <LiveBadge />}
      </View>

      {/*
        LES PASTILLES, DÈS QU'IL Y A UNE COMMANDE (demande de Rémi, 10/11).

        Elles n'apparaissaient qu'avec les deux groupes à la fois : un client
        qui n'avait que des commandes récupérées ne voyait jamais le filtre,
        et le croyait absent. Un filtre qui ne rend rien le dit (« Aucune
        commande en cours. »), ce qui vaut mieux qu'un filtre introuvable.
      */}
      {orders.length > 0 ? (
        <View style={styles.filtres}>
          {FILTRES.map((f) => {
            const actif = filtre === f.cle;
            return (
              <Pressable
                key={f.cle}
                onPress={() => setFiltre(f.cle)}
                style={({ pressed }) => [
                  styles.pastille,
                  actif && styles.pastilleActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
              >
                <Text style={[styles.pastilleTexte, actif && styles.pastilleTexteActif]}>
                  {f.libelle}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {vientDePayer && orders.length === 0 && (
        <View style={styles.bandeauPaiement}>
          <ActivityIndicator size="small" color={THEME.orange} />
          <Text style={styles.bandeauTexte}>
            Paiement accepté — ta commande arrive.
          </Text>
        </View>
      )}

      {loading && orders.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={THEME.orange} />
        </View>
      ) : error && orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.cta} onPress={() => void load()}>
            <Text style={styles.ctaText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Aucune commande pour le moment.</Text>
        </View>
      ) : sections.length === 0 ? (
        /* Le filtre ne rend rien : on dit LEQUEL, pas « aucune commande ».
           Un client qui a trois commandes sous les yeux et lit « aucune
           commande » croit a une panne. */
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {filtre === 'encours'
              ? 'Aucune commande en cours.'
              : 'Aucune commande récupérée.'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.list, { paddingBottom: espaceBas }]}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={THEME.orange} />
          }
          // Un titre SEULEMENT s'il y a les deux : sans commande en cours, la
          // liste n'est qu'un historique, et « Terminées » n'y apprend rien.
          renderSectionHeader={({ section }) =>
            sections.length > 1 ? <Text style={styles.sectionTitre}>{section.titre}</Text> : null
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
              onArrived={markArrived}
              onPlan={setPlanAffiche}
              onNoter={setCommandeANoter}
            />
          )}
        />
      )}
      <BuvettePlanViewer
        visible={planAffiche !== null}
        url={planAffiche?.pickupPlanUrl}
        title={planAffiche?.supplierName ?? 'Plan des buvettes'}
        onClose={() => setPlanAffiche(null)}
      />
      {commandeANoter ? (
        <NoterCommande
          visible
          orderId={commandeANoter.id}
          buvette={commandeANoter.supplierName ?? null}
          onFini={(note) => {
            setCommandeANoter(null);
            // On RELIT la liste plutôt que de corriger l'objet en mémoire :
            // le serveur est seul à savoir ce qu'il a réellement enregistré,
            // et une correction locale divergerait au premier refus.
            if (note != null) void load();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Pastille « live » qui pulse tant qu'une commande est en cours. */
function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
      <Text style={styles.liveText}>en direct</Text>
    </View>
  );
}

/**
 * Ouvre le reçu d'une commande.
 *
 * Le serveur le rend en HTML plutôt qu'en PDF : une page s'imprime et
 * s'enregistre en PDF depuis n'importe quel navigateur, sur téléphone comme sur
 * ordinateur, sans embarquer de moteur de rendu côté serveur ni de dépendance
 * native côté application. Le client obtient le même document partout.
 *
 * Le lien est signé et vaut quinze minutes : on le demande donc au moment du
 * clic, jamais à l'avance.
 *
 * DANS SAFARI (ou Chrome), PAS DANS LE NAVIGATEUR INTÉGRÉ (constaté le 10/11 :
 * « Enregistrer en PDF / Imprimer » ne faisait rien). La fenêtre intégrée
 * d'iOS ignore `window.print()` ; le navigateur du téléphone ouvre la feuille
 * d'impression, d'où l'on enregistre le PDF. Changement JavaScript seul : il
 * part par mise à jour à distance, sans module natif.
 */
async function ouvrirRecu(orderId: string, setOccupe: (v: boolean) => void) {
  setOccupe(true);
  try {
    const { url } = await apiLienRecu(orderId);
    if (Platform.OS === 'web') {
      const g = globalThis as { open?: (u: string, c?: string) => unknown };
      g.open?.(url, '_blank');
    } else {
      await Linking.openURL(url);
    }
  } catch (e: unknown) {
    console.warn('Reçu indisponible:', e);
    showAlert('Reçu indisponible', 'Réessaie dans un instant.');
  } finally {
    setOccupe(false);
  }
}

function OrderCard({
  order,
  onPress,
  onArrived,
  onPlan,
  onNoter,
}: {
  order: Order;
  onPress: () => void;
  onArrived: (orderId: string) => void;
  onPlan: (order: Order) => void;
  onNoter: (order: Order) => void;
}) {
  const cfg = ui(order.status);
  const live = isLive(order.status);
  const [recuEnCours, setRecuEnCours] = useState(false);
  const stepIndex = STEPS.indexOf(cfg.phase);
  const arrived = Boolean(order.customerArrivedAt);

  // CE QUI OCCUPE LA PREMIERE PLACE, ET POURQUOI ELLE CHANGE.
  //
  // En cours, c'est « Y aller » : le geste qui deplace le client. Une fois la
  // commande recuperee, plus rien a rejoindre — la place revient a la note,
  // qu'on ne demande jamais avant.
  //
  // `null` quand le plan n'est pas renseigne, ou quand la note est deja
  // donnee : le recu prend alors toute la largeur. Un bouton grise, ou qui
  // ouvre une page vide, vaut moins qu'un bouton absent.
  const principale: 'plan' | 'noter' | null = live
    ? order.pickupPlanUrl
      ? 'plan'
      : null
    : order.note == null && estRecuperee(order.status)
      ? 'noter'
      : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.carte, shadowCard, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Commande ${formatOrderNumber(order)} — ${cfg.label}. Toucher pour suivre.`}
    >
      {/*
        LE TICKET, D'APRÈS LA MAQUETTE DE RÉMI (09/11).

        Deux vues imbriquées, et ce n'est pas décoratif : les encoches sont des
        disques POSÉS À CHEVAL sur le bord, rognés par `overflow: hidden`. Or
        sur iOS une vue qui rogne ne dessine plus son ombre — l'ombre reste
        donc sur la vue extérieure, le rognage sur l'intérieure.
      */}
      <View style={styles.ticket}>
        {/* L'EN-TÊTE : la buvette, et le numéro qu'on dira au comptoir. */}
        <View style={styles.entete}>
          <Text style={styles.enteteNom} numberOfLines={1}>
            {order.supplierName ?? 'Commande'}
          </Text>
          {/*
            LE NUMÉRO, EN ORANGE SUR UNE BULLE BLANCHE.

            La maquette le met sous le nom, en blanc. Mais c'est le seul
            chiffre que le client dira à voix haute, dans le bruit, et il a été
            demandé « plus visible, en orange » : de l'orange sur l'orange de
            l'en-tête ne se lirait pas. La bulle blanche garde la place de la
            maquette ET la couleur demandée.
          */}
          <View style={styles.numeroBulle}>
            <Text style={styles.numeroPrefixe}>Commande n°</Text>
            <Text style={styles.numeroValeur} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {numeroDeCommandeNu(order)}
            </Text>
          </View>
        </View>

        {/* L'ÉTAT ET LE PRIX, À CHEVAL sur la jonction de l'en-tête et du
            corps — c'est ce qui donne au ticket son relief. */}
        <View style={styles.chevauchement}>
          {/* Fond BLANC sous la teinte : la teinte de l'état est transparente,
              et posée telle quelle sur l'en-tête orange elle disparaissait. */}
          <View style={styles.statusSocle}>
            <View style={[styles.statusPill, { backgroundColor: cfg.tint }]}>
              <Ionicons name={cfg.icon} size={15} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <View style={styles.prixBulle}>
            <Text style={styles.prix}>{formatPrice(order.totalCents)}</Text>
          </View>
        </View>

        <View style={styles.corps}>
          {/* La progression, en trois traits : seulement en cours. Une
              commande finie n'a plus rien à faire avancer. */}
          {live ? (
            <View style={styles.barre}>
              {STEPS.map((phase, i) => (
                <View key={phase} style={[styles.barreSegment, stepIndex >= i && styles.barreSegmentFait]} />
              ))}
            </View>
          ) : null}

          {/* Produit manquant — haut dans le corps : c'est la nouvelle qui
              change ce que le client doit faire. */}
          {live ? (
            <MissingItemsBanner lignes={order.items} comptoir={order.supplierName} style={styles.manquant} />
          ) : null}

          {/* RETRAIT | DATE, comme sur la maquette. */}
          <View style={styles.colonnes}>
            <View style={styles.colonne}>
              <Ionicons name="time-outline" size={24} color={live ? cfg.color : THEME.ink} />
              <View style={styles.colonneTexte}>
                <Text style={styles.colonneLibelle}>Retrait</Text>
                <Text
                  style={[
                    order.slot ? styles.colonneValeur : styles.colonneValeurTexte,
                    live && { color: cfg.color },
                  ]}
                  numberOfLines={1}
                >
                  {heureDeRetrait(order)}
                </Text>
              </View>
            </View>
            <View style={styles.colonneSeparateur} />
            <View style={styles.colonne}>
              <Ionicons name="calendar-outline" size={24} color={THEME.ink} />
              <View style={styles.colonneTexte}>
                <Text style={styles.colonneLibelle}>Date</Text>
                <Text style={styles.colonneValeurDate} numberOfLines={1}>
                  {dateCourte(order.createdAt)}
                </Text>
              </View>
            </View>
          </View>

          {/* Remboursement — jamais masqué par l'état : il arrive le plus
              souvent APRÈS que tout est terminé. */}
          <RemboursementBanner paymentStatus={order.paymentStatus} style={styles.manquant} />

          {/*
            « VOIR LE DÉTAIL » (demande de Rémi, 10/11). Tout le ticket se
            touche, mais rien ne le disait : un ticket ressemble à un document,
            pas à un bouton. Ce n'est qu'une indication — le geste reste celui
            de la carte entière, pas un second bouton à viser.
          */}
          <View style={styles.detail} accessibilityElementsHidden importantForAccessibility="no">
            <Text style={styles.detailTexte}>Voir le détail de la commande</Text>
            <Ionicons name="chevron-forward" size={16} color={THEME.orange} />
          </View>
        </View>

        {/* LA DÉCHIRURE : deux grandes encoches et un pointillé BEIGE, le
            long duquel on « arracherait » le ticket (demande de Rémi, 10/11).
            Des tirets DESSINÉS un par un plutôt qu'une bordure en tirets :
            leur couleur, leur longueur et leur écart sont les mêmes sur
            iOS et sur Android, ce qu'une bordure ne garantit pas. */}
        <View style={styles.dechirure}>
          <View style={[styles.encocheCote, styles.encocheGauche]} />
          <View style={styles.pointille}>
            {TIRETS.map((i) => (
              <View key={i} style={styles.tiret} />
            ))}
          </View>
          <View style={[styles.encocheCote, styles.encocheDroite]} />
        </View>

        <View style={styles.actions}>
          {principale === 'plan' ? (
            <Pressable
              style={({ pressed }) => [styles.action, styles.actionAller, pressed && styles.pressed]}
              onPress={() => onPlan(order)}
              hitSlop={4}
            >
              <Ionicons name="map-outline" size={18} color="#fff" />
              <Text style={[styles.actionTexte, styles.actionTexteBlanc]}>Y aller</Text>
            </Pressable>
          ) : null}

          {/* LE REÇU, VIOLET PLEIN : un document, pas un geste — il se
              distingue de l'orange de « Y aller » et de « Noter ». */}
          <Pressable
            style={({ pressed }) => [styles.action, styles.actionRecu, pressed && styles.pressed]}
            onPress={() => void ouvrirRecu(order.id, setRecuEnCours)}
            disabled={recuEnCours}
            hitSlop={4}
          >
            <Ionicons name="receipt-outline" size={18} color="#fff" />
            <Text style={[styles.actionTexte, styles.actionTexteBlanc]}>
              {recuEnCours ? 'Ouverture…' : 'Voir le reçu'}
            </Text>
          </Pressable>

          {principale === 'noter' ? (
            <Pressable
              style={({ pressed }) => [styles.action, styles.actionNoter, pressed && styles.pressed]}
              onPress={() => onNoter(order)}
              hitSlop={4}
            >
              <Ionicons name="star-outline" size={18} color={THEME.orange} />
              <Text style={[styles.actionTexte, { color: THEME.orange }]}>Noter ma commande</Text>
            </Pressable>
          ) : null}

          {/*
            « JE SUIS ARRIVÉ » reste SOUS les autres boutons, et c'est l'ordre
            du parcours : on rejoint le stand, PUIS on signale qu'on y est.
          */}
          {live
            ? arrived
              ? (
                <View style={styles.arrivedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                  <Text style={styles.arrivedText}>Le stand sait que tu es là</Text>
                </View>
              )
              : (
                <Pressable
                  style={({ pressed }) => [styles.arrivedBtn, pressed && styles.pressed]}
                  onPress={() => onArrived(order.id)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel="Clique ici pour nous avertir lorsque tu es devant le point de retrait"
                >
                  <Text style={styles.arrivedBtnText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {'Clique ici pour nous avertir lorsque\ntu es devant le point de retrait'}
                  </Text>
                </Pressable>
              )
            : null}

          {/* Déjà notée : on redonne les étoiles choisies. Faire disparaître la
              question laisserait croire qu'elle n'a pas été enregistrée. */}
          {!live && order.note != null ? (
            <View style={styles.noteDonnee}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Ionicons
                  key={n}
                  name={n <= (order.note ?? 0) ? 'star' : 'star-outline'}
                  size={15}
                  color={THEME.orange}
                />
              ))}
              <Text style={styles.noteDonneeTexte}>Merci pour ta note</Text>
            </View>
          ) : null}
        </View>

        {/* Les encoches du haut et du bas, au centre : ce qui fait lire
            « ticket » avant même d'avoir lu un mot. De la couleur du FOND de
            page : ce sont des trous, pas des pastilles. */}
        <View style={styles.encocheHaut} />
        <View style={styles.encocheBas} />
      </View>
    </Pressable>
  );
}

/**
 * L'heure de retrait, seule — la date a sa propre colonne.
 *
 * Le libellé du club quand il en a donné un (« Mi-temps »), sinon l'heure de
 * début du créneau. Une commande « dès que possible » n'a pas d'heure : on le
 * dit, plutôt que de laisser une case vide.
 */
function heureDeRetrait(order: Order): string {
  const slot = order.slot;
  if (!slot) return 'Dès que prête';
  if (slot.label) return slot.label;
  return formatTime(slot.startAt);
}

/** « 10 oct. 2026 » : la forme courte de la maquette, qui tient dans sa colonne. */
function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  /**
   * LE FOND DE CET ECRAN N'EST PAS BLANC, ET C'EST CE QUI REND LE TICKET
   * LISIBLE.
   *
   * `THEME.bg` et `THEME.surface` valent TOUS LES DEUX #ffffff. Une encoche
   * decoupee dans une carte blanche, posee sur une page blanche, est donc
   * invisible par construction : on l'a vue a l'ecran, elle n'existait pas.
   *
   * `bgSubtle` derriere les cartes blanches rend aux encoches leur role de
   * TROU, et au passage detache les cartes autrement que par un filet d'un
   * pixel. C'est le fond legerement teinte de toutes les interfaces a
   * tickets — et la raison pour laquelle la maquette d'origine en avait un.
   */
  root: { flex: 1, backgroundColor: FOND_PAGE },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 },
  screenTitle: { color: THEME.ink, fontSize: 22, fontFamily: HEAD.bold },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: THEME.orange, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: THEME.radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 11, fontFamily: HEAD.bold },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },
  bandeauPaiement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: THEME.surface,
  },
  bandeauTexte: { color: THEME.orangeDark, fontSize: 13.5, fontWeight: '700', flex: 1 },
  errorText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },
  cta: {
    backgroundColor: THEME.orange, paddingHorizontal: 28, paddingVertical: 13,
    borderRadius: THEME.radius.control,
  },
  ctaText: { color: '#fff', fontFamily: HEAD.bold, fontSize: 15 },

  list: { padding: 16, paddingTop: 22, gap: 26 },

  filtres: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  /**
   * L'ACTIVE EST ORANGE PLEIN, LES AUTRES BLANCHES — sur le fond pâle, le
   * blanc se détache, et l'orange dit sans hésiter lequel est choisi.
   */
  pastille: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: THEME.radius.pill,
    backgroundColor: THEME.surface,
  },
  pastilleActive: { backgroundColor: THEME.orange },
  pastilleTexte: { color: THEME.ink, fontSize: 13.5, fontFamily: HEAD.semibold },
  pastilleTexteActif: { color: '#fff' },
  sectionTitre: {
    color: THEME.inkSoft,
    fontSize: 12.5,
    fontFamily: HEAD.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  /**
   * Carte de commande.
   *
   * Rayon large et bord clair plutôt qu'une ombre marquée : sur un fond blanc
   * cassé, l'ombre seule donnait des cartes molles, aux limites incertaines.
   * Le trait fin les pose ; l'ombre ne fait plus que les décoller.
   */
  /**
   * LA CARTE PORTE L'OMBRE, LE TICKET PORTE LE ROGNAGE.
   *
   * Sur iOS, une vue en `overflow: hidden` ne dessine plus son ombre. Les deux
   * ne peuvent donc pas vivre sur la meme vue — d'ou ces deux styles la ou il
   * n'y en avait qu'un.
   */
  carte: {
    backgroundColor: THEME.surface,
    borderRadius: 26,
  },
  ticket: {
    borderRadius: 26,
    // Le liseré blanc de la maquette : sans lui, l'en-tête orange se fondait
    // dans le fond de page orange.
    borderWidth: 2,
    borderColor: '#fff',
    // Indispensable : c'est lui qui coupe les encoches en deux.
    overflow: 'hidden',
    backgroundColor: THEME.surface,
  },

  /**
   * LES ENCOCHES — de la couleur du FOND DE PAGE (orange), jamais du blanc.
   * Ce sont des TROUS dans le ticket ; la moitié qui dépasse est rognée.
   */
  encocheHaut: {
    position: 'absolute',
    top: -ENCOCHE_CENTRE / 2,
    left: '50%',
    marginLeft: -ENCOCHE_CENTRE / 2,
    width: ENCOCHE_CENTRE,
    height: ENCOCHE_CENTRE,
    borderRadius: ENCOCHE_CENTRE / 2,
    backgroundColor: FOND_PAGE,
  },
  encocheBas: {
    position: 'absolute',
    bottom: -ENCOCHE_CENTRE / 2,
    left: '50%',
    marginLeft: -ENCOCHE_CENTRE / 2,
    width: ENCOCHE_CENTRE,
    height: ENCOCHE_CENTRE,
    borderRadius: ENCOCHE_CENTRE / 2,
    backgroundColor: FOND_PAGE,
  },
  encocheCote: {
    width: ENCOCHE_COTE,
    height: ENCOCHE_COTE,
    borderRadius: ENCOCHE_COTE / 2,
    backgroundColor: FOND_PAGE,
  },
  encocheGauche: { marginLeft: -ENCOCHE_COTE / 2 },
  encocheDroite: { marginRight: -ENCOCHE_COTE / 2 },

  dechirure: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  pointille: {
    flex: 1,
    marginHorizontal: 10,
    height: 3,
    flexDirection: 'row',
    alignItems: 'center',
    // Centrés : le surplus est rogné également des deux côtés, et le
    // pointillé finit pareil contre chaque encoche.
    justifyContent: 'center',
    gap: 5,
    overflow: 'hidden',
  },
  tiret: { width: 8, height: 2.5, borderRadius: 2, backgroundColor: BEIGE_DECHIRURE },

  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: -2,
  },
  detailTexte: { color: THEME.orange, fontSize: 13.5, fontFamily: HEAD.semibold },

  /**
   * L'EN-TÊTE ORANGE VIF (#FD4000, demande de Rémi, 10/11) : sur le fond
   * pâle, c'est lui qui fait lire « ticket » d'un coup d'œil.
   */
  entete: {
    backgroundColor: THEME.orange,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 34,
    gap: 10,
  },
  enteteNom: { color: '#fff', fontSize: 26, lineHeight: 31, fontFamily: HEAD.bold, letterSpacing: -0.4 },
  numeroBulle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  numeroPrefixe: { color: THEME.orange, fontSize: 15, fontFamily: HEAD.bold },
  /** Le plus gros caractère de la carte : on le dira au comptoir, dans le bruit. */
  numeroValeur: {
    color: THEME.orange,
    fontSize: 36,
    lineHeight: 42,
    fontFamily: HEAD.bold,
    fontVariant: ['tabular-nums'],
  },

  chevauchement: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: -22,
  },
  statusSocle: { backgroundColor: '#fff', borderRadius: THEME.radius.pill },
  prixBulle: {
    backgroundColor: '#fff',
    borderRadius: THEME.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  prix: { color: THEME.ink, fontSize: 22, fontFamily: HEAD.bold, fontVariant: ['tabular-nums'] },

  corps: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },

  barre: { flexDirection: 'row', gap: 4 },
  barreSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: THEME.border },
  barreSegmentFait: { backgroundColor: THEME.orange },

  colonnes: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  colonne: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  colonneTexte: { flexShrink: 1 },
  colonneSeparateur: { width: 1, alignSelf: 'stretch', backgroundColor: THEME.border, marginHorizontal: 12 },
  colonneLibelle: { color: THEME.inkSoft, fontSize: 13.5, fontFamily: HEAD.semibold },
  colonneValeur: { color: THEME.ink, fontSize: 22, fontFamily: HEAD.bold, fontVariant: ['tabular-nums'] },
  // « Dès que prête » : une phrase, pas une heure — à la taille de la date,
  // sinon elle ne tient pas dans sa colonne.
  colonneValeurTexte: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold },
  colonneValeurDate: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.semibold },

  actions: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, gap: 10 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: THEME.radius.pill,
  },
  // Pleine et orange : le geste qui déplace le client. Un seul par carte.
  actionAller: { backgroundColor: THEME.orange },
  actionRecu: { backgroundColor: VIOLET },
  actionNoter: { backgroundColor: THEME.orangeTint },
  actionTexte: { fontSize: 15, fontFamily: HEAD.bold },
  actionTexteBlanc: { color: '#fff' },

  pressed: { opacity: 0.85 },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: THEME.radius.pill,
  },
  statusText: { fontSize: 13, fontFamily: HEAD.bold },


  manquant: { marginTop: 10 },


  arrivedBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: THEME.orange, borderRadius: THEME.radius.pill,
    // Une marge LATERALE : sans elle, le texte allait toucher les arrondis
    // de la pilule — « devant » finissait colle au bord.
    paddingVertical: 11, paddingHorizontal: 18, marginTop: 2,
  },
  arrivedBtnText: { color: '#fff', fontSize: 12, fontFamily: HEAD.bold, textAlign: 'center', lineHeight: 17 },
  noteDonnee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 10,
  },
  noteDonneeTexte: {
    color: THEME.grey,
    fontSize: 12.5,
    fontFamily: HEAD.medium,
    marginLeft: 6,
  },
  arrivedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: GREEN_TINT, borderRadius: THEME.radius.pill,
    paddingVertical: 10, marginTop: 2,
  },
  arrivedText: { color: GREEN, fontSize: 13, fontFamily: HEAD.semibold },
});
