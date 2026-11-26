/**
 * LA CATÉGORIE ANDROID « COMMANDES » (26/11/2026) : créée une fois, sur
 * Android seulement ; un échec n'empêche rien.
 */
let mockOs = 'android';
const mockCreer = jest.fn();

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOs;
    },
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: (...a: unknown[]) => mockCreer(...a),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

describe('catégorie « Commandes »', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreer.mockReset();
    mockOs = 'android';
  });

  it('Android : créée en importance haute, avec le son', async () => {
    mockCreer.mockResolvedValue({ id: 'commandes' });
    const { creerCanalCommandes } = require('../canal-commandes') as typeof import('../canal-commandes');
    expect(await creerCanalCommandes()).toBe(true);
    expect(mockCreer).toHaveBeenCalledWith('commandes', expect.objectContaining({ importance: 4, sound: 'default' }));
    // Une seule création, même appelée deux fois.
    await creerCanalCommandes();
    expect(mockCreer).toHaveBeenCalledTimes(1);
  });

  it('iPhone : rien à créer', async () => {
    mockOs = 'ios';
    const { creerCanalCommandes } = require('../canal-commandes') as typeof import('../canal-commandes');
    expect(await creerCanalCommandes()).toBe(false);
    expect(mockCreer).not.toHaveBeenCalled();
  });

  it('un échec rend « non », sans exception', async () => {
    mockCreer.mockRejectedValue(new Error('refus'));
    const { creerCanalCommandes } = require('../canal-commandes') as typeof import('../canal-commandes');
    expect(await creerCanalCommandes()).toBe(false);
  });
});
