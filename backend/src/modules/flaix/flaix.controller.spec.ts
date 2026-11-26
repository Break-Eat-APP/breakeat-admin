import { FlaixController } from './flaix.controller';
import type { CommandeFlaix } from './commandes-client-flaix.service';

/**
 * L'IMAGE DU LIEU SUR LE TICKET FLAIX (26/11/2026) : retrouvée par l'événement
 * importé, sinon par le nom court du lieu ; une copie, jamais la liste en cache.
 */
const commande = (p: Partial<CommandeFlaix>): CommandeFlaix =>
  ({ id: 'j', numero: '1', passeeLe: '2026-11-26T00:00:00Z', lieu: 'Stade', ...p }) as CommandeFlaix;

describe('FlaixController — image du lieu sur les commandes Flaix', () => {
  it('par l’événement importé d’abord, puis par le lieu ; sinon rien', async () => {
    const enCache = [
      commande({ id: 'a', evenementId: '113', lieuId: 'stade-marie-marvingt' }),
      commande({ id: 'b', evenementId: '999', lieuId: 'guillaume-stadium' }),
      commande({ id: 'c', evenementId: null, lieuId: 'inconnu' }),
    ];
    const prisma = {
      user: { findUnique: async () => ({ email: 'client@test.fr' }) },
      event: {
        findMany: async () => [
          { flaixEventId: '113', venue: { photoUrl: 'https://img/lemans.jpg', organization: { logoUrl: 'https://img/club.png' } } },
        ],
      },
      venue: {
        findMany: async () => [
          { flaixVenueId: 'guillaume-stadium', photoUrl: null, organization: { logoUrl: 'https://img/guillaume.png' } },
        ],
      },
    };
    const ctrl = new FlaixController(
      {} as never,
      prisma as never,
      { pourEmail: async () => ({ active: true, commandes: enCache }) } as never,
      { surveiller: async () => undefined } as never,
    );

    const r = await ctrl.mesCommandes({ sub: 'u1' } as never);
    expect(r.commandes.map((c) => [c.id, c.lieuPhotoUrl ?? null, c.lieuLogoUrl ?? null])).toEqual([
      ['a', 'https://img/lemans.jpg', 'https://img/club.png'],
      ['b', null, 'https://img/guillaume.png'],
      ['c', null, null],
    ]);
    // La liste en cache n'est pas modifiée.
    expect(enCache[0].lieuPhotoUrl).toBeUndefined();
  });
});
