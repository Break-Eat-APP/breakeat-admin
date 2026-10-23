import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { OrdersService } from './orders.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * NOTER SA COMMANDE — et les trois façons d'obtenir une note qui ne vaut rien.
 *
 * Une note mal gardée ne produit pas une erreur, elle produit un chiffre FAUX.
 * Le club le lit, en tire une conclusion sur sa buvette, et personne ne saura
 * jamais que la mesure était biaisée. C'est pourquoi ces gardes se testent.
 */
describe('OrdersService — la note d’une commande', () => {
  const COMMANDE = 'aaaaaaaa-1111-4111-8111-111111111111';
  const MOI = 'user-1';

  function monter(
    opts: { commande?: Record<string, unknown> | null; dejaNotee?: boolean } = {},
  ) {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(
          opts.commande === undefined
            ? {
                id: COMMANDE,
                status: OrderStatus.PICKED_UP,
                supplierId: 'sup-1',
                organizationId: 'org-1',
                venueId: 'venue-1',
              }
            : opts.commande,
        ),
      },
      orderRating: {
        findUnique: jest.fn().mockResolvedValue(opts.dejaNotee ? { id: 'r-1' } : null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'r-neuf', stars: data.stars, comment: data.comment, createdAt: new Date() }),
        ),
      },
    };
    // Le service a d'autres dependances, inutiles pour cette methode. On
    // construit l'objet sans passer par le constructeur plutot que d'inventer
    // une douzaine de mocks qui ne servent a rien : ce test porte sur UNE
    // methode, et elle ne touche que Prisma.
    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service, {
      prisma,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    return { service, prisma };
  }

  it('enregistre la note sur la BUVETTE qui a préparé', async () => {
    const { service, prisma } = monter();

    await service.noterCommande(COMMANDE, MOI, { stars: 5, comment: 'Parfait' });

    const data = prisma.orderRating.create.mock.calls[0][0].data;
    // C'est la buvette qui a fait le travail, et c'est au club que
    // l'information sert — pas une note sur Break Eat.
    expect(data.supplierId).toBe('sup-1');
    expect(data.organizationId).toBe('org-1');
    expect(data.stars).toBe(5);
    expect(data.comment).toBe('Parfait');
  });

  it('le commentaire est FACULTATIF, et un commentaire vide reste nul', async () => {
    const { service, prisma } = monter();

    await service.noterCommande(COMMANDE, MOI, { stars: 4, comment: '   ' });

    // Sans cela, un écran afficherait un cadre de citation vide — et le club
    // croirait qu'un client a écrit quelque chose.
    expect(prisma.orderRating.create.mock.calls[0][0].data.comment).toBeNull();
  });

  it('REFUSE une commande pas encore récupérée', async () => {
    const { service, prisma } = monter({
      commande: {
        id: COMMANDE,
        status: OrderStatus.PREPARING,
        supplierId: 'sup-1',
        organizationId: 'org-1',
        venueId: 'v',
      },
    });

    // Noter un plat qu'on n'a pas eu ne mesure rien, et la buvette se verrait
    // reprocher une attente qui n'est pas finie.
    await expect(service.noterCommande(COMMANDE, MOI, { stars: 1 })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.orderRating.create).not.toHaveBeenCalled();
  });

  it('accepte une commande CLÔTURÉE, pas seulement récupérée', async () => {
    const { service } = monter({
      commande: {
        id: COMMANDE,
        status: OrderStatus.COMPLETED,
        supplierId: 'sup-1',
        organizationId: 'org-1',
        venueId: 'v',
      },
    });

    await expect(service.noterCommande(COMMANDE, MOI, { stars: 3 })).resolves.toMatchObject({
      stars: 3,
    });
  });

  it('REFUSE une seconde note sur la même commande', async () => {
    const { service, prisma } = monter({ dejaNotee: true });

    await expect(service.noterCommande(COMMANDE, MOI, { stars: 5 })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.orderRating.create).not.toHaveBeenCalled();
  });

  it('une commande qui n’est pas la sienne répond 404, pas 403', async () => {
    const { service, prisma } = monter({ commande: null });

    // Distinguer les deux révélerait l'existence d'une commande à qui n'y a
    // pas droit.
    await expect(service.noterCommande(COMMANDE, 'un-autre', { stars: 5 })).rejects.toThrow(
      NotFoundException,
    );
    // La lecture est filtrée sur les DEUX identifiants : c'est elle qui porte
    // la garde, pas un test de propriété fait après coup.
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({
      id: COMMANDE,
      userId: 'un-autre',
    });
  });
});
