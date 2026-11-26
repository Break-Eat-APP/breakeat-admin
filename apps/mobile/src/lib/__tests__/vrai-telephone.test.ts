/**
 * BUG-2026-056 (26/11/2026) : `Constants.isDevice` n'existe plus (SDK 57) ; il
 * valait `undefined`, et l'app se croyait sur un simulateur sur tous les
 * téléphones — aucune notification n'était jamais enregistrée.
 */
const mockConstants: { isDevice?: boolean } = {};
let mockOs = 'ios';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOs;
    },
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

import { estUnVraiTelephone } from '../vrai-telephone';

describe('vrai téléphone ou simulateur', () => {
  beforeEach(() => {
    delete mockConstants.isDevice;
    mockOs = 'ios';
  });

  it('isDevice ABSENT (SDK 57, le cas réel) : c’est un téléphone', () => {
    expect(estUnVraiTelephone()).toBe(true);
  });

  it('isDevice à faux, dit explicitement : simulateur', () => {
    mockConstants.isDevice = false;
    expect(estUnVraiTelephone()).toBe(false);
  });

  it('le web n’est jamais un téléphone', () => {
    mockOs = 'web';
    expect(estUnVraiTelephone()).toBe(false);
  });
});
