import { creneauAffichable } from './live-activity.service';

/**
 * « Retrait prévu à 00:00 » : un lieu permanent génère chaque jour un créneau
 * immédiat de 00:00 à 24:00, et le widget en affichait le début comme une heure
 * de rendez-vous.
 */
describe('creneauAffichable', () => {
  const a = (h: number) => new Date(`2026-09-17T${String(h).padStart(2, '0')}:00:00Z`);

  it('pas d’heure pour un retrait immédiat, même court', () => {
    expect(creneauAffichable({ kind: 'IMMEDIATE', startAt: a(20), endAt: a(21) })).toBe(false);
  });

  it('pas d’heure pour un créneau qui couvre la journée', () => {
    const minuit = new Date('2026-09-16T22:00:00Z'); // 00:00 à Paris
    const lendemain = new Date('2026-09-17T22:00:00Z');
    expect(creneauAffichable({ kind: 'GENERAL', startAt: minuit, endAt: lendemain })).toBe(false);
  });

  it('une vraie fenêtre (mi-temps) s’affiche', () => {
    expect(creneauAffichable({ kind: 'PAUSE_1', startAt: a(19), endAt: a(20) })).toBe(true);
  });

  it('pas de créneau, pas d’heure', () => {
    expect(creneauAffichable(null)).toBe(false);
    expect(creneauAffichable(undefined)).toBe(false);
  });
});
