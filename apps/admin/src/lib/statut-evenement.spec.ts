import { etatCommandeFlaix, libelleStatut, ouvertureDeLaCommande } from './statut-evenement';

const H = 60 * 60 * 1000;
const maintenant = new Date();
const ev = (p: Partial<Parameters<typeof etatCommandeFlaix>[0]> = {}) => ({
  status: 'DRAFT',
  startAt: new Date(maintenant.getTime() + 2 * H).toISOString(),
  endAt: new Date(maintenant.getTime() + 5 * H).toISOString(),
  ordersOpenAt: new Date(maintenant.getTime() - H).toISOString(),
  flaixOrderUrl: 'https://flaix.example/o/match',
  ...p,
});

describe('etatCommandeFlaix — ce que vit un match Flaix (27/11/2026)', () => {
  it('un brouillon dont l’heure est passée est OUVERT (cas de Rémi)', () => {
    expect(etatCommandeFlaix(ev(), '08:00', maintenant).libelle).toBe('Ouvert à la commande');
  });

  it('avant l’heure donnée par Flaix : bientôt ouvert, avec l’heure', () => {
    const e = etatCommandeFlaix(ev({ ordersOpenAt: new Date(maintenant.getTime() + H).toISOString() }), null, maintenant);
    expect(e.ton).toBe('bientot');
    expect(e.detail).toMatch(/^La commande ouvre le /);
  });

  it('suspendu, annulé, terminé ferment, comme sur le serveur', () => {
    expect(etatCommandeFlaix(ev({ status: 'PAUSED' }), null, maintenant).libelle).toBe('Suspendu');
    expect(etatCommandeFlaix(ev({ status: 'CANCELLED' }), null, maintenant).libelle).toBe('Annulé');
    expect(etatCommandeFlaix(ev({ status: 'ENDED' }), null, maintenant).libelle).toBe('Terminé');
  });

  it('après la fin, même en brouillon : terminé', () => {
    const fini = ev({ endAt: new Date(maintenant.getTime() - H).toISOString() });
    expect(etatCommandeFlaix(fini, null, maintenant).libelle).toBe('Terminé');
  });

  it('sans lien Flaix : rien ne peut ouvrir, et on le dit', () => {
    expect(etatCommandeFlaix(ev({ flaixOrderUrl: null }), null, maintenant).libelle).toBe('Lien Flaix manquant');
  });
});

describe('ouvertureDeLaCommande — comme heureDOuverture côté serveur', () => {
  it('sans heure Flaix : l’heure du lieu le jour du match, jamais après le début', () => {
    const debut = new Date(2026, 10, 28, 20, 0);
    const o = ouvertureDeLaCommande({ status: 'DRAFT', startAt: debut.toISOString(), endAt: debut.toISOString() }, '08:30');
    expect([o.getHours(), o.getMinutes()]).toEqual([8, 30]);
    const tot = new Date(2026, 10, 28, 7, 0);
    expect(ouvertureDeLaCommande({ status: 'DRAFT', startAt: tot.toISOString(), endAt: tot.toISOString() }, '08:30')).toEqual(tot);
  });
});

it('libelleStatut parle français', () => {
  expect(libelleStatut('DRAFT')).toBe('Brouillon');
  expect(libelleStatut('PAUSED')).toBe('Suspendu');
  expect(libelleStatut('INCONNU')).toBe('INCONNU');
});
