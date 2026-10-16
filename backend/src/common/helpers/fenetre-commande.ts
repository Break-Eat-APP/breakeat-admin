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
 *
 * ── L'HEURE D'OUVERTURE ───────────────────────────────────────────────
 *
 * Une HEURE FIXE le jour de l'événement (« 08:00 »), et non un délai avant le
 * coup d'envoi. C'est ainsi que le club le pense, et surtout : ça ne bouge pas
 * quand l'horaire du match change. L'ouverture des CRÉNEAUX de retrait se
 * règle, elle, dans Flaix — ici on ne décide que de l'accès au lien, qui vient
 * des heures avant.
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

/** Le réglage du lieu : à quelle heure, et dans quel fuseau. */
export interface ReglageOuverture {
  /** « HH:MM », dans le fuseau ci-dessous. */
  heure: string;
  /** Fuseau IANA du lieu, p. ex. `Europe/Paris`. */
  timezone: string;
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

/** « HH:MM » → minutes depuis minuit, ou `null` si la saisie est illisible. */
function minutesDepuisMinuit(heure: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(heure.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Les composantes de date LUES DANS UN FUSEAU donné.
 *
 * `Intl` est le seul outil du runtime qui connaisse les fuseaux et leurs
 * changements d'heure. On s'en sert plutôt que d'ajouter une bibliothèque
 * pour deux fonctions — et plutôt que de coder « +1 h l'hiver, +2 h l'été »,
 * qui serait faux deux dimanches par an.
 */
/**
 * Les formateurs, gardés d'un appel à l'autre.
 *
 * Mesuré : construire un `Intl.DateTimeFormat` coûte SEIZE FOIS plus cher que
 * de s'en resservir. Une recherche de lieux en demandait un par événement et
 * par passe — soit, pour vingt lieux d'une saison, 100 ms de calcul pur avant
 * même d'avoir répondu. Le cache est minuscule (un objet par fuseau, et un
 * club n'en a qu'un) et ne périme jamais : le fuseau d'un lieu ne change pas.
 */
const FORMATEURS = new Map<string, Intl.DateTimeFormat>();

function formateur(timezone: string): Intl.DateTimeFormat {
  let f = FORMATEURS.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    FORMATEURS.set(timezone, f);
  }
  return f;
}

function partiesDansFuseau(
  d: Date,
  timezone: string,
): { annee: number; mois: number; jour: number; heure: number; minute: number } {
  const parts = formateur(timezone).formatToParts(d);
  const lire = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    annee: lire('year'),
    mois: lire('month'),
    jour: lire('day'),
    // `hour12: false` rend « 24 » pour minuit dans certains environnements.
    heure: lire('hour') % 24,
    minute: lire('minute'),
  };
}

/**
 * L'instant UTC correspondant à une heure LOCALE d'un fuseau.
 *
 * Deux passes, et c'est nécessaire : le décalage d'un fuseau dépend de
 * l'instant, et l'instant est justement ce qu'on cherche. La première passe
 * donne un décalage approché, la seconde le corrige — ce qui rattrape les
 * dimanches de changement d'heure.
 */
function instantLocal(
  parties: { annee: number; mois: number; jour: number },
  minutes: number,
  timezone: string,
): Date {
  const souhaite = Date.UTC(
    parties.annee,
    parties.mois - 1,
    parties.jour,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  let instant = souhaite;
  for (let i = 0; i < 2; i += 1) {
    const vu = partiesDansFuseau(new Date(instant), timezone);
    const vuEnMs = Date.UTC(vu.annee, vu.mois - 1, vu.jour, vu.heure, vu.minute);
    instant += souhaite - vuEnMs;
  }
  return new Date(instant);
}

/**
 * À quelle heure la commande de CET événement ouvre.
 *
 * Garde-fou : jamais après le début. Un match qui commence avant l'heure
 * réglée (un tournoi à 7 h, une finale de nuit) ouvre dès son coup d'envoi —
 * sinon la vente n'ouvrirait qu'une fois le public installé, ou jamais.
 *
 * Un réglage illisible, ou un fuseau inconnu, retombe sur le début de
 * l'événement : on n'ouvre pas au hasard, et on ne ferme pas la buvette non
 * plus.
 */
export function heureDOuverture(ev: EvenementCommandable, reglage: ReglageOuverture): Date {
  const minutes = minutesDepuisMinuit(reglage.heure);
  if (minutes === null) return ev.startAt;

  try {
    const jour = partiesDansFuseau(ev.startAt, reglage.timezone);
    const ouverture = instantLocal(jour, minutes, reglage.timezone);
    return ouverture.getTime() < ev.startAt.getTime() ? ouverture : ev.startAt;
  } catch {
    // `Intl` lève sur un fuseau inconnu. Mieux vaut ouvrir au coup d'envoi
    // qu'afficher une heure fantaisiste calculée en UTC.
    return ev.startAt;
  }
}

/**
 * La fenêtre de commande à cet instant.
 *
 * @param evenements  Les événements du lieu, dans n'importe quel ordre.
 * @param maintenant  L'instant de référence (injecté : une fonction pure ne lit
 *                    pas l'horloge, sinon elle ne se teste pas).
 * @param reglage     L'heure d'accès au lien et le fuseau du lieu.
 */
export function fenetreDeCommande<T extends EvenementCommandable>(
  evenements: readonly T[],
  maintenant: Date,
  reglage: ReglageOuverture,
): FenetreCommande<T> {
  const t = maintenant.getTime();
  const candidats = evenements.filter((ev) => ouvrable(ev) && ev.flaixOrderUrl);

  // ── 1. Un lieu PERMANENT (restaurant, aéroport) : pas d'horaire à respecter.
  //
  // Son contenant unique n'a pas de « début de match » — il est sans fin. Lui
  // appliquer l'heure d'ouverture reviendrait à fermer la vente chaque nuit
  // sur une date arbitraire posée à la création du lieu.
  const permanent = candidats.find((ev) => ev.isPermanentContainer);
  if (permanent) {
    return { etat: 'ouvert', evenement: permanent, url: permanent.flaixOrderUrl as string };
  }

  // ── 2. En cours : ouvert depuis l'heure dite, et jusqu'à la fin.
  const ouverts = candidats
    // `endAt` d'abord, et ce n'est pas une coquetterie : au bout de trois
    // saisons, l'immense majorite des evenements d'un lieu sont TERMINES.
    // Calculer leur heure d'ouverture — la partie chere — pour les ecarter
    // ensuite, c'est payer le prix fort pour une reponse connue d'avance.
    .filter((ev) => t <= ev.endAt.getTime() && t >= heureDOuverture(ev, reglage).getTime())
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
  // 8 h » revient. Un client qui lit « rien ici » ne revient pas.
  const aVenir = candidats
    .filter((ev) => ev.endAt.getTime() > t)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const prochain = aVenir[0];
  if (prochain) {
    return { etat: 'bientot', evenement: prochain, ouvreA: heureDOuverture(prochain, reglage) };
  }

  return { etat: 'aucun' };
}
