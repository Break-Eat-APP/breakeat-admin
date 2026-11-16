import { PickupPointStatus } from '@prisma/client';
import { assurerLesComptoirs } from './rattachement-buvettes';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Le comptoir par défaut (16/11/2026) : chaque point de retrait rattaché à un
 * événement reçoit, s'il n'en a aucun, un comptoir qui porte SON nom.
 */
describe('assurerLesComptoirs', () => {
  function prisma(existants: { eventId: string; supplierId: string }[] = []) {
    return {
      event: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'match', organizationId: 'club', venueId: 'stade' },
        ]),
      },
      supplier: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'nord', name: 'Buvette Nord' },
          { id: 'sud', name: 'Buvette Sud' },
        ]),
      },
      pickupPoint: {
        findMany: jest.fn().mockResolvedValue(existants),
        createMany: jest.fn().mockResolvedValue({ count: 2 - existants.length }),
      },
    };
  }

  it('crée un comptoir au NOM du point de retrait, pour chacun', async () => {
    const p = prisma();

    await assurerLesComptoirs(p as unknown as PrismaService, ['match'], ['nord', 'sud']);

    expect(p.pickupPoint.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: 'club', venueId: 'stade', eventId: 'match', supplierId: 'nord', name: 'Buvette Nord' },
        { organizationId: 'club', venueId: 'stade', eventId: 'match', supplierId: 'sud', name: 'Buvette Sud' },
      ],
    });
  });

  it('ne double pas un comptoir actif déjà là', async () => {
    const p = prisma([{ eventId: 'match', supplierId: 'nord' }]);

    await assurerLesComptoirs(p as unknown as PrismaService, ['match'], ['nord', 'sud']);

    const data = p.pickupPoint.createMany.mock.calls[0][0].data;
    expect(data.map((d: { supplierId: string }) => d.supplierId)).toEqual(['sud']);
    // Seuls les comptoirs ACTIFS comptent comme « déjà là ».
    expect(p.pickupPoint.findMany.mock.calls[0][0].where.status).toBe(PickupPointStatus.ACTIVE);
  });

  it('ne crée rien quand chacun a déjà le sien', async () => {
    const p = prisma([
      { eventId: 'match', supplierId: 'nord' },
      { eventId: 'match', supplierId: 'sud' },
    ]);

    expect(await assurerLesComptoirs(p as unknown as PrismaService, ['match'], ['nord', 'sud'])).toBe(0);
    expect(p.pickupPoint.createMany).not.toHaveBeenCalled();
  });

  it('ignore le service continu (son contenant n’est pas lu)', async () => {
    const p = prisma();

    await assurerLesComptoirs(p as unknown as PrismaService, ['match'], ['nord']);

    expect(p.event.findMany.mock.calls[0][0].where.isPermanentContainer).toBe(false);
  });
});
