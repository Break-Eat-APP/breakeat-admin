import { avecEtatEnDirect, statutCommandeFlaix } from '../etat-commande-flaix';

const c = (etat: string | null, prete = false, enCours = true) => ({ etat, prete, enCours });

describe('statutCommandeFlaix — le ticket et le suivi disent la même étape', () => {
  it('traduit le vocabulaire de Flaix rencontré en vrai', () => {
    expect(statutCommandeFlaix(c('queued'))).toBe('PAID');
    expect(statutCommandeFlaix(c('assigned'))).toBe('PREPARING');
    expect(statutCommandeFlaix(c('ready', true))).toBe('READY');
    expect(statutCommandeFlaix(c('delivered', false, false))).toBe('PICKED_UP');
    expect(statutCommandeFlaix(c('cancelled', false, false))).toBe('CANCELLED');
  });

  it('« prête » l’emporte quel que soit le mot', () => {
    expect(statutCommandeFlaix(c('assigned', true))).toBe('READY');
  });

  it('un mot inconnu : « reçue » tant que la commande est en cours, sinon inconnu', () => {
    expect(statutCommandeFlaix(c('nouveau_mot'))).toBe('PAID');
    expect(statutCommandeFlaix(c('nouveau_mot', false, false))).toBeNull();
  });
});

describe('avecEtatEnDirect — l’état tenu par notre serveur passe devant la liste', () => {
  const lue = { etat: 'queued', prete: false, enCours: true, etatDetail: 'En attente' };

  it('pose l’état en direct et efface la phrase périmée', () => {
    expect(avecEtatEnDirect(lue, { etat: 'ready', status: 'READY' })).toEqual({
      etat: 'ready',
      prete: true,
      enCours: true,
      etatDetail: null,
    });
    expect(avecEtatEnDirect(lue, { etat: 'delivered', status: 'PICKED_UP' }).enCours).toBe(false);
  });

  it('sans état en direct, ou le même, la commande reste telle quelle', () => {
    expect(avecEtatEnDirect(lue, undefined)).toBe(lue);
    expect(avecEtatEnDirect(lue, { etat: 'queued', status: 'PAID' })).toBe(lue);
  });
});
