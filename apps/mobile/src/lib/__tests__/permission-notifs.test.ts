/**
 * « NOTIFICATIONS ACTIVÉES » SEULEMENT SI LE TÉLÉPHONE EST INSCRIT
 * (audit Codex du 26/11/2026, après BUG-2026-056).
 */
let mockOs = 'ios';
let mockStatut = 'granted';
const mockEnregistrer = jest.fn();

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOs;
    },
  },
  Linking: { openSettings: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ status: mockStatut }),
  requestPermissionsAsync: async () => ({ status: mockStatut }),
}));
jest.mock('../vrai-telephone', () => ({ estUnVraiTelephone: () => mockOs !== 'web' }));
// L'alias `@lib` n'est pas résolu par Jest : module virtuel.
jest.mock('@lib/push-notifications', () => ({ enregistrerPush: (...a: unknown[]) => mockEnregistrer(...a) }), {
  virtual: true,
});

import { demanderNotifs, lireEtatNotifs } from '../permission-notifs';

describe('état des notifications', () => {
  beforeEach(() => {
    mockOs = 'ios';
    mockStatut = 'granted';
    mockEnregistrer.mockReset();
  });

  it('permission accordée ET téléphone inscrit : activées', async () => {
    mockEnregistrer.mockResolvedValue(true);
    expect(await lireEtatNotifs()).toBe('accordee');
    expect(await demanderNotifs()).toBe('accordee');
  });

  it('permission accordée mais inscription ratée : « non relié », pas « activées »', async () => {
    mockEnregistrer.mockResolvedValue(false);
    expect(await lireEtatNotifs()).toBe('non-relie');
    expect(await demanderNotifs()).toBe('non-relie');
  });

  it('refusée : refusée, sans tenter d’inscription', async () => {
    mockStatut = 'denied';
    expect(await lireEtatNotifs()).toBe('refusee');
    expect(mockEnregistrer).not.toHaveBeenCalled();
  });

  it('le web ne reçoit pas de push BreakEat : indisponible', async () => {
    mockOs = 'web';
    expect(await lireEtatNotifs()).toBe('indisponible');
    expect(await demanderNotifs()).toBe('indisponible');
  });
});
