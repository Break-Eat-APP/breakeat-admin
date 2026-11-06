import { aNePasManquer, type LieuEtSesEvenements } from './a-ne-pas-manquer';

/**
 * La règle de répartition est le cœur de cette section, et elle est
 * entièrement invisible à l'écran : on ne voit que le résultat. Un défaut y
 * ferait simplement disparaître un club des favoris de quelqu'un, sans erreur,
 * sans journal, sans que personne ne sache quoi chercher.
 */

/** Des événements numérotés, à des dates croissantes et distinctes. */
const evenements = (prefixe: string, combien: number, jourDeDepart = 1) =>
  Array.from({ length: combien }, (_, i) => ({
    id: `${prefixe}${i + 1}`,
    name: `${prefixe} ${i + 1}`,
    startAt: new Date(Date.UTC(2026, 10, jourDeDepart + i * 7, 20, 0)).toISOString(),
    opponentName: null,
    opponentLogoUrl: null,
    posterUrl: null,
  }));

const lieu = (id: string, combien: number, jourDeDepart = 1): LieuEtSesEvenements => ({
  venueId: id,
  venueName: `Lieu ${id}`,
  evenements: evenements(id, combien, jourDeDepart),
});

describe('aNePasManquer', () => {
  it('un seul favori donne TROIS événements', () => {
    const r = aNePasManquer([lieu('a', 10)]);
    expect(r).toHaveLength(3);
    expect(r.map((e) => e.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('deux favoris donnent DEUX événements chacun', () => {
    const r = aNePasManquer([lieu('a', 10), lieu('b', 10, 2)]);
    expect(r).toHaveLength(4);
    expect(r.filter((e) => e.venueId === 'a')).toHaveLength(2);
    expect(r.filter((e) => e.venueId === 'b')).toHaveLength(2);
  });

  it('trois favoris donnent UN événement chacun', () => {
    const r = aNePasManquer([lieu('a', 10), lieu('b', 10, 2), lieu('c', 10, 3)]);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((e) => e.venueId))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('au-delà de trois favoris, JAMAIS plus d’un par lieu', () => {
    // LE PIÈGE EST DANS `slice`, PAS DANS LE COMPTE.
    //
    // Sans le plancher, `4 - 5` vaut -1 — et `slice(0, -1)` ne rend PAS un
    // tableau vide : il retire le dernier élément. Chaque lieu donnerait donc
    // neuf événements, et le plafond en garderait six, pris chez les deux ou
    // trois clubs qui jouent le plus tôt.
    //
    // Compter les lieux distincts ne voyait rien de tout ça. Ce qu'il faut
    // mesurer, c'est qu'AUCUN lieu n'apparaisse deux fois.
    const lieux = ['a', 'b', 'c', 'd', 'e'].map((id, i) => lieu(id, 10, i + 1));
    const r = aNePasManquer(lieux);

    const parLieu = new Map<string, number>();
    for (const e of r) parLieu.set(e.venueId, (parLieu.get(e.venueId) ?? 0) + 1);
    expect(Math.max(...parLieu.values())).toBe(1);
    expect(parLieu.size).toBe(5);
  });

  it('AUCUN FAVORI NE DISPARAÎT, même si un club programme bien plus', () => {
    // Le défaut que la règle existe pour empêcher : « les six prochains,
    // tous lieux confondus » aurait rendu six matchs du gros club et zéro du
    // petit, qui joue plus tard.
    const gros = { ...lieu('gros', 20, 1) };
    const petit = { ...lieu('petit', 1, 90) };
    const r = aNePasManquer([gros, petit]);
    expect(r.some((e) => e.venueId === 'petit')).toBe(true);
  });

  it('trie par DATE, tous lieux mélangés', () => {
    // Groupés par lieu, le match du 8 passerait derrière celui du 15.
    const a = lieu('a', 2, 1); // 1er puis 8
    const b = lieu('b', 2, 4); // 4 puis 11
    const r = aNePasManquer([a, b]);
    const dates = r.map((e) => Date.parse(e.startAt));
    expect([...dates].sort((x, y) => x - y)).toEqual(dates);
  });

  it('un favori SANS événement ne réduit pas la part des autres', () => {
    // Trois favoris dont un seul programmé : on montre bien ses trois matchs.
    // Compter les lieux vides aurait rendu un seul événement.
    const r = aNePasManquer([lieu('a', 10), lieu('vide', 0), lieu('vide2', 0)]);
    expect(r).toHaveLength(3);
  });

  it('ne dépasse jamais le plafond', () => {
    const lieux = Array.from({ length: 12 }, (_, i) => lieu(`l${i}`, 5, i + 1));
    expect(aNePasManquer(lieux)).toHaveLength(6);
  });

  it('rend une liste vide sans favori, et sans favori programmé', () => {
    expect(aNePasManquer([])).toEqual([]);
    expect(aNePasManquer([lieu('a', 0), lieu('b', 0)])).toEqual([]);
  });

  it('porte le lieu sur chaque événement — la ligne du dessous en a besoin', () => {
    const [premier] = aNePasManquer([lieu('a', 1)]);
    expect(premier.venueId).toBe('a');
    expect(premier.venueName).toBe('Lieu a');
  });

  it('NE COMPLÈTE PAS avec le lieu le plus fourni', () => {
    // Décision écrite : 2 + 1 = trois lignes, pas quatre. Completer
    // reviendrait a laisser le gros club manger la place libre.
    const r = aNePasManquer([lieu('gros', 5, 1), lieu('petit', 1, 2)]);
    expect(r).toHaveLength(3);
    expect(r.filter((e) => e.venueId === 'gros')).toHaveLength(2);
  });
});
