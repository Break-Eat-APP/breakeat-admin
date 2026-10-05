/**
 * Banc d'essai sur une VRAIE base Postgres, construite avec les migrations de
 * production (`prisma migrate deploy`). Les services sont les vrais ; seuls les
 * fournisseurs extérieurs (Apple, Stripe, Expo) sont remplacés.
 *
 * Pourquoi une vraie base : les règles de suppression (CASCADE, RESTRICT,
 * SET NULL) et les contraintes d'unicité vivent dans le SQL des migrations, qui
 * diverge par endroits de `schema.prisma`. Un test à base de doublures ne les
 * voit pas.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UsersService } from '../../src/modules/users/users.service';
import { BackofficeService } from '../../src/modules/backoffice/backoffice.service';
import type { IdentiteVerifiee } from '../../src/modules/auth/social-identity.service';

export function monterServices(url: string) {
  process.env.DATABASE_URL = url;
  const prisma = new PrismaService();
  const users = new UsersService(prisma);
  const jwt = new JwtService({ secret: 'banc-essai' });
  const config = { get: () => undefined } as never;

  // L'identité que « Apple » renverra au prochain appel.
  const apple: { prochaine: IdentiteVerifiee | null } = { prochaine: null };
  const social = {
    verifier: async () => {
      if (!apple.prochaine) throw new Error('aucune identité préparée');
      return apple.prochaine;
    },
    disponibles: () => ['apple'],
  };
  const groups = { applyDomainMembershipsForUser: async () => 0 };
  const auth = new AuthService(prisma, users, groups as never, jwt, config, social as never);

  const pushTokens = { tokensForUsers: async () => [] };
  const backoffice = new BackofficeService(prisma, {} as never, pushTokens as never, {} as never);

  return { prisma, users, auth, backoffice, apple };
}

/**
 * Un identifiant unique — y compris entre FICHIERS de test.
 *
 * Le compteur seul ne suffisait pas : Jest donne à chaque fichier son propre
 * registre de modules, donc son propre compteur repartant de zéro. Deux fichiers
 * démarrant dans la même milliseconde produisaient alors la même valeur, et
 * `archives.int-spec.ts` — qui teste la réinscription par ADRESSE E-MAIL —
 * échouait sur une adresse déjà prise. Un échec sans rapport avec ce qu'il
 * teste, et qui ne se reproduit pas à l'exécution suivante : le pire des
 * échecs, surtout maintenant que la CI lance cette suite.
 *
 * Le fragment aléatoire ferme la porte : il ne dépend ni de l'horloge, ni du
 * fichier, ni de l'ordre d'exécution.
 */
let compteur = 0;
export const unique = (prefixe: string) =>
  `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${++compteur}`;

/** Une organisation réaliste : lieu permanent, contenant, buvette, point de retrait, produit. */
export async function creerOrganisationComplete(
  prisma: PrismaService,
  slug: string,
  adminId: string,
) {
  const org = await prisma.organization.create({ data: { name: `Club ${slug}`, slug } });
  await prisma.organizationMember.create({
    data: { userId: adminId, organizationId: org.id, orgRole: 'ORG_ADMIN' },
  });
  const venue = await prisma.venue.create({
    data: {
      organizationId: org.id,
      name: `Stade ${slug}`,
      address: '1 avenue du Sport',
      operatingMode: 'PERMANENT',
    },
  });
  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      venueId: venue.id,
      name: 'Service continu',
      status: 'ACTIVE',
      startAt: new Date(),
      endAt: new Date('2099-12-31'),
      isPermanentContainer: true,
    },
  });
  const supplier = await prisma.supplier.create({
    data: { organizationId: org.id, name: 'Buvette Nord', status: 'OPEN' },
  });
  await prisma.eventSupplier.create({ data: { eventId: event.id, supplierId: supplier.id } });
  const pickup = await prisma.pickupPoint.create({
    data: {
      organizationId: org.id,
      venueId: venue.id,
      eventId: event.id,
      supplierId: supplier.id,
      name: 'Comptoir',
    },
  });
  const category = await prisma.category.create({
    data: { supplierId: supplier.id, name: 'Boissons' },
  });
  const product = await prisma.product.create({
    data: { supplierId: supplier.id, categoryId: category.id, name: 'Bière', price: 700 },
  });
  return { org, venue, event, supplier, pickup, product };
}

/** Une commande payée, comme celles qui empêchent de supprimer un compte. */
export async function creerCommande(
  prisma: PrismaService,
  userId: string,
  o: Awaited<ReturnType<typeof creerOrganisationComplete>>,
) {
  return prisma.order.create({
    data: {
      publicOrderNumber: unique('BE'),
      userId,
      organizationId: o.org.id,
      eventId: o.event.id,
      venueId: o.venue.id,
      supplierId: o.supplier.id,
      pickupPointId: o.pickup.id,
      status: 'PAID',
      subtotalCents: 700,
      totalCents: 700,
    } as never,
  });
}
