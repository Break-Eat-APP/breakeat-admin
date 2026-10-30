import { EventStatus } from '@prisma/client';

/**
 * LA SAISON D'UN LIEU — ce que le calendrier de l'app affiche.
 *
 * L'écran des lieux ne savait dire qu'une chose : « ouvert », ou « ouvre à
 * 8 h ». Un supporter qui voulait savoir quand jouait son club n'avait aucun
 * endroit pour le lire — et un lieu Flaix dont la commande ouvrait plus tard
 * s'affichait « fermé » trois heures avant le coup d'envoi, sans dire que ça
 * ouvrirait.
 *
 * Cette liste est la réponse. Elle n'invente aucune donnée : les événements
 * existent déjà, puisque c'est sur eux que le club colle ses liens Flaix.
 *
 * ── CE QUI N'Y FIGURE PAS, ET POURQUOI ───────────────────────────────
 *
 *  · LES MATCHS À L'EXTÉRIEUR. Ils n'ont jamais été dans la base : les
 *    événements appartiennent au LIEU. Rien à filtrer, donc — mais rien à
 *    ajouter non plus, un jour où l'envie viendrait. Break Eat ne tient pas
 *    la buvette du stade adverse, et un match affiché sans commande possible
 *    est une promesse en l'air.
 *  · LE CONTENANT D'UN LIEU PERMANENT (restaurant). Ce n'est pas un match :
 *    il n'a ni adversaire ni date de fin, et il remplirait le calendrier
 *    d'une case qui ne veut rien dire.
 *  · LES MATCHS ANNULÉS. Un match qui n'a pas lieu n'a pas de commande à
 *    prendre. Le laisser estompé parmi les passés laisserait croire qu'il
 *    s'est joué.
 *  · LE LIEN DE COMMANDE. Aucune adresse ne voyage dans cette liste, et ce
 *    n'est pas un oubli : elles sont PERSONNALISÉES (le nom et le téléphone
 *    du client y sont glissés), et en mettre une par match ferait partir
 *    autant de copies de son identité qu'il y a de rencontres affichées.
 *    L'application demande la destination du match CHOISI, au moment où le
 *    supporter appuie — une seule adresse, une seule fois.
 *
 * ── POURQUOI C'EST BORNÉ ─────────────────────────────────────────────
 *
 * Au bout de trois saisons, un lieu porte des centaines d'événements. Les
 * rendre tous ferait grossir chaque réponse de l'écran des lieux — pour des
 * matchs d'il y a deux ans que personne ne fait défiler. On garde une saison :
 * les derniers matchs joués, et ce qui vient.
 */

/** Les seuls champs lus. Un `Event` complet convient. */
export interface EvenementDeSaisonSource {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  isPermanentContainer?: boolean;
  opponentName?: string | null;
  opponentLogoUrl?: string | null;
}

/** Un match, tel que l'application le reçoit. */
export interface EvenementDeSaison {
  id: string;
  name: string;
  /** ISO — l'app formate selon la langue du téléphone. */
  startAt: string;
  endAt: string;
  /** Le nom de l'adversaire, quand le club l'a saisi. */
  opponentName: string | null;
  /** Son blason. Nul : l'app rend un disque aux initiales, jamais un trou. */
  opponentLogoUrl: string | null;
  /**
   * Le match est joué. Calculé ICI et non dans l'app : un téléphone à l'heure
   * de Tokyo, ou simplement en retard, estomperait le match du jour.
   */
  passe: boolean;
  /**
   * La commande de CE match est ouverte en ce moment — la case que le
   * calendrier cercle, et la seule dont le bouton mène quelque part.
   */
  ouvert: boolean;
}

/**
 * Combien de matchs joués on garde.
 *
 * Huit, soit deux bons mois de championnat : assez pour que le calendrier ait
 * une mémoire et que le mois en cours soit complet, pas assez pour qu'il
 * devienne une archive.
 */
export const SAISON_PASSES_MAX = 8;

/** Et combien à venir. Une saison de Top 14 compte treize matchs à domicile. */
export const SAISON_A_VENIR_MAX = 24;

/**
 * @param evenements Les événements ACCESSIBLES du lieu — la confidentialité se
 *                   décide avant, chez l'appelant. Un calendrier ne doit pas
 *                   révéler qu'un événement réservé existe.
 * @param maintenant L'instant de référence (injecté : une fonction pure ne lit
 *                   pas l'horloge, sinon elle ne se teste pas).
 * @param estOuvert  Dit, POUR CHAQUE événement, si sa commande est ouverte.
 *
 * On recevait auparavant UN identifiant — celui que `fenetreDeCommande`
 * désignait. C'était suffisant tant qu'un lieu n'accueillait qu'une
 * rencontre à la fois ; ça ne l'est plus. Deux épreuves le même jour dans
 * le même stade, et la seconde s'affichait au calendrier SANS bouton :
 * visible, et inaccessible.
 */
export function saisonDuLieu(
  evenements: readonly EvenementDeSaisonSource[],
  maintenant: Date,
  estOuvert: (ev: EvenementDeSaisonSource) => boolean,
): EvenementDeSaison[] {
  const t = maintenant.getTime();
  const retenus = evenements.filter(
    (ev) => !ev.isPermanentContainer && ev.status !== EventStatus.CANCELLED,
  );

  // `endAt` et non `startAt` : un match commencé n'est pas passé. C'est
  // pendant la rencontre qu'on commande le plus.
  const passes = retenus
    .filter((ev) => ev.endAt.getTime() <= t)
    // Les plus RÉCENTS d'abord pour couper les vieux, puis remis dans l'ordre
    // du calendrier. Couper dans la liste chronologique garderait les matchs
    // d'il y a trois ans et jetterait ceux du mois dernier.
    .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
    .slice(0, SAISON_PASSES_MAX)
    .reverse();

  const aVenir = retenus
    .filter((ev) => ev.endAt.getTime() > t)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, SAISON_A_VENIR_MAX);

  return [...passes, ...aVenir].map((ev) => ({
    id: ev.id,
    name: ev.name,
    startAt: ev.startAt.toISOString(),
    endAt: ev.endAt.toISOString(),
    opponentName: ev.opponentName ?? null,
    opponentLogoUrl: ev.opponentLogoUrl ?? null,
    passe: ev.endAt.getTime() <= t,
    ouvert: estOuvert(ev),
  }));
}
