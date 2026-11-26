import { plusRecentesDabord } from '../ordre-commandes';

const d = (e: { le: string | null }) => e.le;

describe('plusRecentesDabord — l’ordre de « Mes commandes »', () => {
  it('mêle BreakEat et Flaix par date, la plus récente en tête (cas de Rémi, 26/11)', () => {
    const breakeat = [{ id: 'b16nov', le: '2026-11-16T19:00:00Z' }, { id: 'boct', le: '2026-10-04T19:00:00Z' }, { id: 'bsept', le: '2026-09-20T19:00:00Z' }];
    const flaix = [{ id: 'f26nov', le: '2026-11-26T20:10:00+01:00' }, { id: 'f25nov', le: '2026-11-25T21:00:00+01:00' }];
    expect(plusRecentesDabord([...breakeat, ...flaix], d).map((e) => e.id)).toEqual([
      'f26nov',
      'f25nov',
      'b16nov',
      'boct',
      'bsept',
    ]);
  });

  it('une date illisible passe en dernier ; à date égale, l’ordre est gardé', () => {
    const l = [{ id: 'x', le: null }, { id: 'a', le: '2026-11-01T10:00:00Z' }, { id: 'b', le: '2026-11-01T10:00:00Z' }];
    expect(plusRecentesDabord(l, d).map((e) => e.id)).toEqual(['a', 'b', 'x']);
  });

  it('ne modifie pas la liste reçue', () => {
    const l = [{ id: 'old', le: '2026-01-01T00:00:00Z' }, { id: 'new', le: '2026-12-01T00:00:00Z' }];
    plusRecentesDabord(l, d);
    expect(l[0].id).toBe('old');
  });
});
