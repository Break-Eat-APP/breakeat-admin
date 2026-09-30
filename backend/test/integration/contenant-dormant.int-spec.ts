/**
 * LE CONTENANT D'UN LIEU OUVERT EN CONTINU, quand le lieu ne l'est plus.
 *
 * Un lieu permanent porte un événement INVISIBLE qui reçoit ses commandes. Le
 * jour où il repasse en mode événementiel, ce contenant est conservé — les
 * commandes déjà passées y sont rattachées — mais il ne doit plus rien
 * accepter. Il n'apparaît dans aucune liste : seul un ancien lien profond y
 * mène encore, et c'est précisément ce chemin-là qu'il faut fermer.
 *
 * Sur une VRAIE base, parce que la propriété se joue entre deux services (le
 * lieu qui change de mode, le panier qui accepte ou refuse) et sur l'état
 * réellement écrit en base.
 */
import { EventStatus, VenueOperatingMode } from '@prisma/client';
import { CartService } from '../../src/modules/cart/cart.service';
import { VenuesService } from '../../src/modules/venues/venues.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('contenant d’un lieu ouvert en continu (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const lieux = url ? new VenuesService(s.prisma) : (null as never);
  const paniers = url
    ? new CartService(
        s.prisma,
        {} as never,
        { canAccessEvent: async () => true } as never,
        {
          getConfigForVenue: async () => ({ enabled: false, pointValueCents: 0 }),
          getBalance: async () => 0,
          discountForPoints: () => ({ pointsUsed: 0, discountCents: 0 }),
        } as never,
        {} as never,
        { get: () => undefined } as never,
      )
    : (null as never);

  let sa: string;
  let client: string;

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
    client = (
      await s.prisma.user.create({
        data: {
          email: `${unique('client')}@test.fr`,
          passwordHash: 'x',
          displayName: 'Client',
          globalRole: 'CUSTOMER',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  /** Un lieu ouvert en continu, avec sa buvette et son produit. */
  async function lieuPermanent() {
    const o = await creerOrganisationComplete(s.prisma, unique('bar'), sa);
    // `creerOrganisationComplete` fabrique déjà un lieu PERMANENT et son
    // contenant : on le retrouve plutôt que d'en créer un second.
    const contenant = await s.prisma.event.findFirstOrThrow({
      where: { venueId: o.venue.id, isPermanentContainer: true },
    });
    return { ...o, contenant };
  }

  it('le contenant s’ENDORT quand le lieu repasse en événementiel', async () => {
    const o = await lieuPermanent();
    expect(o.contenant.status).toBe(EventStatus.ACTIVE);

    await lieux.update(o.org.id, o.venue.id, sa, {
      operatingMode: VenueOperatingMode.EVENT_BASED,
    });

    const relu = await s.prisma.event.findUniqueOrThrow({ where: { id: o.contenant.id } });
    expect(relu.status).toBe(EventStatus.PAUSED);
    // Conservé, jamais supprimé : les commandes passées y sont rattachées.
    expect(relu.id).toBe(o.contenant.id);
  });

  it('un ancien lien profond ne permet PLUS d’ouvrir un panier', async () => {
    // Le défaut trouvé à l'audit : le contenant restait ACTIVE, donc
    // commandable, alors qu'aucun écran ne le montrait plus.
    const o = await lieuPermanent();

    const avant = await paniers.create(client, {
      eventId: o.contenant.id,
      supplierId: o.supplier.id,
    });
    expect(avant.id).toBeDefined();

    await lieux.update(o.org.id, o.venue.id, sa, {
      operatingMode: VenueOperatingMode.EVENT_BASED,
    });

    await expect(
      paniers.create(client, { eventId: o.contenant.id, supplierId: o.supplier.id }),
    ).rejects.toThrow(/not active/i);
  });

  it('le contenant se RÉVEILLE si le lieu redevient permanent', async () => {
    // Sans réveil, l'aller-retour laissait un lieu « ouvert en continu »
    // incapable de prendre la moindre commande, sans rien afficher d'anormal.
    const o = await lieuPermanent();
    await lieux.update(o.org.id, o.venue.id, sa, {
      operatingMode: VenueOperatingMode.EVENT_BASED,
    });
    await lieux.update(o.org.id, o.venue.id, sa, {
      operatingMode: VenueOperatingMode.PERMANENT,
    });

    const relu = await s.prisma.event.findUniqueOrThrow({ where: { id: o.contenant.id } });
    expect(relu.status).toBe(EventStatus.ACTIVE);

    // Et il reprend des commandes.
    const panier = await paniers.create(client, {
      eventId: o.contenant.id,
      supplierId: o.supplier.id,
    });
    expect(panier.id).toBeDefined();

    // Un seul contenant, toujours : le réveil ne doit pas en créer un second.
    const contenants = await s.prisma.event.count({
      where: { venueId: o.venue.id, isPermanentContainer: true },
    });
    expect(contenants).toBe(1);
  });
});
