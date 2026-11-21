/**
 * LE JETON PUSH APRÈS UNE DÉCONNEXION SANS RÉSEAU, ET SON RENOUVELLEMENT
 * (22/11/2026, BUG-2026-045 et BUG-2026-048, audit Codex du 21/11).
 */
const mockStockage = new Map<string, string>();
const mockRegister = jest.fn();
const mockUnregister = jest.fn();
const mockRetirer = jest.fn();
const mockGetToken = jest.fn();
let mockEcouteurJeton: (() => void) | null = null;

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { isDevice: true, expoConfig: { extra: { eas: { projectId: 'projet' } } } },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStockage.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStockage.set(k, v),
    removeItem: async (k: string) => void mockStockage.delete(k),
  },
}));
// L'alias `@lib` n'est pas résolu par Jest ici : module virtuel.
jest.mock(
  '@lib/api/mobile-api',
  () => ({
    apiRegisterPushToken: (...a: unknown[]) => mockRegister(...a),
    apiUnregisterPushToken: (...a: unknown[]) => mockUnregister(...a),
    apiRetirerJetonPush: (...a: unknown[]) => mockRetirer(...a),
  }),
  { virtual: true },
);
jest.mock('expo-notifications', () => ({
  setNotificationHandler: () => undefined,
  getPermissionsAsync: async () => ({ status: 'granted' }),
  requestPermissionsAsync: async () => ({ status: 'granted' }),
  getExpoPushTokenAsync: () => mockGetToken(),
  addPushTokenListener: (cb: () => void) => {
    mockEcouteurJeton = cb;
    return { remove: () => (mockEcouteurJeton = null) };
  },
}));

import {
  ecouterRenouvellementJeton,
  enregistrerPush,
  oublierPush,
  rejouerRetraitEnAttente,
} from '../push-notifications';

const CLE = 'push:retrait-en-attente';
const JETON = 'ExponentPushToken[appareil]';

beforeEach(async () => {
  mockStockage.clear();
  [mockRegister, mockUnregister, mockRetirer, mockGetToken].forEach((m) => m.mockReset());
  mockGetToken.mockResolvedValue({ data: JETON });
  // Repart d'un module sans jeton retenu.
  mockUnregister.mockResolvedValue(undefined);
  await oublierPush();
  mockUnregister.mockReset();
});

describe('déconnexion sans réseau', () => {
  it('garde le jeton à retirer quand le retrait échoue', async () => {
    await enregistrerPush();
    mockUnregister.mockRejectedValueOnce(new Error('hors ligne'));
    await oublierPush();
    expect(mockStockage.get(CLE)).toBe(JETON);
  });

  it('ne garde rien quand le retrait réussit', async () => {
    await enregistrerPush();
    mockUnregister.mockResolvedValueOnce(undefined);
    await oublierPush();
    expect(mockStockage.has(CLE)).toBe(false);
  });

  it('rejoue le retrait plus tard, puis l’oublie', async () => {
    mockStockage.set(CLE, JETON);
    mockRetirer.mockResolvedValueOnce(undefined);
    await rejouerRetraitEnAttente();
    expect(mockRetirer).toHaveBeenCalledWith(JETON);
    expect(mockStockage.has(CLE)).toBe(false);
  });

  it('garde le retrait si le réseau manque encore', async () => {
    mockStockage.set(CLE, JETON);
    mockRetirer.mockRejectedValueOnce(new Error('hors ligne'));
    await rejouerRetraitEnAttente();
    expect(mockStockage.get(CLE)).toBe(JETON);
  });

  it('un nouveau compte qui reprend l’appareil efface le retrait en attente : il ne perdra pas son jeton', async () => {
    mockStockage.set(CLE, JETON);
    mockRegister.mockResolvedValueOnce(undefined);
    await enregistrerPush();
    expect(mockRegister).toHaveBeenCalledWith(JETON, 'ios');
    expect(mockStockage.has(CLE)).toBe(false);
    await rejouerRetraitEnAttente();
    expect(mockRetirer).not.toHaveBeenCalled();
  });
});

describe('renouvellement du jeton', () => {
  it('réenregistre le nouveau jeton dès que le système le renouvelle', async () => {
    await enregistrerPush();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    const arreter = ecouterRenouvellementJeton();
    mockGetToken.mockResolvedValue({ data: 'ExponentPushToken[nouveau]' });
    mockEcouteurJeton?.();
    await new Promise<void>((r) => setImmediate(() => r()));
    expect(mockRegister).toHaveBeenLastCalledWith('ExponentPushToken[nouveau]', 'ios');

    arreter();
    expect(mockEcouteurJeton).toBeNull();
  });
});
