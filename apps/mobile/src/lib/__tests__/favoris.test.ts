/**
 * LA COPIE SERVEUR DES FAVORIS (21/11/2026).
 *
 * Le téléphone fait foi ; le serveur reçoit sa liste quand le client est
 * connecté, pour que les campagnes d'un lieu atteignent ceux qui le suivent.
 */
const mockSetItem = jest.fn();
const mockRemplacer = jest.fn();
let mockToken: string | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: (...a: unknown[]) => mockSetItem(...a) },
}));
// L'alias `@lib` / `@store` n'est pas résolu par Jest ici : modules virtuels.
jest.mock(
  '@lib/api/mobile-api',
  () => ({ apiRemplacerFavoris: (...a: unknown[]) => mockRemplacer(...a) }),
  { virtual: true },
);
jest.mock(
  '@store/auth.store',
  () => ({ useAuthStore: { getState: () => ({ token: mockToken }) } }),
  { virtual: true },
);

import { ecrireFavoris, envoyerFavoris, type LieuFavori } from '../favoris';

const velodrome: LieuFavori = { id: 'v1', name: 'Vélodrome', photoUrl: null, imageUrl: null };
const arena: LieuFavori = { id: 'v2', name: 'Aréna', photoUrl: null, imageUrl: null };

beforeEach(() => {
  mockSetItem.mockReset().mockResolvedValue(undefined);
  mockRemplacer.mockReset().mockResolvedValue(undefined);
  mockToken = null;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

it('connecté : la liste entière part au serveur, en identifiants', async () => {
  mockToken = 'jeton';
  await ecrireFavoris([velodrome, arena]);
  expect(mockSetItem).toHaveBeenCalled();
  expect(mockRemplacer).toHaveBeenCalledWith(['v1', 'v2']);
});

it('visiteur anonyme : rien ne part, le favori reste sur le téléphone', async () => {
  await ecrireFavoris([velodrome]);
  expect(mockSetItem).toHaveBeenCalled();
  expect(mockRemplacer).not.toHaveBeenCalled();
});

it('une liste vidée part aussi : le serveur doit oublier les anciens favoris', async () => {
  mockToken = 'jeton';
  await envoyerFavoris([]);
  expect(mockRemplacer).toHaveBeenCalledWith([]);
});

it('un réseau coupé ne lève pas : le cœur ne doit jamais casser', async () => {
  mockToken = 'jeton';
  mockRemplacer.mockRejectedValue(new Error('réseau'));
  await expect(ecrireFavoris([velodrome])).resolves.toBeUndefined();
});

it('un stockage local en panne n’empêche pas la copie serveur', async () => {
  mockToken = 'jeton';
  mockSetItem.mockRejectedValue(new Error('disque'));
  await ecrireFavoris([velodrome]);
  expect(mockRemplacer).toHaveBeenCalledWith(['v1']);
});
