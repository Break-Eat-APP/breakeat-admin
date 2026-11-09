import { cibleDuDecompte, dateDePeremption, PEREMPTION_MAX_MS } from './peremption';

/**
 * Une péremption mal placée ne lève aucune erreur : le chrono de l'écran
 * verrouillé reste simplement figé à « 0:00 » pendant que la commande est en
 * préparation. C'est ce que ces tests empêchent.
 */
describe('peremption de la Live Activity', () => {
  const MAINTENANT = Date.parse('2026-11-14T19:00:00.000Z');
  const dans = (min: number) => new Date(MAINTENANT + min * 60000).toISOString();
  const base = { status: 'PREPARING', estimatedReadyAt: null, slotStartAt: null };

  describe('cibleDuDecompte', () => {
    it('vise le début du créneau', () => {
      expect(cibleDuDecompte({ ...base, slotStartAt: dans(12) })?.toISOString()).toBe(dans(12));
    });

    it('préfère l’estimation au créneau', () => {
      const etat = { ...base, estimatedReadyAt: dans(7), slotStartAt: dans(12) };
      expect(cibleDuDecompte(etat)?.toISOString()).toBe(dans(7));
    });

    it('aucun décompte une fois prête, récupérée ou annulée', () => {
      for (const status of ['READY', 'COLLECTED', 'CANCELLED']) {
        expect(cibleDuDecompte({ ...base, status, slotStartAt: dans(12) })).toBeNull();
      }
    });

    it('aucun décompte quand un produit manque : le client doit y aller', () => {
      expect(
        cibleDuDecompte({ ...base, slotStartAt: dans(12), missingItems: ['1× Bière'] }),
      ).toBeNull();
    });

    it('un décompte aussi en retard annoncé', () => {
      expect(cibleDuDecompte({ ...base, status: 'DELAYED', estimatedReadyAt: dans(4) })).not.toBeNull();
    });

    it('ignore une date illisible et passe à la suivante', () => {
      const etat = { ...base, estimatedReadyAt: 'pas une date', slotStartAt: dans(12) };
      expect(cibleDuDecompte(etat)?.toISOString()).toBe(dans(12));
    });
  });

  describe('dateDePeremption', () => {
    it('tombe PILE à la fin du décompte', () => {
      const etat = { ...base, slotStartAt: dans(12) };
      expect(dateDePeremption(etat, MAINTENANT).toISOString()).toBe(dans(12));
    });

    it('garde le plafond d’une heure sans cible', () => {
      expect(dateDePeremption(base, MAINTENANT).getTime()).toBe(MAINTENANT + PEREMPTION_MAX_MS);
    });

    it('garde le plafond quand la cible est déjà passée', () => {
      const etat = { ...base, slotStartAt: dans(-5) };
      expect(dateDePeremption(etat, MAINTENANT).getTime()).toBe(MAINTENANT + PEREMPTION_MAX_MS);
    });

    it('garde le plafond quand la cible est au-delà d’une heure', () => {
      const etat = { ...base, slotStartAt: dans(90) };
      expect(dateDePeremption(etat, MAINTENANT).getTime()).toBe(MAINTENANT + PEREMPTION_MAX_MS);
    });
  });
});
