import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  DeviceEventEmitter,
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
import * as WebBrowser from 'expo-web-browser';
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
const ENCOCHE = 18;
/**
 * Les encoches de la DÉCHIRURE, plus grandes que celle du haut (demande du
 * 09/11 : « plus imposantes »). Ce sont elles qui font lire « ticket » : à
 * 18 px elles passaient pour un défaut du bord.
 */
const ENCOCHE_COTE = 30;
/** Le violet du reçu : distinct de l'orange des gestes, et du gris du reste. */
const VIOLET = '#6D28D9';
const VIOLET_FOND = '#F3EEFF';
const VIOLET_BORD = '#DDD0FB';

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
  // Son pendant, pour les pastilles : elles n'ont de sens qu'avec les deux.
  const hasTerminees = orders.some((o) => !isLive(o.status));

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
        LES PASTILLES NE S'AFFICHENT QUE S'IL Y A LES DEUX GROUPES.

        Sur une liste entierement en cours, « Terminees » ne rendrait rien et
        « Toutes » ne retirerait rien : trois boutons dont deux inutiles et un
        sans effet. La meme regle que celle des titres de section, et pour la
        meme raison — un controle qui ne change rien apprend au client a ne
        plus y toucher.
      */}
      {hasLive && hasTerminees ? (
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
 */
async function ouvrirRecu(orderId: string, setOccupe: (v: boolean) => void) {
  setOccupe(true);
  try {
    const { url } = await apiLienRecu(orderId);
    if (Platform.OS === 'web') {
      const g = globalThis as { open?: (u: string, c?: string) => unknown };
      g.open?.(url, '_blank');
    } else {
      await WebBrowser.openBrowserAsync(url);
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
        DEUX VUES IMBRIQUEES, ET CE N'EST PAS DECORATIF.

        Les encoches du ticket sont des disques POSES A CHEVAL sur le bord : il
        faut `overflow: hidden` pour n'en garder que la moitie visible. Or sur
        iOS, une vue qui rogne son contenu ne dessine plus son ombre. L'ombre
        reste donc dehors, le rognage dedans.
      */}
      <View style={styles.ticket}>
        {/* L'encoche du haut — celle qui fait lire « ticket » avant meme
            d'avoir lu un mot. De la couleur du FOND de page, pas du blanc :
            c'est un trou, pas une pastille. */}
        <View style={styles.encocheHaut} />

        <View style={styles.ticketHaut}>
          <View style={styles.ligneEtat}>
            <View style={[styles.statusPill, { backgroundColor: cfg.tint }]}>
              <Ionicons name={cfg.icon} size={14} color={cfg.color} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {/* Le chevron dit que la carte s'ouvre. Pose au bout de la ligne du
                prix, la ou l'oeil termine sa course — pas au milieu de nulle
                part. */}
            <View style={styles.prixBloc}>
              <Text style={styles.price}>{formatPrice(order.totalCents)}</Text>
              <Ionicons name="chevron-forward" size={16} color={THEME.grey} />
            </View>
          </View>

          {/*
            LA PROGRESSION, EN TROIS TRAITS DE TROIS PIXELS.

            Elle remplace trois etapes legendees qui prenaient une ligne
            entiere et repetaient ce que la pastille dit deja. Ici on voit
            l'avancement SANS LIRE, et on touche la carte pour le detail —
            le principe meme d'une Live Activity.

            Absente une fois la commande recuperee : trois traits pleins
            n'apprennent plus rien, et faisaient ressembler une commande finie
            a une commande en cours.
          */}
          {live ? (
            <View style={styles.barre}>
              {STEPS.map((phase, i) => (
                <View
                  key={phase}
                  style={[styles.barreSegment, stepIndex >= i && styles.barreSegmentFait]}
                />
              ))}
            </View>
          ) : null}

          {/* Produit manquant — haut dans la carte, parce que c'est la
              nouvelle qui change ce que le client doit faire. */}
          {live ? (
            <MissingItemsBanner
              lignes={order.items}
              comptoir={order.supplierName}
              style={styles.manquant}
            />
          ) : null}

          <Text style={styles.supplierText} numberOfLines={1}>
            {order.supplierName ?? 'Commande'}
          </Text>

          {/*
            LE NUMERO — le plus gros caractere de la carte, et en orange
            MEME UNE FOIS RECUPEREE.

            C'est le seul chiffre que le client aura a dire a voix haute, au
            comptoir, dans le bruit. L'etiquette le nomme en toutes lettres :
            pose nu sous un nom de buvette, « 1045 » se confond avec une
            reference interne.

            Cadre pour QUATRE chiffres : le compteur repart a 1 chaque jour et
            par lieu, mais un gros match depasse mille commandes.
          */}
          <Text style={styles.numeroLabel}>Numéro de commande</Text>
          <Text style={styles.numeroValeur} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {numeroDeCommandeNu(order)}
          </Text>
        </View>

        {/* LA DECHIRURE : deux encoches et un pointille. */}
        <View style={styles.dechirure}>
          <View style={[styles.encocheCote, styles.encocheGauche]} />
          <View style={styles.pointille} />
          <View style={[styles.encocheCote, styles.encocheDroite]} />
        </View>

        <View style={styles.ticketBas}>
          <View style={styles.retrait}>
            <Ionicons name="time-outline" size={15} color={live ? cfg.color : THEME.inkSoft} />
            <Text style={[styles.timeStrong, live && { color: cfg.color }]}>{pickupLabel(order)}</Text>
            <Text style={styles.timeSoft}>
              {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
            </Text>
          </View>

          {/* Remboursement — JAMAIS masque par l'etat de la commande : il
              arrive le plus souvent APRES que tout est termine. */}
          <RemboursementBanner paymentStatus={order.paymentStatus} style={styles.manquant} />

          <View style={styles.actions}>
            {principale === 'plan' ? (
              <Pressable
                style={({ pressed }) => [styles.action, styles.actionPleine, pressed && styles.pressed]}
                onPress={() => onPlan(order)}
                hitSlop={4}
              >
                <Ionicons name="map-outline" size={15} color="#fff" />
                <Text style={[styles.actionTexte, styles.actionTextePlein]}>Y aller</Text>
              </Pressable>
            ) : null}

            {principale === 'plan' ? <View style={styles.separateurActions} /> : null}

            {principale === 'noter' ? (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => onNoter(order)}
                hitSlop={4}
              >
                <Ionicons name="star-outline" size={15} color={THEME.orange} />
                <Text style={[styles.actionTexte, { color: THEME.orange }]}>Noter</Text>
              </Pressable>
            ) : null}

            {principale === 'noter' ? <View style={styles.separateurActions} /> : null}

            {/* LE REÇU EN VIOLET (demande du 09/11) : un document, pas un geste —
                il se distingue de l'orange de « Y aller » et de « Noter ». */}
            <Pressable
              style={({ pressed }) => [styles.action, styles.actionRecu, pressed && styles.pressed]}
              onPress={() => void ouvrirRecu(order.id, setRecuEnCours)}
              disabled={recuEnCours}
              hitSlop={4}
            >
              <Ionicons name="receipt-outline" size={15} color={VIOLET} />
              <Text style={[styles.actionTexte, styles.actionTexteRecu]}>
                {recuEnCours ? 'Ouverture…' : 'Reçu'}
              </Text>
            </Pressable>
          </View>

          {/*
            « JE SUIS ARRIVE » reste SOUS les deux boutons, et c'est l'ordre du
            parcours : on rejoint le stand, PUIS on signale qu'on y est. Le
            mettre au-dessus demanderait au client de confirmer une arrivee
            avant de savoir ou aller.
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
                  {/* Deux lignes FORCEES, de longueur voisine (36 et 32 signes).
                      Laissee libre, la coupure tombait ou le hasard de la
                      largeur la mettait : une ligne pleine, un mot orphelin. */}
                  <Text
                    style={styles.arrivedBtnText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {'Clique ici pour nous avertir lorsque\ntu es devant le point de retrait'}
                  </Text>
                </Pressable>
              )
            : null}

          {/* Deja notee : on montre les etoiles choisies. Faire disparaitre la
              question laisserait croire qu'elle n'a pas ete enregistree. */}
          {!live && order.note != null ? (
            <View style={styles.noteDonnee}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Ionicons
                  key={n}
                  name={n <= (order.note ?? 0) ? 'star' : 'star-outline'}
                  size={14}
                  color={THEME.orange}
                />
              ))}
              <Text style={styles.noteDonneeTexte}>Merci pour ta note</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Libellé du retrait : créneau si présent (label du club, sinon plage horaire). */
function pickupLabel(order: Order): string {
  const slot = order.slot;
  if (!slot) return 'Retrait';
  if (slot.label) return `Retrait ${slot.label}`;
  return `Retrait ${formatTime(slot.startAt)} – ${formatTime(slot.endAt)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
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
  root: { flex: 1, backgroundColor: THEME.bgSubtle },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 16, paddingBottom: 8 },
  screenTitle: { color: THEME.ink, fontSize: 22, fontFamily: HEAD.bold },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: THEME.orangeTint, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: THEME.radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: THEME.orange },
  liveText: { color: THEME.orange, fontSize: 11, fontFamily: HEAD.bold },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyText: { color: THEME.grey, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },
  bandeauPaiement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: THEME.orangeTint,
  },
  bandeauTexte: { color: THEME.orangeDark, fontSize: 13.5, fontWeight: '700', flex: 1 },
  errorText: { color: THEME.inkSoft, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },
  cta: {
    backgroundColor: THEME.orange, paddingHorizontal: 28, paddingVertical: 13,
    borderRadius: THEME.radius.control,
  },
  ctaText: { color: '#fff', fontFamily: HEAD.bold, fontSize: 15 },

  list: { padding: 16, gap: 14 },

  filtres: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  /**
   * L'ACTIVE EST BLANCHE, LES AUTRES SONT TRANSPARENTES.
   *
   * Le fond de l'ecran est teinte depuis que la carte est un ticket : une
   * pastille blanche s'y detache sans avoir besoin d'orange. Reserver
   * l'orange au bouton « Y aller » garde une seule couleur pleine par ecran —
   * sinon plus rien ne ressort.
   */
  pastille: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pastilleActive: { backgroundColor: THEME.surface, borderColor: THEME.border },
  pastilleTexte: { color: THEME.grey, fontSize: 13, fontFamily: HEAD.semibold },
  pastilleTexteActif: { color: THEME.ink },
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
    borderRadius: 22,
  },
  ticket: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: THEME.border,
    // Indispensable : c'est lui qui coupe les encoches en deux.
    overflow: 'hidden',
    backgroundColor: THEME.surface,
  },

  /**
   * LES ENCOCHES — de la couleur du FOND DE PAGE, jamais du blanc.
   *
   * Ce sont des TROUS dans le ticket. Peintes en blanc elles disparaitraient
   * sur la carte, peintes en gris elles ressembleraient a des pastilles. La
   * moitie qui depasse est rognee par `overflow: hidden` du parent.
   */
  encocheHaut: {
    position: 'absolute',
    top: -ENCOCHE / 2,
    left: '50%',
    marginLeft: -ENCOCHE / 2,
    width: ENCOCHE,
    height: ENCOCHE,
    borderRadius: ENCOCHE / 2,
    backgroundColor: THEME.bgSubtle,
    zIndex: 2,
  },
  encocheCote: {
    width: ENCOCHE_COTE,
    height: ENCOCHE_COTE,
    borderRadius: ENCOCHE_COTE / 2,
    backgroundColor: THEME.bgSubtle,
  },
  encocheGauche: { marginLeft: -ENCOCHE_COTE / 2 },
  encocheDroite: { marginRight: -ENCOCHE_COTE / 2 },

  dechirure: { flexDirection: 'row', alignItems: 'center' },
  // `borderStyle: 'dashed'` sur une bordure d'UN SEUL cote est ignore par
  // Android : il rend un trait plein. On passe donc par une vue a quatre
  // bordures dont trois sont transparentes.
  pointille: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'transparent',
    borderTopColor: THEME.border,
    borderStyle: 'dashed',
  },

  ticketHaut: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 13, gap: 10 },
  ticketBas: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 16, gap: 10 },

  ligneEtat: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  prixBloc: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  /**
   * TROIS TRAITS DE TROIS PIXELS, et pas trois etapes legendees.
   *
   * Les libelles repetaient ce que la pastille dit juste au-dessus, et
   * prenaient une ligne entiere. Ici l'avancement se voit sans lire ; le
   * detail est a un doigt, puisque la carte entiere ouvre le suivi.
   */
  barre: { flexDirection: 'row', gap: 4, marginTop: -2 },
  barreSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: THEME.border },
  barreSegmentFait: { backgroundColor: THEME.orange },

  // En ORANGE comme le numéro (demande du 09/11) : l'étiquette et la valeur se
  // lisent d'un seul bloc, et « Numéro de commande » ne passe plus pour une
  // mention secondaire.
  numeroLabel: {
    color: THEME.orange,
    fontSize: 12.5,
    fontFamily: HEAD.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: -2,
  },
  /**
   * 40 POINTS, ET EN ORANGE MEME UNE FOIS RECUPEREE.
   *
   * Chiffres de largeur fixe : un numero se lit et se dicte, et un « 11 » plus
   * etroit qu'un « 44 » se lit moins vite d'un coup d'oeil. `adjustsFontSizeToFit`
   * est le filet du jour ou un lieu depassera cinq chiffres.
   */
  numeroValeur: {
    color: THEME.orange,
    fontSize: 40,
    lineHeight: 46,
    fontFamily: HEAD.bold,
    fontVariant: ['tabular-nums'],
    marginTop: -2,
  },

  actions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  /**
   * LE POINTILLÉ ENTRE DEUX ACTIONS — la même perforation que la déchirure,
   * debout. Quatre bordures dont trois transparentes : Android ignore
   * `dashed` sur une bordure d'un seul côté et rendrait un trait plein.
   */
  separateurActions: {
    width: 0,
    borderWidth: 1,
    borderColor: 'transparent',
    borderLeftColor: THEME.border,
    borderStyle: 'dashed',
    marginVertical: 2,
  },
  actionRecu: { backgroundColor: VIOLET_FOND, borderColor: VIOLET_BORD },
  actionTexteRecu: { color: VIOLET },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: THEME.radius.pill,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  // Pleine et orange : c'est le geste qui deplace le client. Un seul par
  // carte — deux boutons pleins ne hierarchisent plus rien.
  actionPleine: { backgroundColor: THEME.orange, borderColor: THEME.orange },
  actionTexte: { color: THEME.inkSoft, fontSize: 13.5, fontFamily: HEAD.bold },
  actionTextePlein: { color: '#fff' },

  pressed: { opacity: 0.85 },
  price: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.bold, fontVariant: ['tabular-nums'] },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: THEME.radius.pill,
  },
  statusText: { fontSize: 13, fontFamily: HEAD.bold },


  manquant: { marginTop: 10 },

  retrait: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
    backgroundColor: THEME.bgSubtle,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  timeStrong: { color: THEME.ink, fontSize: 13, fontFamily: HEAD.semibold },
  timeSoft: { color: THEME.inkSoft, fontSize: 12, fontFamily: HEAD.medium },
  dateLine: { color: THEME.grey, fontSize: 11.5, fontFamily: HEAD.medium },

  supplierText: { color: THEME.ink, fontSize: 16.5, fontFamily: HEAD.bold, letterSpacing: -0.2 },
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
