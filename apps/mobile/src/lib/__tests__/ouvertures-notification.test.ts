/**
 * LE TOUCHER D'UNE NOTIFICATION EST TRAITÉ UNE FOIS — audit Codex du 11/11.
 *
 * Au démarrage à froid, la même réponse arrivait par la lecture initiale ET
 * par l'écouteur ; et, jamais effacée, elle était relue à chaque lancement.
 */
const mockGetLast = jest.fn();
const mockClearLast = jest.fn();
let mockEcouteur: ((r: unknown) => void) | null = null;

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
// L'alias `@lib` n'est pas résolu par Jest ici : module virtuel.
jest.mock(
  '@lib/api/mobile-api',
  () => ({ apiRegisterPushToken: jest.fn(), apiUnregisterPushToken: jest.fn() }),
  { virtual: true },
);
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => undefined,
  getLastNotificationResponse: () => mockGetLast(),
  clearLastNotificationResponse: () => mockClearLast(),
  addNotificationResponseReceivedListener: (cb: (r: unknown) => void) => {
    mockEcouteur = cb;
    return { remove: () => (mockEcouteur = null) };
  },
}));

import { ecouterOuvertures, oublierReponsesTraitees } from '../push-notifications';

const reponse = (id: string, data: Record<string, unknown> = { type: 'order_ready' }) => ({
  actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
  notification: { request: { identifier: id, content: { data } } },
});

beforeEach(() => {
  mockGetLast.mockReset();
  mockClearLast.mockReset();
  mockEcouteur = null;
  oublierReponsesTraitees();
});

describe('le toucher d’une notification', () => {
  it('démarrage à froid : lu au lancement ET reçu par l’écouteur → traité UNE fois', () => {
    const r = reponse('n-1');
    mockGetLast.mockReturnValue(r);
    const onOuvrir = jest.fn();

    ecouterOuvertures(onOuvrir);
    mockEcouteur?.(r);

    expect(onOuvrir).toHaveBeenCalledTimes(1);
    expect(onOuvrir).toHaveBeenCalledWith({ type: 'order_ready' });
  });

  it('le toucher est EFFACÉ après traitement : il ne sera pas rejoué au prochain lancement', () => {
    mockGetLast.mockReturnValue(reponse('n-2'));

    ecouterOuvertures(jest.fn());

    expect(mockClearLast).toHaveBeenCalledTimes(1);
  });

  it('second lancement sans nouveau toucher : rien ne se passe', () => {
    mockGetLast.mockReturnValue(null);
    const onOuvrir = jest.fn();

    ecouterOuvertures(onOuvrir);

    expect(onOuvrir).not.toHaveBeenCalled();
  });

  it('l’écoute refaite (reconnexion) ne rejoue pas un toucher déjà traité', () => {
    const r = reponse('n-3');
    mockGetLast.mockReturnValue(r);
    const onOuvrir = jest.fn();

    const arreter = ecouterOuvertures(onOuvrir);
    arreter();
    ecouterOuvertures(onOuvrir);

    expect(onOuvrir).toHaveBeenCalledTimes(1);
  });

  it('deux notifications DIFFÉRENTES sont toutes deux traitées', () => {
    mockGetLast.mockReturnValue(null);
    const onOuvrir = jest.fn();

    ecouterOuvertures(onOuvrir);
    mockEcouteur?.(reponse('n-4'));
    mockEcouteur?.(reponse('n-5', { type: 'missing_items' }));

    expect(onOuvrir).toHaveBeenCalledTimes(2);
  });
});
