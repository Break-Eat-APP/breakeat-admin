import { compterNouveaux, estNouveau, filtrerAvis, plusRecent, lireVuJusquAu, retenirVuJusquAu } from './avis';

const n = (stars: number, createdAt: string, clubId: string | null, comment: string | null = null) => ({
  stars,
  createdAt,
  comment,
  club: clubId ? { id: clubId, nom: clubId } : null,
});

const notes = [
  n(5, '2026-11-27T10:00:00.000Z', 'dome', 'Top'),
  n(2, '2026-11-26T20:00:00.000Z', 'mans', 'Froid'),
  n(1, '2026-11-26T19:00:00.000Z', 'dome'),
  n(4, '2026-11-25T18:00:00.000Z', null, '  '),
];

describe('filtrerAvis', () => {
  const tout = { clubId: '', etoiles: 'toutes' as const, avecCommentaire: false };

  it('sans filtre : tout', () => {
    expect(filtrerAvis(notes, tout)).toHaveLength(4);
  });
  it('par club', () => {
    expect(filtrerAvis(notes, { ...tout, clubId: 'dome' }).map((x) => x.stars)).toEqual([5, 1]);
  });
  it('« à traiter » : 1 et 2 étoiles', () => {
    expect(filtrerAvis(notes, { ...tout, etoiles: 'a-traiter' }).map((x) => x.stars)).toEqual([2, 1]);
  });
  it('un nombre d’étoiles exact', () => {
    expect(filtrerAvis(notes, { ...tout, etoiles: 5 })).toHaveLength(1);
  });
  it('avec commentaire seulement (un blanc ne compte pas)', () => {
    expect(filtrerAvis(notes, { ...tout, avecCommentaire: true }).map((x) => x.comment)).toEqual(['Top', 'Froid']);
  });
});

describe('les nouveaux avis', () => {
  it('compte ce qui est arrivé après la dernière visite', () => {
    expect(compterNouveaux(notes, '2026-11-26T19:30:00.000Z')).toBe(2);
    expect(estNouveau(notes[3], '2026-11-26T19:30:00.000Z')).toBe(false);
  });
  it('première visite : rien n’est « nouveau »', () => {
    expect(compterNouveaux(notes, null)).toBe(0);
  });
  it('retient le plus récent', () => {
    expect(plusRecent(notes)).toBe('2026-11-27T10:00:00.000Z');
    expect(plusRecent([])).toBeNull();
  });
  it('le souvenir de la visite passe par le navigateur', () => {
    retenirVuJusquAu('2026-11-27T10:00:00.000Z');
    expect(lireVuJusquAu()).toBe('2026-11-27T10:00:00.000Z');
    retenirVuJusquAu(null);
    expect(lireVuJusquAu()).toBe('2026-11-27T10:00:00.000Z');
  });
});
