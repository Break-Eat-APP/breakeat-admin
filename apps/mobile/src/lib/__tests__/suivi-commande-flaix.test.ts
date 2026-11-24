/**
 * LA LIVE ACTIVITY D'UNE COMMANDE FLAIX (24/11/2026).
 */
jest.mock(
  '@lib/navigation-flaix',
  () => ({
    estChezFlaix: (url: string) => /^https:\/\/([a-z0-9-]+\.)*(synertic\.net|flaixlabs\.com)\//.test(url),
  }),
  { virtual: true },
);

import {
  idActiviteFlaix,
  jetonDeLActivite,
  jetonDeLAdresse,
  suivreCommandeFlaix,
  type DepsSuivi,
} from '../suivi-commande-flaix';

const JETON = '362c748824d856997af7591ced54310b';
const ETAT = {
  status: 'CREATED',
  statusLabel: 'Commande reçue',
  orderNumber: '1003',
  pickupPoint: 'Burger king',
  updatedAt: '2026-11-24T20:00:00Z',
};

function deps(p: Partial<DepsSuivi> = {}): DepsSuivi & { demarrer: jest.Mock; suivre: jest.Mock } {
  return {
    suivre: jest.fn().mockResolvedValue(ETAT),
    activitesEnCours: jest.fn().mockResolvedValue([]),
    demarrer: jest.fn().mockResolvedValue('act-1'),
    liveActivityPossible: jest.fn().mockResolvedValue(true),
    attendre: jest.fn().mockResolvedValue(undefined),
    ...p,
  } as never;
}

describe('jeton de commande Flaix', () => {
  it('se lit dans l’adresse de suivi Flaix, avec ou sans /api/public', () => {
    expect(jetonDeLAdresse(`https://commande.flaix.bo.synertic.net/api/public/orders/${JETON}`)).toBe(JETON);
    expect(jetonDeLAdresse(`https://commande.flaix.bo.synertic.net/orders/${JETON}?x=1`)).toBe(JETON);
  });

  it('ne se lit ni hors de Flaix, ni sur une page qui n’est pas une commande', () => {
    expect(jetonDeLAdresse(`https://pirate.fr/orders/${JETON}`)).toBeNull();
    expect(jetonDeLAdresse('https://commande.flaix.bo.synertic.net/o/u2')).toBeNull();
    expect(jetonDeLAdresse(null)).toBeNull();
  });

  it('fait l’aller-retour avec l’identifiant de la Live Activity', () => {
    expect(jetonDeLActivite(idActiviteFlaix(JETON))).toBe(JETON);
    expect(jetonDeLActivite('6f1c0c2e-uuid-breakeat')).toBeNull();
  });
});

describe('suivre une commande Flaix', () => {
  it('démarre la Live Activity avec l’état rendu par le serveur', async () => {
    const d = deps();
    expect(await suivreCommandeFlaix(JETON, d)).toBe('act-1');
    expect(d.demarrer).toHaveBeenCalledWith(
      `flaix-${JETON}`,
      expect.objectContaining({ status: 'CREATED', orderNumber: '1003', estimatedReadyAt: null }),
    );
  });

  it('réessaie tant que Flaix ne liste pas encore la commande', async () => {
    const d = deps({ suivre: jest.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue(ETAT) });
    expect(await suivreCommandeFlaix(JETON, d)).toBe('act-1');
    expect(d.suivre).toHaveBeenCalledTimes(2);
  });

  it('abandonne sans erreur après 4 essais', async () => {
    const d = deps({ suivre: jest.fn().mockRejectedValue(new Error('404')) });
    await expect(suivreCommandeFlaix(JETON, d)).resolves.toBeNull();
    expect(d.suivre).toHaveBeenCalledTimes(4);
    expect(d.demarrer).not.toHaveBeenCalled();
  });

  it('ne démarre pas une seconde activité pour la même commande', async () => {
    const d = deps({ activitesEnCours: jest.fn().mockResolvedValue([{ orderId: `flaix-${JETON}` }]) });
    expect(await suivreCommandeFlaix(JETON, d)).toBeNull();
    expect(d.demarrer).not.toHaveBeenCalled();
  });

  it('sur Android, le serveur suit quand même la commande (notification), sans Live Activity', async () => {
    const d = deps({ liveActivityPossible: jest.fn().mockResolvedValue(false) });
    expect(await suivreCommandeFlaix(JETON, d)).toBeNull();
    expect(d.suivre).toHaveBeenCalledTimes(1);
    expect(d.demarrer).not.toHaveBeenCalled();
  });
});
