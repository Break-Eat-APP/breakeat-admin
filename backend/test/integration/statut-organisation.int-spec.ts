/**
 * Un club suspendu ne reçoit plus de clients.
 *
 * « Désactiver » dans le back-office ne changeait qu'une étiquette : le statut
 * n'était lu nulle part, et un club suspendu restait visible et commandable.
 * Ces tests tiennent la règle par ses quatre portes : la découverte,
 * l'événement, la carte, et le panier — création comme paiement.
 *
 * Base réelle : ce sont de vraies requêtes Prisma, avec le filtre tel qu'il est
 * écrit dans le code de recherche.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VenueStatus } from '@prisma/client';
import { PublicVenuesController } from '../../src/modules/venues/public-venues.controller';
import { PublicEventsController } from '../../src/modules/events/public-events.controller';
import { CartService } from '../../src/modules/cart/cart.service';
import {
  assertOrganisationOuverte,
  organisationOuverte,
} from '../../src/common/helpers/organisation-ouverte';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('statut d’organisation (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);

  // Le groupe dit oui à tout : ce qui est testé ici est le STATUT du club, pas
  // la visibilité d'un événement privé (couverte ailleurs).
  const groups = { canAccessEvent: async () => true };
  const lieux = url ? new PublicVenuesController(s.prisma) : (null as never);
  const evenements = url
    ? new PublicEventsController(s.prisma, groups as never, { ensureTodaySlots: async () => [] } as never)
    : (null as never);
  const paniers = url
    ? new CartService(
        s.prisma,
        {} as never,
        groups as never,
        {
          // La fidélité n'est pas le sujet : elle répond « désactivée » partout.
          getConfigForVenue: async () => ({ enabled: false }),
          getBalance: async () => 0,
          discountForPoints: () => ({ pointsUsed: 0, discountCents: 0 }),
        } as never,
        {} as never,
        { get: () => undefined } as never,
      )
    : (null as never);

  let sa: string;
  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: `${unique('sa')}@test.fr`,
          passwordHash: 'x',
          displayName: 'SA',
          globalRole: 'SUPER_ADMIN',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  /** Un club complet, avec un lieu trouvable par la recherche. */
  async function club(options: { suspendu?: boolean } = {}) {
    const motCle = unique('stade');
    const o = await creerOrganisationComplete(s.prisma, motCle, sa);
    await s.prisma.venue.update({
      where: { id: o.venue.id },
      data: { name: motCle, status: VenueStatus.ACTIVE },
    });
    if (options.suspendu) {
      await s.backoffice.setOrganizationStatus(o.org.id, false);
    }
    return { ...o, motCle };
  }

  /**
   * La VRAIE recherche de l'application — le contrôleur lui-même.
   *
   * Rejouer le filtre à la main prouverait qu'il fonctionne, pas qu'il est
   * branché : c'est justement ce qui manquait avant, le statut existait sans
   * être lu nulle part.
   */
  async function chercher(terme: string) {
    return lieux.search(undefined, terme);
  }

  it('un club EN SERVICE reste trouvable, visible et commandable', async () => {
    const c = await club();

    expect(await chercher(c.motCle)).toHaveLength(1);
    await expect(evenements.findEvent(c.event.id)).resolves.toBeDefined();
    expect(await organisationOuverte(s.prisma, c.org.id)).toBe(true);
  });

  it('un club SUSPENDU disparaît de la recherche', async () => {
    const c = await club({ suspendu: true });
    expect(await chercher(c.motCle)).toHaveLength(0);
  });

  it('son événement devient introuvable, sans dire pourquoi', async () => {
    const c = await club({ suspendu: true });

    // 404 et non 403 : l'état du compte d'un club ne regarde pas le public.
    await expect(evenements.findEvent(c.event.id)).rejects.toThrow(NotFoundException);
    await expect(evenements.findProducts(c.event.id, c.supplier.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aucun panier ne s’ouvre, et le message s’adresse au client', async () => {
    const c = await club({ suspendu: true });
    const client = await s.prisma.user.create({
      data: { email: `${unique('client')}@test.fr`, passwordHash: 'x', displayName: 'Jo' },
    });

    const tentative = paniers.create(client.id, {
      eventId: c.event.id,
      supplierId: c.supplier.id,
    } as never);

    await expect(tentative).rejects.toThrow(BadRequestException);
    await expect(tentative).rejects.toThrow(/ne prend pas de commande/);
  });

  it('un panier ouvert AVANT la suspension ne se paie plus après', async () => {
    const c = await club();
    const client = await s.prisma.user.create({
      data: { email: `${unique('client')}@test.fr`, passwordHash: 'x', displayName: 'Jo' },
    });
    const panier = await paniers.create(client.id, {
      eventId: c.event.id,
      supplierId: c.supplier.id,
    } as never);

    await s.backoffice.setOrganizationStatus(c.org.id, false);

    await expect(paniers.checkout(panier.id, client.id, {} as never)).rejects.toThrow(
      /ne prend pas de commande/,
    );
  });

  it('réactivé, le club redevient trouvable et commandable', async () => {
    const c = await club({ suspendu: true });
    await s.backoffice.setOrganizationStatus(c.org.id, true);

    expect(await chercher(c.motCle)).toHaveLength(1);
    await expect(assertOrganisationOuverte(s.prisma, c.org.id)).resolves.toBeUndefined();
  });

  it('la suspension ne ferme PAS les écrans de l’équipe : les commandes payées restent servables', async () => {
    const c = await club({ suspendu: true });
    const client = await s.prisma.user.create({
      data: { email: `${unique('client')}@test.fr`, passwordHash: 'x', displayName: 'Jo' },
    });
    const commande = await s.prisma.order.create({
      data: {
        publicOrderNumber: unique('BE'),
        userId: client.id,
        organizationId: c.org.id,
        eventId: c.event.id,
        venueId: c.venue.id,
        supplierId: c.supplier.id,
        pickupPointId: c.pickup.id,
        status: 'PREPARING',
        subtotalCents: 700,
        totalCents: 700,
      },
    });

    // Le tableau du comptoir continue de la voir : un client a payé, il attend.
    const { OrdersService } = await import('../../src/modules/orders/orders.service');
    const tableau = await OrdersService.prototype.findDashboardByEvent.call(
      { prisma: s.prisma } as never,
      c.event.id,
      c.supplier.id,
    );
    expect(JSON.stringify(tableau)).toContain(commande.id);
  });
});
