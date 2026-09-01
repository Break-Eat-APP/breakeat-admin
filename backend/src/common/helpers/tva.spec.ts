import {
  estTauxTvaValide,
  htDepuisTtc,
  libelleTaux,
  ventilerTva,
  TAUX_TVA,
} from './tva';

describe('TVA — trois taux de restauration', () => {
  it('n’accepte que 5,5 / 10 / 20', () => {
    expect(TAUX_TVA).toEqual([550, 1000, 2000]);
    expect(estTauxTvaValide(550)).toBe(true);
    expect(estTauxTvaValide(2000)).toBe(true);
    // Un taux inventé passerait sinon jusqu'en base et fausserait une
    // déclaration sans que rien ne le signale.
    expect(estTauxTvaValide(850)).toBe(false);
    expect(estTauxTvaValide('1000')).toBe(false);
    expect(estTauxTvaValide(undefined)).toBe(false);
  });

  it('affiche 5,5 % à la française', () => {
    expect(libelleTaux(550)).toBe('5,5 %');
    expect(libelleTaux(1000)).toBe('10 %');
    expect(libelleTaux(2000)).toBe('20 %');
  });

  it('dérive le HT du TTC', () => {
    // 11,00 € TTC à 10 % → 10,00 € HT.
    expect(htDepuisTtc(1100, 1000)).toBe(1000);
    // 12,00 € TTC à 20 % → 10,00 € HT.
    expect(htDepuisTtc(1200, 2000)).toBe(1000);
    expect(htDepuisTtc(1055, 550)).toBe(1000);
    expect(htDepuisTtc(0, 2000)).toBe(0);
  });

  describe('ventilation', () => {
    it('sépare la bière du sandwich', () => {
      const v = ventilerTva([
        { ttcCents: 1100, vatRateBps: 1000 }, // sandwich
        { ttcCents: 1200, vatRateBps: 2000 }, // bière
      ]);
      expect(v.tranches).toHaveLength(2);
      expect(v.tranches[0]).toMatchObject({ vatRateBps: 1000, ttcCents: 1100, htCents: 1000, tvaCents: 100 });
      expect(v.tranches[1]).toMatchObject({ vatRateBps: 2000, ttcCents: 1200, htCents: 1000, tvaCents: 200 });
      expect(v.ttcCents).toBe(2300);
      expect(v.htCents).toBe(2000);
      expect(v.tvaCents).toBe(300);
    });

    it('regroupe les lignes d’un même taux et trie par taux croissant', () => {
      const v = ventilerTva([
        { ttcCents: 500, vatRateBps: 2000 },
        { ttcCents: 300, vatRateBps: 550 },
        { ttcCents: 700, vatRateBps: 2000 },
      ]);
      expect(v.tranches.map((t) => t.vatRateBps)).toEqual([550, 2000]);
      expect(v.tranches[1].ttcCents).toBe(1200);
    });

    it('répartit la remise au prorata, sans perdre un centime', () => {
      // 30 € à 10 % et 10 € à 20 %, 4 € de remise fidélité :
      // 3 € imputés au taux 10, 1 € au taux 20.
      const v = ventilerTva(
        [
          { ttcCents: 3000, vatRateBps: 1000 },
          { ttcCents: 1000, vatRateBps: 2000 },
        ],
        400,
      );
      expect(v.tranches[0].ttcCents).toBe(2700);
      expect(v.tranches[1].ttcCents).toBe(900);
      expect(v.ttcCents).toBe(3600);
    });

    it('donne le reste d’arrondi à la tranche la plus lourde', () => {
      // Trois tranches égales, 10 centimes à répartir : 3 + 3 + 3 = 9, il en
      // reste un. Le total doit rester 10.
      const v = ventilerTva(
        [
          { ttcCents: 1000, vatRateBps: 550 },
          { ttcCents: 1000, vatRateBps: 1000 },
          { ttcCents: 2000, vatRateBps: 2000 },
        ],
        10,
      );
      const remiseTotale = 4000 - v.ttcCents;
      expect(remiseTotale).toBe(10);
    });

    it('somme toujours au total, quel que soit l’arrondi', () => {
      for (const remise of [0, 1, 7, 13, 99, 1234]) {
        const v = ventilerTva(
          [
            { ttcCents: 1233, vatRateBps: 550 },
            { ttcCents: 4567, vatRateBps: 1000 },
            { ttcCents: 891, vatRateBps: 2000 },
          ],
          remise,
        );
        expect(v.ttcCents).toBe(1233 + 4567 + 891 - remise);
        expect(v.tranches.reduce((s, t) => s + t.ttcCents, 0)).toBe(v.ttcCents);
        expect(v.tranches.reduce((s, t) => s + t.htCents, 0)).toBe(v.htCents);
      }
    });

    it('ne rend rien quand rien n’a été vendu', () => {
      const v = ventilerTva([]);
      expect(v.tranches).toEqual([]);
      expect(v.ttcCents).toBe(0);
      expect(v.htCents).toBe(0);
      expect(v.tvaCents).toBe(0);
    });

    it('ne laisse pas une remise dépasser le chiffre d’affaires', () => {
      const v = ventilerTva([{ ttcCents: 500, vatRateBps: 1000 }], 900);
      expect(v.ttcCents).toBe(0);
      expect(v.tvaCents).toBe(0);
    });
  });
});
