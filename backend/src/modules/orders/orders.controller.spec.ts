import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole, OrgRole } from '../../common/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Le board applique l'épinglage à la buvette EN LECTURE depuis la phase 12.9.
 * Ces tests couvrent l'écriture : une règle appliquée d'un seul côté ne protège
 * rien, puisqu'il suffit d'appeler l'API directement avec l'identifiant d'une
 * commande voisine.
 */
describe('OrdersController — qui peut faire avancer une commande', () => {
  let controller: OrdersController;
  let prisma: {
    order: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    organizationMember: { findUnique: jest.Mock };
  };
  let orders: { transition: jest.Mock };

  const ORDER = 'order-nord';
  const ORG = 'org-1';
  const NORD = 'sup-nord';
  const SUD = 'sup-sud';
  const utilisateur = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: ORG, supplierId: NORD }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ globalRole: GlobalRole.CUSTOMER }) },
      organizationMember: { findUnique: jest.fn() },
    };
    orders = { transition: jest.fn().mockResolvedValue({ id: ORDER }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: orders },
      ],
    }).compile();

    controller = module.get(OrdersController);
  });

  const membre = (orgRole: OrgRole, supplierId: string | null = null) =>
    prisma.organizationMember.findUnique.mockResolvedValue({ orgRole, supplierId });

  it('laisse passer une opératrice épinglée à LA buvette de la commande', async () => {
    membre(OrgRole.OPERATOR, NORD);
    await controller.markReady(ORDER, {}, utilisateur);
    expect(orders.transition).toHaveBeenCalledWith(
      ORDER,
      OrderStatus.READY,
      expect.anything(),
      utilisateur.sub,
      undefined,
    );
  });

  it('refuse la commande d’une AUTRE buvette — le trou que le board masquait', async () => {
    membre(OrgRole.OPERATOR, SUD);
    await expect(controller.markReady(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(orders.transition).not.toHaveBeenCalled();
  });

  it('laisse passer un membre non épinglé (polyvalent sur tous les comptoirs)', async () => {
    membre(OrgRole.MANAGER, null);
    await controller.markReady(ORDER, {}, utilisateur);
    expect(orders.transition).toHaveBeenCalled();
  });

  it('refuse MARKETING : ce poste ne tient aucun comptoir', async () => {
    membre(OrgRole.MARKETING, null);
    await expect(controller.markReady(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(orders.transition).not.toHaveBeenCalled();
  });

  it('refuse un non-membre de l’organisation', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    await expect(controller.markReady(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('laisse passer un SUPER_ADMIN sans appartenance (support, incident)', async () => {
    prisma.user.findUnique.mockResolvedValue({ globalRole: GlobalRole.SUPER_ADMIN });
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    await controller.markReady(ORDER, {}, utilisateur);
    expect(orders.transition).toHaveBeenCalled();
  });

  it('renvoie 404 sur une commande inexistante, sans rien révéler d’autre', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(controller.markReady(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applique la même règle à CHAQUE transition, pas seulement à « prête »', async () => {
    membre(OrgRole.OPERATOR, SUD);
    await expect(controller.accept(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.startPreparing(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.markPickedUp(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.cancel(ORDER, {}, utilisateur)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(orders.transition).not.toHaveBeenCalled();
  });
});
