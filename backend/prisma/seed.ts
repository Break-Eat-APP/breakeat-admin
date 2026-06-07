/**
 * Break Eat — Database seed (local development & demo only).
 *
 * Run with:  pnpm --filter @break-eat/backend db:seed
 *
 * Creates, idempotently:
 *   1. A SUPER_ADMIN user with ready-to-use credentials (see SUMMARY at the end).
 *   2. A demo organisation + ORG_ADMIN membership for that user.
 *   3. A complete, *live* demo event: venue, supplier (OPEN), categories,
 *      products (+ stock), pickup points, time slots, and ~12 orders spread
 *      across PAID / ACCEPTED / PREPARING / READY so the operator dashboard
 *      is populated immediately.
 *
 * Re-running is safe:
 *   - user / org / membership are upserted (no duplicates),
 *   - demo content is only created if the demo event does not already exist.
 *
 * NEVER run against production. These credentials are intentionally weak and
 * are printed to stdout — they are for local exploration only.
 */

import {
  PrismaClient,
  GlobalRole,
  OrgRole,
  EventStatus,
  SupplierStatus,
  CategoryStatus,
  ProductStatus,
  PickupPointStatus,
  SlotStatus,
  SlotSource,
  OrderStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Demo constants ──────────────────────────────────────────────
const ADMIN_EMAIL = 'admin@breakeat.test';
const ADMIN_PASSWORD = 'BreakEat2026!';
const ORG_SLUG = 'break-eat-demo';
const EVENT_NAME = 'Match Spartiates Hockey';

// ─── Helpers ─────────────────────────────────────────────────────

/** Pulls the next value from the shared order public-number sequence. */
async function nextOrderSeq(): Promise<bigint> {
  const rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('order_public_seq') AS nextval
  `;
  return rows[0]?.nextval ?? BigInt(0);
}

/** Formats a Date as HH:MM in French locale. */
function fmt(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function printSummary(eventId: string): void {
  console.log('\n────────────────────────────────────────────────────────');
  console.log('🎉  Seed terminé — tu peux te connecter :');
  console.log('');
  console.log(`     Email         : ${ADMIN_EMAIL}`);
  console.log(`     Mot de passe  : ${ADMIN_PASSWORD}`);
  console.log('');
  console.log('     Back office   : http://localhost:3001');
  console.log('     Dashboards    : http://localhost:3002');
  console.log(`     Événement     : ${EVENT_NAME}`);
  console.log(`     (eventId      : ${eventId})`);
  console.log('────────────────────────────────────────────────────────\n');
}

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱  Seed Break Eat — démarrage…');

  // 1) Admin user (SUPER_ADMIN) ───────────────────────────────────
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { globalRole: GlobalRole.SUPER_ADMIN, isActive: true },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      displayName: 'Admin Break Eat',
      globalRole: GlobalRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log(`  ✅  Utilisateur admin : ${ADMIN_EMAIL}`);

  // 2) Organisation ───────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      name: 'Break Eat Démo',
      slug: ORG_SLUG,
      description: 'Organisation de démonstration',
      primaryColor: '#2563eb',
    },
  });
  console.log(`  ✅  Organisation : ${org.name}`);

  // 3) Membership (ORG_ADMIN) ─────────────────────────────────────
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: org.id } },
    update: { orgRole: OrgRole.ORG_ADMIN },
    create: { userId: admin.id, organizationId: org.id, orgRole: OrgRole.ORG_ADMIN },
  });
  console.log('  ✅  Rattachement admin → organisation (ORG_ADMIN)');

  // 4) Demo content — created only once ───────────────────────────
  const existingEvent = await prisma.event.findFirst({
    where: { organizationId: org.id, name: EVENT_NAME },
  });
  if (existingEvent) {
    console.log('  ℹ️   Données de démo déjà présentes — rien à recréer.');
    printSummary(existingEvent.id);
    return;
  }

  // Venue
  const venue = await prisma.venue.create({
    data: {
      organizationId: org.id,
      name: 'Patinoire des Spartiates',
      address: '1 Avenue du Sport, 75012 Paris',
      timezone: 'Europe/Paris',
    },
  });

  // Event — "live" right now (started 1h ago, ends in 3h)
  const now = new Date();
  const startAt = new Date(now.getTime() - 60 * 60 * 1000);
  const endAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      venueId: venue.id,
      name: EVENT_NAME,
      startAt,
      endAt,
      status: EventStatus.ACTIVE,
      description: 'Match de hockey — démonstration Break Eat',
      primaryColor: '#2563eb',
    },
  });

  // Supplier (OPEN) + attach to event
  const supplier = await prisma.supplier.create({
    data: {
      organizationId: org.id,
      name: 'Buvette Nord',
      status: SupplierStatus.OPEN,
      preparationZone: 'Zone A — Entrée nord',
    },
  });
  await prisma.eventSupplier.create({
    data: { eventId: event.id, supplierId: supplier.id },
  });

  // Categories
  const boissons = await prisma.category.create({
    data: { supplierId: supplier.id, name: 'Boissons', sortOrder: 1, status: CategoryStatus.ACTIVE },
  });
  const snacks = await prisma.category.create({
    data: { supplierId: supplier.id, name: 'Snacks', sortOrder: 2, status: CategoryStatus.ACTIVE },
  });

  // Products (price in cents) + global stock
  const productData: { name: string; price: number; categoryId: string; description?: string }[] = [
    { name: 'Coca-Cola 33cl', price: 250, categoryId: boissons.id, description: 'Boisson gazeuse classique' },
    { name: 'Bière Kronenbourg 33cl', price: 400, categoryId: boissons.id, description: 'Bière blonde' },
    { name: 'Eau minérale 50cl', price: 200, categoryId: boissons.id },
    { name: 'Hot-Dog', price: 500, categoryId: snacks.id, description: 'Pain brioché + saucisse grillée' },
    { name: 'Nachos + Sauce', price: 450, categoryId: snacks.id },
  ];
  const products: { id: string; name: string; price: number }[] = [];
  for (const p of productData) {
    const product = await prisma.product.create({
      data: {
        supplierId: supplier.id,
        categoryId: p.categoryId,
        name: p.name,
        price: p.price,
        description: p.description,
        status: ProductStatus.ACTIVE,
      },
    });
    await prisma.stock.create({
      data: { productId: product.id, supplierId: supplier.id, quantity: 100, isAvailable: true },
    });
    products.push(product);
  }

  // Pickup points
  const pickupPoints = [];
  for (const name of ['Comptoir Nord', 'Comptoir Est']) {
    const pp = await prisma.pickupPoint.create({
      data: {
        organizationId: org.id,
        venueId: venue.id,
        eventId: event.id,
        supplierId: supplier.id,
        name,
        status: PickupPointStatus.ACTIVE,
      },
    });
    pickupPoints.push(pp);
  }

  // Slots — 3 × 20 min around now
  const slotBase = new Date(now.getTime());
  slotBase.setSeconds(0, 0);
  for (let i = 0; i < 3; i++) {
    const s = new Date(slotBase.getTime() + i * 20 * 60 * 1000);
    const e = new Date(s.getTime() + 20 * 60 * 1000);
    await prisma.slot.create({
      data: {
        eventId: event.id,
        startAt: s,
        endAt: e,
        capacity: 30,
        status: SlotStatus.OPEN,
        source: SlotSource.MANUAL,
        label: `${fmt(s)} – ${fmt(e)}`,
      },
    });
  }

  // Orders — a live snapshot across statuses
  const plan: { status: OrderStatus; productIdxs: number[] }[] = [
    { status: OrderStatus.PAID, productIdxs: [0] },
    { status: OrderStatus.PAID, productIdxs: [3] },
    { status: OrderStatus.PAID, productIdxs: [1, 4] },
    { status: OrderStatus.PAID, productIdxs: [2] },
    { status: OrderStatus.PAID, productIdxs: [0, 3] },
    { status: OrderStatus.ACCEPTED, productIdxs: [3] },
    { status: OrderStatus.ACCEPTED, productIdxs: [1] },
    { status: OrderStatus.ACCEPTED, productIdxs: [0, 4] },
    { status: OrderStatus.PREPARING, productIdxs: [3, 4] },
    { status: OrderStatus.PREPARING, productIdxs: [0] },
    { status: OrderStatus.READY, productIdxs: [1] },
    { status: OrderStatus.READY, productIdxs: [2, 3] },
  ];

  let orderCount = 0;
  for (const [idx, o] of plan.entries()) {
    const items = o.productIdxs.map((pi) => {
      const product = products[pi];
      const quantity = 1 + (idx % 2);
      return {
        productId: product.id,
        productNameSnapshot: product.name,
        unitPriceCentsSnapshot: product.price,
        quantity,
        lineTotalCents: product.price * quantity,
      };
    });
    const totalCents = items.reduce((sum, it) => sum + it.lineTotalCents, 0);
    const seq = await nextOrderSeq();
    const pickup = pickupPoints[idx % pickupPoints.length];

    await prisma.order.create({
      data: {
        publicOrderNumber: `DEMO-${String(seq).padStart(6, '0')}`,
        userId: admin.id,
        organizationId: org.id,
        eventId: event.id,
        venueId: venue.id,
        supplierId: supplier.id,
        pickupPointId: pickup.id,
        status: o.status,
        subtotalCents: totalCents,
        totalCents,
        currency: 'eur',
        metadata: { demo: true, seedIdx: idx },
        items: { create: items },
      },
    });
    orderCount++;
  }

  console.log(
    `  ✅  Contenu de démo créé : 1 lieu, 1 événement (ACTIF), 1 fournisseur, ` +
      `${products.length} produits, ${pickupPoints.length} comptoirs, 3 créneaux, ${orderCount} commandes.`,
  );
  printSummary(event.id);
}

main()
  .catch((e) => {
    console.error('❌  Seed échoué :', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
