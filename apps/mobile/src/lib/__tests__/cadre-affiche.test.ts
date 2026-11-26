import { HAUTEUR_MAX, cadreAffiche } from '../cadre-affiche';

describe('cadreAffiche — l’affiche à sa vraie forme', () => {
  it('une affiche en paysage prend toute la largeur (cas « Disney en concert »)', () => {
    expect(cadreAffiche(311, 16 / 9)).toEqual({ largeur: 311, hauteur: 175 });
  });

  it('une affiche en portrait est bornée en hauteur, sans être rognée', () => {
    const c = cadreAffiche(311, 2 / 3);
    expect(c.hauteur).toBe(HAUTEUR_MAX);
    expect(c.largeur).toBe(Math.round(HAUTEUR_MAX * (2 / 3)));
  });

  it('forme inconnue ou absurde : le format de Flaix, 1200 × 630', () => {
    expect(cadreAffiche(300, null)).toEqual({ largeur: 300, hauteur: 158 });
    expect(cadreAffiche(300, 0)).toEqual({ largeur: 300, hauteur: 158 });
    expect(cadreAffiche(300, Number.NaN)).toEqual({ largeur: 300, hauteur: 158 });
  });

  it('dans une tuile, la hauteur se borne à la case', () => {
    expect(cadreAffiche(150, 1200 / 630, 120)).toEqual({ largeur: 150, hauteur: 79 });
    expect(cadreAffiche(150, 2 / 3, 120)).toEqual({ largeur: 80, hauteur: 120 });
  });
});
