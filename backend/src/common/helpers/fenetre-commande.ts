import { EventStatus } from '@prisma/client';

/**
 * QUEL ÉVÉNEMENT EST OUVERT À LA COMMANDE, MAINTENANT.
 *
 * Flaix fournit une adresse de commande par ÉVÉNEMENT, créable des mois à
 * l'avance. Le club les colle toutes une fois ; c'est ensuite la DATE qui
 * décide laquelle s'ouvre. Cette fonction est cette décision, et elle vit au
 * SERVEUR pour trois raisons :
 *
 *  1. une seule horloge. Le téléphone d'un client peut être à l'heure de
 *     Tokyo, ou simplement en retard de dix minutes ;
 *  2. la règle se corrige sans refaire une build — et une build native passe
 *     par Apple ;
 *  3. le jour où l'API Flaix remplira `flaixOrderUrl` toute seule, rien ne
 *     change ici. L'app ne saura jamais que le lien était collé à la main.
 *
 * Ce qu'on ne fait PAS : deviner l'adresse à partir d'un motif
 * (`…/event/<id>`). Le jour où Flaix change son format, toutes les commandes
 * tombent — en silence, un soir de match. Un lien saisi est un lien vrai.
 */

/** Les seuls champs lus. Un `Event` complet convient. */
export interface EvenementCommandable {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  /** Le contenant unique d'un lieu PERMANENT (restaurant) : pas de match, pas d'horaire. */
  isPermanentContainer?: boolean;
  flaixOrderUrl: string | null;
}

export type FenetreCommande<T extends EvenementCommandable = EvenementCommandable> =
  /** La commande est ouverte : voici l'événement et son lien. */
  | { etat: 'ouvert'; evenement: T; url: string }
  /** Rien maintenant, mais c'est prévu : voici quand, et quoi. */
  | { etat: 'bientot'; evenement: T; ouvreA: Date }
  /** Aucun événement à venir avec un lien de commande. */
  | { etat: 'aucun' };

/**
 * Un événement qui n'accepte PAS de commande, quelle que soit l'heure.
 *
 * `DRAFT` n'est pas publié, `PAUSED` a été suspendu par le club (c'est le geste
 * qu'on fait quand la buvette est débordée), `ENDED` et `CANCELLED` sont
 * terminés. Les laisser passer, c'est encaisser pour un match qui n'a pas lieu.
 */
function ouvrable(ev: EvenementCommandable): boolean {
  return ev.status === EventStatus.ACTIVE;
}

/**
 * La fenêtre de commande à cet instant.
 *
 * @param evenements  Les événements du lieu, dans n'importe quel ordre.
 * @param maintenant  L'instant de référence (injecté : une fonction pure ne lit
 *                    pas l'horloge, sinon elle ne se teste pas).
 * @param ouvreAvantMin Minutes d'avance à l'ouverture — `venue.ordersOpenBeforeMin`.
 */
export function fenetreDeCommande<T extends EvenementCommandable>(
  evenements: readonly T[],
  maintenant: Date,
  ouvreAvantMin: number,
): FenetreCommande<T> {
  // Une avance négative n'a aucun sens et ouvrirait APRÈS le début, ce que
  // personne n'a demandé. On la ramène à zéro plutôt que de lever : un réglage
  // aberrant ne doit pas fermer la buvette.
  const avanceMs = Math.max(0, ouvreAvantMin) * 60_000;
  const t = maintenant.getTime();

  const candidats = evenements.filter((ev) => ouvrable(ev) && ev.flaixOrderUrl);

  // ── 1. Un lieu PERMANENT (restaurant, aéroport) : pas d'horaire à respecter.
  //
  // Son contenant unique n'a pas de « début de match » — il est sans fin. Lui
  // appliquer la fenêtre reviendrait à ouvrir trois heures avant une date
  // arbitraire posée à la création du lieu.
  const permanent = candidats.find((ev) => ev.isPermanentContainer);
  if (permanent) {
    return { etat: 'ouvert', evenement: permanent, url: permanent.flaixOrderUrl as string };
  }

  // ── 2. En cours : la fenêtre s'ouvre AVANT le début, et se ferme à la fin.
  const ouverts = candidats
    .filter((ev) => t >= ev.startAt.getTime() - avanceMs && t <= ev.endAt.getTime())
    // Deux événements qui se chevauchent sur un même lieu, ça arrive (un match
    // qui déborde sur le concert d'après). On sert celui qui a commencé le
    // premier : c'est celui dont le public est déjà dans les gradins.
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const enCours = ouverts[0];
  if (enCours) {
    return { etat: 'ouvert', evenement: enCours, url: enCours.flaixOrderUrl as string };
  }

  // ── 3. Pas encore : le prochain, et l'heure à laquelle il ouvrira.
  //
  // On l'annonce plutôt que de dire « fermé » : un client qui lit « ouvre à
  // 18 h » revient. Un client qui lit « rien ici » ne revient pas.
  const aVenir = candidats
    .filter((ev) => ev.startAt.getTime() > t)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const prochain = aVenir[0];
  if (prochain) {
    return {
      etat: 'bientot',
      evenement: prochain,
      ouvreA: new Date(prochain.startAt.getTime() - avanceMs),
    };
  }

  return { etat: 'aucun' };
}
