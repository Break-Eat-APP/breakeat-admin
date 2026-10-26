/**
 * LA MISE EN FORME DU CALENDRIER — ce qui ne se voit qu'un jour précis.
 *
 * Trois pièges vivent ici, et aucun ne se remarque en relisant l'écran :
 *
 *  · L'ANNÉE QUI DISPARAÎT. Une saison de rugby court sur deux années
 *    civiles. « janvier » seul, posé après le « novembre » d'avant, laisse
 *    croire au janvier passé — et le bug n'apparaît qu'au Nouvel An ;
 *  · LE DÉCOMPTE QUI MENT. Un match demain à 14 h, consulté ce soir à 22 h,
 *    est à seize heures : compté en tranches de 24 h, il dirait
 *    « aujourd'hui » ;
 *  · LE VOCABULAIRE. Ce qui ouvre, c'est LA COMMANDE. `heureLisible` est le
 *    seul endroit qui met l'heure du lieu en mots — si elle se trompe, toutes
 *    les phrases de l'écran se trompent avec elle.
 */
import {
  heureDuJour,
  heureLisible,
  initialesAdversaire,
  libelleAttente,
  libelleDateLongue,
  libelleJour,
  parMois,
} from '../calendrier-saison';
import type { EvenementDeSaison } from '../api/mobile-api';

/** Un match, à une date LOCALE donnée (le ruban se lit dans le fuseau du téléphone). */
const match = (id: string, local: string, over: Partial<EvenementDeSaison> = {}): EvenementDeSaison => {
  const d = new Date(local);
  return {
    id,
    name: `Match ${id}`,
    startAt: d.toISOString(),
    endAt: new Date(d.getTime() + 7_200_000).toISOString(),
    opponentName: null,
    opponentLogoUrl: null,
    passe: false,
    ouvert: false,
    ...over,
  };
};

describe('les mois du ruban', () => {
  const OCTOBRE_2026 = new Date(2026, 9, 31, 12, 0);

  it('groupe les matchs par mois, dans l’ordre reçu', () => {
    const mois = parMois(
      [
        match('a', '2026-10-03T14:30'),
        match('b', '2026-10-31T14:30'),
        match('c', '2026-11-14T21:05'),
      ],
      OCTOBRE_2026,
    );

    expect(mois.map((m) => m.libelle)).toEqual(['octobre', 'novembre']);
    expect(mois[0].matchs.map((m) => m.id)).toEqual(['a', 'b']);
    expect(mois[1].matchs.map((m) => m.id)).toEqual(['c']);
  });

  /**
   * LE PIÈGE DU NOUVEL AN. Sans l'année, « janvier » placé après « décembre »
   * se lit comme le janvier déjà passé — et le supporter croit le match joué.
   */
  it('AJOUTE l’année quand la saison change d’année civile', () => {
    const mois = parMois(
      [match('a', '2026-12-20T18:00'), match('b', '2027-01-10T16:00')],
      OCTOBRE_2026,
    );
    expect(mois.map((m) => m.libelle)).toEqual(['décembre', 'janvier 2027']);
  });

  it('ne répète pas l’année de l’année en cours', () => {
    expect(parMois([match('a', '2026-10-03T14:30')], OCTOBRE_2026)[0].libelle).toBe('octobre');
  });

  /**
   * Deux matchs d'octobre séparés par un de novembre ne doivent pas fusionner
   * en un seul groupe : le ruban afficherait novembre sous l'étiquette
   * d'octobre. Le serveur range déjà les matchs, mais le groupement ne doit
   * pas le supposer sans le dire.
   */
  it('ouvre un nouveau groupe à chaque changement de mois', () => {
    const mois = parMois(
      [
        match('a', '2026-10-03T14:30'),
        match('b', '2026-11-14T21:05'),
        match('c', '2026-10-31T14:30'),
      ],
      OCTOBRE_2026,
    );
    expect(mois.map((m) => m.cle)).toEqual(['2026-10', '2026-11', '2026-10']);
  });

  it('ignore une date illisible au lieu de casser l’écran', () => {
    const mois = parMois(
      [{ ...match('a', '2026-10-03T14:30'), startAt: 'pas-une-date' }],
      OCTOBRE_2026,
    );
    expect(mois).toEqual([]);
  });

  it('une saison vide ne rend aucun mois', () => {
    expect(parMois([], OCTOBRE_2026)).toEqual([]);
  });
});

describe('les dates écrites', () => {
  it('« sam 31 » sous le blason', () => {
    expect(libelleJour(new Date(2026, 9, 31, 14, 30).toISOString())).toBe('sam 31');
  });

  it('la ligne longue porte le jour, la date et l’heure', () => {
    expect(libelleDateLongue(new Date(2026, 10, 14, 21, 5).toISOString())).toBe(
      'samedi 14 novembre, 21 h 05',
    );
  });

  /** L'usage français : pas de « 21 h 00 » quand l'heure est pile. */
  it('l’heure pile s’écrit sans minutes', () => {
    expect(heureDuJour(new Date(2026, 9, 31, 21, 0))).toBe('21 h');
    expect(heureDuJour(new Date(2026, 9, 31, 14, 30))).toBe('14 h 30');
  });

  it('une date illisible rend une chaîne vide, pas « Invalid Date »', () => {
    expect(libelleJour('n’importe quoi')).toBe('');
    expect(libelleDateLongue('n’importe quoi')).toBe('');
  });
});

describe('l’heure d’ouverture de LA COMMANDE', () => {
  it('« 08:00 » devient « 8 h » — pas « 08 h »', () => {
    expect(heureLisible('08:00')).toBe('8 h');
  });

  it('garde les minutes quand il y en a', () => {
    expect(heureLisible('08:30')).toBe('8 h 30');
    expect(heureLisible('13:05')).toBe('13 h 05');
  });

  it('accepte une saisie sans zéro de tête', () => {
    expect(heureLisible('8:00')).toBe('8 h');
  });

  /**
   * Un réglage illisible ne doit pas faire DISPARAÎTRE l'information : mieux
   * vaut un affichage bancal qu'un écran qui ne dit plus quand ça ouvre.
   */
  it('rend la saisie telle quelle quand elle est illisible', () => {
    expect(heureLisible('midi')).toBe('midi');
    expect(heureLisible('25:00')).toBe('25:00');
    expect(heureLisible('08:99')).toBe('08:99');
  });
});

describe('le décompte', () => {
  const CE_SOIR = new Date(2026, 9, 30, 22, 0);

  /**
   * LE CAS QUI A MOTIVÉ LE CALCUL EN JOURS DE CALENDRIER : seize heures
   * d'écart, mais c'est bien « demain ».
   */
  it('un match demain matin, vu ce soir, est « demain »', () => {
    expect(libelleAttente(new Date(2026, 9, 31, 14, 30).toISOString(), CE_SOIR)).toBe('demain');
  });

  it('un match le jour même est « aujourd’hui », même passé de quelques heures', () => {
    expect(libelleAttente(new Date(2026, 9, 30, 14, 30).toISOString(), CE_SOIR)).toBe(
      "aujourd'hui",
    );
  });

  it('compte les jours en dessous d’une semaine', () => {
    expect(libelleAttente(new Date(2026, 10, 4, 14, 30).toISOString(), CE_SOIR)).toBe(
      'dans 5 jours',
    );
  });

  /**
   * « dans 87 jours » n'est pas une information, c'est du bruit. À cette
   * distance, la date écrite en clair sert mieux — donc rien à afficher.
   */
  it('se TAIT au-delà d’une semaine', () => {
    expect(libelleAttente(new Date(2026, 11, 20, 14, 30).toISOString(), CE_SOIR)).toBe('');
  });

  it('se tait sur un match passé', () => {
    expect(libelleAttente(new Date(2026, 9, 3, 14, 30).toISOString(), CE_SOIR)).toBe('');
  });

  it('se tait sur une date illisible', () => {
    expect(libelleAttente('pas-une-date', CE_SOIR)).toBe('');
  });
});

describe('les initiales du blason absent', () => {
  it('prend l’initiale de chaque mot, trois au plus', () => {
    expect(initialesAdversaire('Union Bordeaux Bègles', 'x')).toBe('UBB');
    expect(initialesAdversaire('Racing 92', 'x')).toBe('R9');
  });

  /** Sans adversaire saisi, le nom de l'événement prend le relais. */
  it('retombe sur le nom de l’événement', () => {
    expect(initialesAdversaire(null, 'ASM - Racing')).toBe('AR');
    expect(initialesAdversaire('   ', 'Stade Rochelais')).toBe('SR');
  });

  it('rend « ? » plutôt que rien quand il n’y a aucun nom', () => {
    expect(initialesAdversaire(null, '')).toBe('?');
  });
});
