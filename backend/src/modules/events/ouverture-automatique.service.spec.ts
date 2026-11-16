import { EventStatus, SupplierStatus } from '@prisma/client';
import { OuvertureAutomatiqueService } from './ouverture-automatique.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * L'ouverture et la fermeture automatiques (16/11/2026).
 *
 * Le concert commence le samedi 21/11 à 20:00 (heure de Paris), le lieu ouvre
 * la commande à 08:00 : la bascule doit avoir lieu à 08:00 heure de Paris,
 * soit 07:00 UTC — ni avant, ni deux fois.
 */
describe('OuvertureAutomatiqueService', () => {
  const DEBUT = new Date('2026-11-21T19:00:00Z'); // 20:00 à Paris
  const OUVERTURE = new Date('2026-11-21T07:00:00Z'); // 08:00 à Paris

  function service(prisma: Record<string, unknown>) {
    return new OuvertureAutomatiqueService(prisma as unknown as PrismaService);
  }

  const evenement = {
    id: 'concert',
    name: 'Christophe Maé',
    startAt: DEBUT,
    venue: { ordersOpenAt: '08:00', timezone: 'Europe/Paris' },
    eventSuppliers: [{ supplierId: 'nord' }, { supplierId: 'sud' }],
  };

  function prismaOuverture(bascule = 1) {
    return {
      event: {
        findMany: jest.fn().mockResolvedValue([evenement]),
        updateMany: jest.fn().mockResolvedValue({ count: bascule }),
      },
      supplier: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
  }

  describe('ouverture', () => {
    it('à l’heure d’ouverture du lieu : l’événement devient Actif, ses points de retrait FERMÉS s’ouvrent', async () => {
      const prisma = prismaOuverture();

      const n = await service(prisma).ouvrir(new Date(OUVERTURE.getTime() + 60_000));

      expect(n).toBe(1);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: 'concert', status: EventStatus.DRAFT },
        data: { status: EventStatus.ACTIVE },
      });
      // Seuls les FERMÉS s'ouvrent : un point en pause ou hors ligne reste tel quel.
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['nord', 'sud'] }, status: SupplierStatus.CLOSED },
        data: { status: SupplierStatus.OPEN },
      });
    });

    it('pas une minute avant', async () => {
      const prisma = prismaOuverture();

      const n = await service(prisma).ouvrir(new Date(OUVERTURE.getTime() - 60_000));

      expect(n).toBe(0);
      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(prisma.supplier.updateMany).not.toHaveBeenCalled();
    });

    it('un autre serveur (ou le club) a déjà basculé : on ne touche pas aux points de retrait', async () => {
      const prisma = prismaOuverture(0);

      const n = await service(prisma).ouvrir(new Date(OUVERTURE.getTime() + 60_000));

      expect(n).toBe(0);
      expect(prisma.supplier.updateMany).not.toHaveBeenCalled();
    });

    it('ne lit que les brouillons BreakEat, avec un point de retrait, hors service continu', async () => {
      const prisma = prismaOuverture();
      const maintenant = new Date(OUVERTURE.getTime() + 60_000);

      await service(prisma).ouvrir(maintenant);

      const filtre = prisma.event.findMany.mock.calls[0][0].where;
      expect(filtre.status).toBe(EventStatus.DRAFT);
      expect(filtre.isPermanentContainer).toBe(false);
      expect(filtre.venue).toEqual({ flaixEnabled: false });
      expect(filtre.eventSuppliers).toEqual({ some: {} });
      expect(filtre.endAt).toEqual({ gt: maintenant });
    });

    it('un événement qui commence AVANT l’heure d’ouverture ouvre à son début', async () => {
      const tot = { ...evenement, startAt: new Date('2026-11-21T06:00:00Z') }; // 07:00 à Paris
      const prisma = prismaOuverture();
      prisma.event.findMany.mockResolvedValue([tot]);

      expect(await service(prisma).ouvrir(new Date('2026-11-21T06:00:30Z'))).toBe(1);
    });
  });

  describe('fermeture', () => {
    const FIN = new Date('2026-11-21T22:00:00Z');

    function prismaFermeture(encoreUtiles: { supplierId: string }[] = []) {
      return {
        event: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'concert', name: 'Christophe Maé', status: EventStatus.ACTIVE, eventSuppliers: [{ supplierId: 'nord' }, { supplierId: 'sud' }] },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        eventSupplier: { findMany: jest.fn().mockResolvedValue(encoreUtiles) },
        supplier: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
    }

    it('à la fin : Terminé, et ses points de retrait OUVERTS se ferment', async () => {
      const prisma = prismaFermeture();

      const n = await service(prisma).fermer(FIN);

      expect(n).toBe(1);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: 'concert', status: EventStatus.ACTIVE },
        data: { status: EventStatus.ENDED },
      });
      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['nord', 'sud'] }, status: SupplierStatus.OPEN },
        data: { status: SupplierStatus.CLOSED },
      });
    });

    it('un point de retrait qui sert encore un autre événement reste ouvert', async () => {
      const prisma = prismaFermeture([{ supplierId: 'nord' }]);

      await service(prisma).fermer(FIN);

      expect(prisma.supplier.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['sud'] }, status: SupplierStatus.OPEN },
        data: { status: SupplierStatus.CLOSED },
      });
    });

    it('ne ferme que les événements BreakEat arrivés à leur fin, hors service continu', async () => {
      const prisma = prismaFermeture();

      await service(prisma).fermer(FIN);

      const filtre = prisma.event.findMany.mock.calls[0][0].where;
      expect(filtre.status).toEqual({ in: [EventStatus.ACTIVE, EventStatus.PAUSED] });
      expect(filtre.isPermanentContainer).toBe(false);
      expect(filtre.endAt).toEqual({ lte: FIN });
      expect(filtre.venue).toEqual({ flaixEnabled: false });
    });
  });
});
