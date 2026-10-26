import type { EvenementDeSaison } from '@lib/api/mobile-api';

/**
 * METTRE LA SAISON EN FORME — les mois, les jours, et les mots.
 *
 * Tout ce que l'écran du calendrier affiche en texte est calculé ici, et pas
 * dans le JSX. Deux raisons :
 *
 *  1. ces règles se testent sans rendu. Un décompte qui dit « dans 0 jour »
 *    ou un mois qui perd son année en janvier, ça ne se voit qu'en lisant
 *    l'écran un jour précis de l'année ;
 *  2. le VOCABULAIRE tient à un seul endroit. Ce qui ouvre, c'est LA
 *    COMMANDE — jamais les buvettes, jamais les créneaux de retrait, qui se
 *    règlent dans Flaix. Une phrase écrite dans le JSX finirait par dire
 *    « les buvettes ouvrent à 8 h », et un supporter se déplacerait pour rien.
 */

/** Un mois de la saison, avec ses matchs dans l'ordre. */
export interface MoisDeSaison {
  /** Clé stable pour le rendu (`2026-10`). */
  cle: string;
  /** « octobre », ou « janvier 2027 » quand la saison change d'année. */
  libelle: string;
  matchs: EvenementDeSaison[];
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/**
 * La saison, regroupée par mois — une ligne de ruban par mois.
 *
 * L'ANNÉE N'APPARAÎT QUE QUAND ELLE CHANGE. Une saison de rugby court sur
 * deux années civiles : « janvier » seul, après un « novembre » de l'année
 * d'avant, laisse croire au janvier passé. Mais l'écrire partout
 * (« octobre 2026 ») alourdit onze lignes sur douze pour rien.
 *
 * L'ordre d'arrivée est conservé : le serveur a déjà rangé les matchs, et
 * trier à nouveau ici ferait deux sources de vérité pour un même ordre.
 */
export function parMois(saison: readonly EvenementDeSaison[], maintenant: Date): MoisDeSaison[] {
  const anneeCourante = maintenant.getFullYear();
  const groupes: MoisDeSaison[] = [];

  for (const m of saison) {
    const d = new Date(m.startAt);
    if (Number.isNaN(d.getTime())) continue;
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dernier = groupes[groupes.length - 1];
    if (dernier?.cle === cle) {
      dernier.matchs.push(m);
      continue;
    }
    const nom = MOIS[d.getMonth()];
    groupes.push({
      cle,
      libelle: d.getFullYear() === anneeCourante ? nom : `${nom} ${d.getFullYear()}`,
      matchs: [m],
    });
  }

  return groupes;
}

/** « sam 31 » — ce qui s'écrit sous un blason du ruban. */
export function libelleJour(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${JOURS[d.getDay()]} ${d.getDate()}`;
}

/**
 * « samedi 31 octobre, 14 h 30 » — la ligne sous le nom de l'adversaire.
 *
 * Écrite à la main plutôt que par `Intl` : Hermes n'embarque pas toujours les
 * données de locale complètes selon la build, et un nom de mois en anglais au
 * milieu d'un écran français se remarque tout de suite.
 */
export function libelleDateLongue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return `${jours[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}, ${heureDuJour(d)}`;
}

/** « 14 h 30 », ou « 21 h » à l'heure pile — l'usage typographique français. */
export function heureDuJour(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * « 08:00 » → « 8 h ». L'heure réglée sur le LIEU, rendue lisible.
 *
 * Le zéro de tête disparaît : « la commande ouvre à 08 h » n'est pas une
 * phrase. Une saisie illisible rend la chaîne telle quelle — mieux vaut
 * afficher « 8h0 » que faire disparaître l'information.
 */
export function heureLisible(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm.trim();
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return hhmm.trim();
  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`;
}

/**
 * LE DÉCOMPTE, et seulement quand il veut dire quelque chose.
 *
 * « dans 87 jours » n'est pas une information, c'est du bruit : à cette
 * distance, la date écrite en clair sert mieux. En dessous d'une semaine, le
 * décompte devient utile — c'est là qu'on commence à s'organiser.
 *
 * Rend `''` quand il n'y a rien d'utile à dire : à l'appelant de ne rien
 * afficher plutôt que d'afficher du vide.
 */
export function libelleAttente(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  // Des JOURS DE CALENDRIER, pas des tranches de 24 h. Un match demain à 14 h
  // vu ce soir à 22 h est « demain », pas « dans 0 jour » — et c'est bien ce
  // qu'un supporter comprend.
  const minuit = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const jours = Math.round((minuit(d) - minuit(maintenant)) / 86_400_000);

  if (jours < 0) return '';
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return 'demain';
  if (jours <= 6) return `dans ${jours} jours`;
  return '';
}

/**
 * Les initiales d'un nom, pour le disque qui remplace un blason absent.
 *
 * LES SÉPARATEURS NE SONT PAS DES MOTS. Les événements s'appellent
 * « ASM - Racing », « OM - Lyon » : découpé sur les espaces seuls, le tiret
 * devient un mot et le disque affiche « A-R ». On ne garde donc que les
 * morceaux qui COMMENCENT par une lettre ou un chiffre.
 */
export function initialesAdversaire(nom: string | null, repli: string): string {
  const source = nom?.trim() || repli.trim();
  const lettres = source
    .split(/[\s\-–—_/|·]+/)
    .filter((mot) => /^[\p{L}\p{N}]/u.test(mot))
    .slice(0, 3)
    .map((mot) => mot[0].toUpperCase())
    .join('');
  return lettres || '?';
}
