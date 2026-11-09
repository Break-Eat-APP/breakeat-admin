/**
 * LES NOTIFICATIONS RANGÉES PAR DATE.
 *
 * Une liste à plat obligeait à lire chaque date pour savoir si une annonce
 * était de ce soir ou du mois dernier. Quatre sections répondent d'un coup
 * d'œil : Aujourd'hui, Hier, Cette semaine, Plus ancien.
 *
 * Fonction PURE, et `maintenant` en paramètre : la frontière entre « hier » et
 * « cette semaine » se teste à la minute près, sans dépendre de l'heure à
 * laquelle tourne le test.
 *
 * Tout se calcule à l'heure LOCALE du téléphone : « aujourd'hui », c'est la
 * journée du client, pas celle du serveur. Un match fini à 23 h 30 doit
 * rester dans « Aujourd'hui » jusqu'à minuit chez lui.
 *
 * « Cette semaine » est la semaine du CALENDRIER, lundi compris — c'est ce que
 * le mot veut dire en français. Le lundi, une annonce du samedi passe donc
 * dans « Plus ancien » : c'est exact, même si la section du jour est courte.
 *
 * Les libellés de jours et de mois sont écrits ici plutôt que demandés à
 * `Intl` : les moteurs JavaScript des téléphones n'embarquent pas tous les
 * mêmes données de langue, et une date en anglais au milieu d'une app en
 * français se remarque.
 */

export type CleSection = 'aujourdhui' | 'hier' | 'semaine' | 'ancien';

export interface SectionNotifications<T> {
  cle: CleSection;
  titre: string;
  data: T[];
}

const TITRES: Record<CleSection, string> = {
  aujourdhui: 'Aujourd’hui',
  hier: 'Hier',
  semaine: 'Cette semaine',
  ancien: 'Plus ancien',
};

const ORDRE: CleSection[] = ['aujourdhui', 'hier', 'semaine', 'ancien'];

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/** Minuit (heure locale) du jour de `d`. */
function minuit(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Le lundi 00 h 00 de la semaine de `d`.
 *
 * `getDay()` compte à partir du DIMANCHE (0) : `(jour + 6) % 7` donne le
 * nombre de jours écoulés depuis lundi.
 */
function lundi(d: Date): Date {
  const m = minuit(d);
  return new Date(m.getFullYear(), m.getMonth(), m.getDate() - ((m.getDay() + 6) % 7));
}

function deuxChiffres(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function heure(d: Date): string {
  return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

/** Dans quelle section tombe une date, vue depuis `maintenant`. */
export function sectionDe(date: Date, maintenant: Date): CleSection {
  const aujourdhui = minuit(maintenant);
  // Une date dans le futur (horloge du téléphone en retard) reste
  // « aujourd'hui » : la classer ailleurs la ferait disparaître du haut.
  if (date >= aujourdhui) return 'aujourdhui';
  // `new Date(a, m, j - 1)` et pas `aujourdhui - 24 h` : le jour du passage à
  // l'heure d'hiver dure 25 heures, et la soustraction tomberait à 23 h la
  // veille.
  const hier = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() - 1);
  if (date >= hier) return 'hier';
  if (date >= lundi(maintenant)) return 'semaine';
  return 'ancien';
}

/**
 * L'heure à afficher sous une notification, selon sa section.
 *
 * La section dit déjà le jour : la répéter (« Hier » sous le titre « Hier »)
 * n'apprendrait rien. On ne donne donc que ce qui manque.
 */
export function libelleQuand(date: Date, maintenant: Date): string {
  // Une date illisible n'affiche rien plutôt que « NaN NaN, NaN:NaN ».
  if (Number.isNaN(date.getTime())) return '';
  switch (sectionDe(date, maintenant)) {
    case 'aujourdhui': {
      const minutes = Math.floor((maintenant.getTime() - date.getTime()) / 60000);
      if (minutes < 1) return 'À l’instant';
      if (minutes < 60) return `Il y a ${minutes} min`;
      return heure(date);
    }
    case 'hier':
      return heure(date);
    case 'semaine':
      return `${JOURS[date.getDay()]} ${heure(date)}`;
    case 'ancien': {
      const annee = date.getFullYear() === maintenant.getFullYear() ? '' : ` ${date.getFullYear()}`;
      return `${date.getDate()} ${MOIS[date.getMonth()]}${annee}, ${heure(date)}`;
    }
  }
}

/**
 * Range les notifications en sections, les plus récentes d'abord.
 *
 * Une section VIDE n'est pas rendue : un titre « Hier » sans rien dessous
 * ferait croire à un chargement raté.
 *
 * Une date illisible est classée dans « Plus ancien » plutôt que jetée :
 * perdre une annonce serait pire que la mal ranger.
 */
export function grouperParDate<T extends { createdAt: string }>(
  notifications: T[],
  maintenant: Date,
): SectionNotifications<T>[] {
  const horodatage = (n: T) => {
    const t = new Date(n.createdAt).getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  const triees = [...notifications].sort((a, b) => horodatage(b) - horodatage(a));

  const paquets = new Map<CleSection, T[]>();
  for (const n of triees) {
    const t = horodatage(n);
    const cle = t === -Infinity ? 'ancien' : sectionDe(new Date(t), maintenant);
    const paquet = paquets.get(cle) ?? [];
    paquet.push(n);
    paquets.set(cle, paquet);
  }

  return ORDRE.flatMap((cle) => {
    const data = paquets.get(cle);
    return data ? [{ cle, titre: TITRES[cle], data }] : [];
  });
}
