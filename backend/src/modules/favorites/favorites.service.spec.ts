import { FavoritesService } from './favorites.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * La copie serveur des favoris : le téléphone envoie SA liste, le serveur s'y
 * aligne. Rejouer la même demande ne change rien.
 */
describe('FavoritesService — remplacer la liste', () => {
  const MOI = 'dddddddd-4444-4444-8444-444444444444';
  const VELODROME = 'aaaaaaaa-1111-4111-8111-111111111111';
  const ARENA = 'bbbbbbbb-2222-4222-8222-222222222222';
  const SUPPRIME = 'eeeeeeee-5555-4555-8555-555555555555';

  function monter(lieuxExistants: string[]) {
    const deleteMany = jest.fn().mockReturnValue('effacer');
    const createMany = jest.fn().mockReturnValue('ecrire');
    const prisma = {
      venue: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
            Promise.resolve(
              where.id.in.filter((id) => lieuxExistants.includes(id)).map((id) => ({ id })),
            ),
          ),
      },
      venueFavorite: { deleteMany, createMany },
      $transaction: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    return { service: new FavoritesService(prisma), prisma, deleteMany, createMany };
  }

  it('garde les lieux connus, dans l’ordre du téléphone, et écarte les autres', async () => {
    const { service } = monter([VELODROME, ARENA]);
    const r = await service.remplacer(MOI, [ARENA, SUPPRIME, VELODROME]);
    expect(r.venueIds).toEqual([ARENA, VELODROME]);
  });

  it('efface ce qui n’est plus dans la liste et écrit le reste, en UNE transaction', async () => {
    const { service, prisma, deleteMany, createMany } = monter([VELODROME]);
    await service.remplacer(MOI, [VELODROME]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: MOI, venueId: { notIn: [VELODROME] } },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ userId: MOI, venueId: VELODROME }],
      skipDuplicates: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['effacer', 'ecrire']);
  });

  it('une liste vide efface tout, sans interroger les lieux', async () => {
    const { service, prisma, deleteMany } = monter([]);
    const r = await service.remplacer(MOI, []);
    expect(r.venueIds).toEqual([]);
    expect(prisma.venue.findMany).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: MOI, venueId: { notIn: [] } } });
  });

  it('un doublon envoyé par le téléphone ne compte qu’une fois', async () => {
    const { service } = monter([VELODROME]);
    const r = await service.remplacer(MOI, [VELODROME, VELODROME]);
    expect(r.venueIds).toEqual([VELODROME]);
  });

  it('n’écrit que pour le client du jeton', async () => {
    const { service, createMany } = monter([VELODROME]);
    await service.remplacer(MOI, [VELODROME]);
    const data = createMany.mock.calls[0][0].data as { userId: string }[];
    expect(data.every((d) => d.userId === MOI)).toBe(true);
  });
});
