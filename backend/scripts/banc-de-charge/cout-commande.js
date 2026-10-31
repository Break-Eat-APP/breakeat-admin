/**
 * LE COÛT D'UNE COMMANDE BREAK EAT, SUR TRENTE LIEUX À LA FOIS.
 *
 * Ce que le banc ne mesurait pas, et que l'audit V3 signale : « le scénario de
 * transfert n'exécute pas le panier, Stripe, les webhooks, le stock ou
 * l'orchestration du fournisseur ». On mesure donc ici le chemin qui ÉCRIT —
 * celui qui s'est alourdi le 31/10 avec la retenue de stock et la réservation
 * de créneau avant paiement.
 *
 * ── LA QUESTION À LAQUELLE ÇA RÉPOND ───────────────────────────
 *
 * « Trente lieux qui commandent en même temps, est-ce que ça tient ? »
 *
 * La réponse dépend d'une seule chose : les commandes de DEUX LIEUX
 * DIFFÉRENTS se gênent-elles ? La retenue de stock verrouille une ligne de
 * `stock`, qui est propre à un produit ET à un point de retrait. Deux lieux
 * ne touchent donc jamais la même ligne — mais ça se démontre, ça ne se
 * suppose pas : il suffit d'un index manquant, d'une table partagée ou d'un
 * compteur global pour que la promesse tombe.
 *
 * On compare donc deux formes à charge égale :
 *
 *   · TRENTE LIEUX, une commande chacun en parallèle ;
 *   · UN SEUL LIEU, trente commandes en parallèle sur le même stock.
 *
 * Si le premier n'est pas nettement plus rapide que le second, c'est qu'il
 * existe un point de contention qu'on n'avait pas vu.
 *
 * ── CE QUE ÇA NE MESURE PAS ────────────────────────────────────
 *
 * Stripe. On ne peut pas appeler un tiers mille fois pour un banc, et sa
 * latence n'est pas la nôtre. Ce qui est mesuré est le travail de NOTRE base :
 * la retenue, la réservation, la création de la commande, le dépôt dans
 * l'outbox. C'est ce travail-là qui se sérialise ; l'attente de Stripe, elle,
 * ne tient aucun verrou.
 *
 * Usage :
 *   DATABASE_URL_BANC=postgresql://… node scripts/banc-de-charge/cout-commande.js
 */
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const ADRESSE = process.env.DATABASE_URL_BANC;
if (!ADRESSE) {
  console.error('DATABASE_URL_BANC manquante. Une base JETABLE — ce script écrit.');
  process.exit(1);
}

const LIEUX = Number(process.env.BANC_LIEUX ?? 30);
const PAR_LIEU = Number(process.env.BANC_PAR_LIEU ?? 20);
const CONCURRENCE = Number(process.env.BANC_CONCURRENCE ?? 20);
const STOCK = 100_000;

// Le pool est POSE : sans borne explicite, Prisma en deduit une du nombre de
// coeurs, et le chiffre mesure alors la machine autant que le code.
const avecPool = new URL(ADRESSE);
avecPool.searchParams.set('connection_limit', String(CONCURRENCE + 5));
const prisma = new PrismaClient({ datasources: { db: { url: avecPool.toString() } } });

/** Refus net si la base porte de vraies données — le garde du semeur, en plus court. */
async function exigerBaseJetable() {
  const [commandes, paiements] = await Promise.all([
    prisma.order.count(),
    prisma.payment.count().catch(() => 0),
  ]);
  if (commandes > 0 || paiements > 0) {
    console.error(
      `REFUS : cette base porte ${commandes} commande(s) et ${paiements} paiement(s). ` +
        `Ce script écrit ; il ne tourne que sur une base jetable.`,
    );
    process.exit(1);
  }
}

function pct(tries, p) {
  if (!tries.length) return 0;
  const t = [...tries].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor((p / 100) * t.length))];
}

/**
 * Le travail d'UNE commande, tel que le serveur le fait.
 *
 * Les deux `$executeRaw` sont copiés de `retenue-stock.ts` : ce sont eux qui
 * comparent la colonne à elle-même, et donc eux qui prennent le verrou. Les
 * recopier ici plutôt que d'importer le service évite de monter NestJS pour
 * un banc — mais ils doivent rester identiques, et c'est écrit ici pour que
 * l'écart se voie.
 */
async function uneCommande(lieu, n) {
  const t0 = process.hrtime.bigint();

  await prisma.$transaction(async (tx) => {
    // 1. La retenue de stock, avant paiement.
    await tx.$executeRaw`
      UPDATE "stock"
         SET "reserved" = "reserved" + 2, "updated_at" = NOW()
       WHERE "id" = ${lieu.stockId}::uuid
         AND "quantity" - "reserved" >= 2
    `;

    // 2. La consommation, au paiement.
    await tx.$executeRaw`
      UPDATE "stock"
         SET "quantity" = GREATEST(0, "quantity" - 2),
             "reserved"  = GREATEST(0, "reserved" - 2),
             "updated_at" = NOW()
       WHERE "id" = ${lieu.stockId}::uuid
    `;

    // 3. La commande, avec sa ligne.
    const commande = await tx.order.create({
      data: {
        publicOrderNumber: `BANC-${lieu.slug}-${n}`,
        userId: lieu.userId,
        organizationId: lieu.orgId,
        eventId: lieu.eventId,
        venueId: lieu.venueId,
        supplierId: lieu.supplierId,
        pickupPointId: lieu.pickupId,
        status: 'PAID',
        subtotalCents: 1400,
        totalCents: 1400,
      },
      select: { id: true },
    });
    await tx.orderItem.create({
      data: {
        orderId: commande.id,
        productId: lieu.productId,
        productNameSnapshot: 'Bière',
        unitPriceCentsSnapshot: 700,
        quantity: 2,
        lineTotalCents: 1400,
      },
    });

    // 4. L'annonce au comptoir, déposée DANS la transaction.
    // `eventId` est l'identifiant de L'ANNONCE, et il est UNIQUE : c'est lui
    // qui porte la déduplication côté poste opérateur. Ce n'est pas
    // l'événement du lieu — la confusion de noms est dans le modèle.
    await tx.realtimeOutbox.create({
      data: {
        // La colonne est UUID en base : une chaîne libre y est refusée.
        eventId: randomUUID(),
        eventName: 'new_order',
        rooms: [`event:${lieu.eventId}`],
        payload: { orderId: commande.id },
      },
    });
  });

  return Number(process.hrtime.bigint() - t0) / 1e6;
}

async function semerUnLieu(i) {
  const slug = `banc-${Date.now().toString(36)}-${i}`;
  const user = await prisma.user.create({
    data: { email: `${slug}@banc.invalid`, displayName: 'Banc' },
    select: { id: true },
  });
  const org = await prisma.organization.create({
    data: { name: `Club ${slug}`, slug },
    select: { id: true },
  });
  const venue = await prisma.venue.create({
    data: { organizationId: org.id, name: `Stade ${slug}`, address: '1 rue du Banc' },
    select: { id: true },
  });
  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      venueId: venue.id,
      name: 'Match du banc',
      startAt: new Date(),
      endAt: new Date('2099-12-31'),
    },
    select: { id: true },
  });
  const supplier = await prisma.supplier.create({
    data: { organizationId: org.id, name: 'Buvette', status: 'OPEN' },
    select: { id: true },
  });
  const pickup = await prisma.pickupPoint.create({
    data: {
      organizationId: org.id,
      venueId: venue.id,
      eventId: event.id,
      supplierId: supplier.id,
      name: 'Comptoir',
    },
    select: { id: true },
  });
  const category = await prisma.category.create({
    data: { supplierId: supplier.id, name: 'Boissons' },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: { supplierId: supplier.id, categoryId: category.id, name: 'Bière', price: 700 },
    select: { id: true },
  });
  const stock = await prisma.stock.create({
    data: {
      productId: product.id,
      supplierId: supplier.id,
      pickupPointId: pickup.id,
      quantity: STOCK,
      reserved: 0,
    },
    select: { id: true },
  });

  return {
    slug,
    userId: user.id,
    orgId: org.id,
    venueId: venue.id,
    eventId: event.id,
    supplierId: supplier.id,
    pickupId: pickup.id,
    productId: product.id,
    stockId: stock.id,
  };
}

/**
 * Tire une file de commandes à CONCURRENCE BORNÉE.
 *
 * Ma première version lançait les six cents transactions d'un coup. C'était
 * faux pour deux raisons, et la seconde est la plus instructive :
 *
 *   · le pool de connexions n'en ouvre que quelques dizaines, donc les autres
 *     attendaient un connecteur et la « latence » mesurée était celle de la
 *     file d'attente, pas celle du travail ;
 *   · une transaction interactive de Prisma a un DÉLAI (5 s par défaut).
 *     Six cents transactions ouvertes en même temps sur vingt connecteurs
 *     dépassent ce délai et échouent — on aurait mesuré un plantage.
 *
 * Un pool d'ouvriers mesure ce qu'on veut savoir : le DÉBIT SOUTENU à une
 * concurrence que la production peut réellement atteindre.
 */
async function tirer(titre, file, concurrence) {
  const latences = [];
  const echecs = [];
  let i = 0;

  const t0 = process.hrtime.bigint();
  await Promise.all(
    Array.from({ length: concurrence }, async () => {
      while (i < file.length) {
        const tache = file[i++];
        try {
          latences.push(await tache());
        } catch (e) {
          echecs.push(e instanceof Error ? e.message : String(e));
        }
      }
    }),
  );
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  const n = latences.length;
  console.log(
    `  ${titre.padEnd(30)} ${((n / ms) * 1000).toFixed(0).padStart(5)} cmd/s   ` +
      `p50 ${pct(latences, 50).toFixed(0).padStart(4)} ms   ` +
      `p95 ${pct(latences, 95).toFixed(0).padStart(5)} ms` +
      (echecs.length ? `   ${echecs.length} ÉCHEC(S) : ${echecs[0].slice(0, 70)}` : ''),
  );
  return (n / ms) * 1000;
}

async function main() {
  await exigerBaseJetable();

  console.log(`Semis de ${LIEUX} lieux…`);
  const lieux = [];
  for (let i = 0; i < LIEUX; i++) lieux.push(await semerUnLieu(i));

  const total = LIEUX * PAR_LIEU;
  console.log(
    `\n${total} commandes, ${CONCURRENCE} en vol, deux formes à charge égale :\n`,
  );

  // FORME 1 — la réalité : trente lieux, chacun ses clients. Entrelacés, et
  // non lieu par lieu : au coup d'envoi, les trente stades commandent EN MÊME
  // TEMPS. Les grouper par lieu aurait fait tourner les ouvriers sur un seul
  // comptoir à la fois, ce qui est la forme 2 déguisée.
  const reparties = [];
  for (let n = 0; n < PAR_LIEU; n++) {
    for (const lieu of lieux) reparties.push(() => uneCommande(lieu, `r${n}`));
  }
  const debitReparti = await tirer(`${LIEUX} lieux en parallèle`, reparties, CONCURRENCE);

  // FORME 2 — le pire cas : tout le monde sur le même comptoir, donc sur la
  // MÊME LIGNE de stock. C'est là que le verrou se voit.
  const concentrees = [];
  for (let n = 0; n < total; n++) concentrees.push(() => uneCommande(lieux[0], `c${n}`));
  const debitConcentre = await tirer('1 seul lieu, même stock', concentrees, CONCURRENCE);

  const rapport = debitReparti / debitConcentre;
  console.log(
    `\nRapport ${rapport.toFixed(2)}× — ` +
      (rapport > 1.5
        ? 'les lieux ne se gênent PAS : le verrou est bien par produit et par comptoir.'
        : 'ATTENTION : répartir sur trente lieux ne gagne presque rien, il reste un point de contention.'),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
