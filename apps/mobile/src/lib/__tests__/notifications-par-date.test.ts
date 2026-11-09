import { grouperParDate, libelleQuand, sectionDe } from '../notifications-par-date';

/**
 * Les dates sont construites à l'heure LOCALE (`new Date(a, m, j, h, mn)`),
 * comme le téléphone les lit : un test écrit en UTC passerait sur une machine
 * et échouerait sur une autre.
 *
 * Référence : le MERCREDI 11 novembre 2026 à 14 h 00. Le lundi de cette
 * semaine est le 9 ; la veille, le 10.
 */
const MAINTENANT = new Date(2026, 10, 11, 14, 0);
const le = (jour: number, h = 12, mn = 0, mois = 10, annee = 2026) =>
  new Date(annee, mois, jour, h, mn);

describe('sectionDe', () => {
  it('aujourd’hui commence à minuit pile', () => {
    expect(sectionDe(le(11, 0, 0), MAINTENANT)).toBe('aujourdhui');
    expect(sectionDe(le(10, 23, 59), MAINTENANT)).toBe('hier');
  });

  it('hier commence à minuit la veille', () => {
    expect(sectionDe(le(10, 0, 0), MAINTENANT)).toBe('hier');
    expect(sectionDe(le(9, 23, 59), MAINTENANT)).toBe('semaine');
  });

  it('cette semaine commence le LUNDI à minuit', () => {
    expect(sectionDe(le(9, 0, 0), MAINTENANT)).toBe('semaine');
    // Le dimanche 8 appartient à la semaine d'avant.
    expect(sectionDe(le(8, 23, 59), MAINTENANT)).toBe('ancien');
  });

  it('le lundi, « cette semaine » est vide : l’avant-veille est déjà « plus ancien »', () => {
    const lundi = new Date(2026, 10, 9, 10, 0);
    expect(sectionDe(le(8, 18), lundi)).toBe('hier'); // dimanche
    expect(sectionDe(le(7, 18), lundi)).toBe('ancien'); // samedi
  });

  it('le dimanche, la semaine remonte jusqu’au lundi précédent', () => {
    const dimanche = new Date(2026, 10, 15, 10, 0);
    expect(sectionDe(le(9, 0, 0), dimanche)).toBe('semaine');
    expect(sectionDe(le(8, 23, 59), dimanche)).toBe('ancien');
  });

  it('une date dans le futur reste en haut, dans « aujourd’hui »', () => {
    expect(sectionDe(le(11, 14, 5), MAINTENANT)).toBe('aujourdhui');
  });

  it('le changement de mois ne casse pas « hier »', () => {
    const premier = new Date(2026, 11, 1, 9, 0); // 1er décembre
    expect(sectionDe(new Date(2026, 10, 30, 22, 0), premier)).toBe('hier');
  });
});

describe('libelleQuand', () => {
  it('donne une durée dans l’heure qui vient de passer', () => {
    expect(libelleQuand(le(11, 13, 59, 30), MAINTENANT)).toBe('À l’instant');
    expect(libelleQuand(le(11, 13, 58), MAINTENANT)).toBe('Il y a 2 min');
    expect(libelleQuand(le(11, 13, 1), MAINTENANT)).toBe('Il y a 59 min');
  });

  it('donne l’heure au-delà d’une heure, et hier', () => {
    expect(libelleQuand(le(11, 9, 5), MAINTENANT)).toBe('09:05');
    expect(libelleQuand(le(10, 18, 32), MAINTENANT)).toBe('18:32');
  });

  it('donne le jour dans la semaine', () => {
    expect(libelleQuand(le(9, 11, 23), MAINTENANT)).toBe('lun. 11:23');
  });

  it('donne la date au-delà, et l’année seulement si elle change', () => {
    expect(libelleQuand(le(20, 11, 23, 8), MAINTENANT)).toBe('20 sept., 11:23');
    expect(libelleQuand(le(20, 11, 23, 8, 2025), MAINTENANT)).toBe('20 sept. 2025, 11:23');
  });

  it('n’affiche rien pour une date illisible', () => {
    expect(libelleQuand(new Date('pas une date'), MAINTENANT)).toBe('');
  });
});

describe('grouperParDate', () => {
  const n = (id: string, d: Date | string) => ({
    id,
    createdAt: typeof d === 'string' ? d : d.toISOString(),
  });

  it('range dans l’ordre des sections, les plus récentes d’abord dans chacune', () => {
    const sections = grouperParDate(
      [
        n('ancienne', le(20, 11, 0, 8)),
        n('matin', le(11, 9)),
        n('hier', le(10, 18)),
        n('midi', le(11, 12)),
        n('lundi', le(9, 11)),
      ],
      MAINTENANT,
    );
    expect(sections.map((s) => s.titre)).toEqual([
      'Aujourd’hui',
      'Hier',
      'Cette semaine',
      'Plus ancien',
    ]);
    expect(sections[0].data.map((x) => x.id)).toEqual(['midi', 'matin']);
  });

  it('ne rend pas de section vide', () => {
    const sections = grouperParDate([n('a', le(11, 9)), n('b', le(20, 9, 0, 8))], MAINTENANT);
    expect(sections.map((s) => s.cle)).toEqual(['aujourdhui', 'ancien']);
  });

  it('garde une notification à la date illisible, en bas', () => {
    const sections = grouperParDate([n('cassee', 'pas une date'), n('a', le(11, 9))], MAINTENANT);
    expect(sections.map((s) => s.cle)).toEqual(['aujourdhui', 'ancien']);
    expect(sections[1].data[0].id).toBe('cassee');
  });

  it('une liste vide donne zéro section', () => {
    expect(grouperParDate([], MAINTENANT)).toEqual([]);
  });
});
