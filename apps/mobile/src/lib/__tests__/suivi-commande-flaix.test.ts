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
  estMessageFermer,
  jetonDuMessage,
  nouvellesCommandes,
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

describe('reconnaître la commande sans jeton dans l’adresse (25/11/2026)', () => {
  it('lit le message de la page Flaix, et rien d’autre', () => {
    expect(jetonDuMessage(JSON.stringify({ type: 'flaix_commande', jeton: JETON }))).toBe(JETON);
    expect(jetonDuMessage(JSON.stringify({ type: 'autre', jeton: JETON }))).toBeNull();
    expect(jetonDuMessage(JSON.stringify({ type: 'flaix_commande', jeton: '../pirate' }))).toBeNull();
    expect(jetonDuMessage('pas du json')).toBeNull();
  });

  const OUVERTE = new Date('2026-11-25T18:14:30+01:00').getTime();
  const c = (id: string, passeeLe: string, enCours = true) => ({ id, passeeLe, enCours });

  it('repère la commande passée depuis l’ouverture (Flaix arrondit à la minute)', () => {
    const liste = [
      c('nouvelle', '2026-11-25T18:14:00+01:00'),
      c('ancienne', '2026-11-25T17:56:00+01:00'),
      c('deja-connue', '2026-11-25T18:15:00+01:00'),
      c('finie', '2026-11-25T18:16:00+01:00', false),
    ];
    expect(nouvellesCommandes(liste, new Set(['deja-connue']), OUVERTE)).toEqual(['nouvelle']);
  });
});

describe('« Fermer » dans la page Flaix (25/11/2026)', () => {
  it('reconnaît le message de fermeture, et seulement lui', () => {
    expect(estMessageFermer(JSON.stringify({ type: 'flaix_fermer' }))).toBe(true);
    expect(estMessageFermer(JSON.stringify({ type: 'flaix_commande', jeton: JETON }))).toBe(false);
    expect(estMessageFermer('fermer')).toBe(false);
    expect(estMessageFermer(null)).toBe(false);
  });
});
