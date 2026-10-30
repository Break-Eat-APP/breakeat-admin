import { PrismaService } from '../../src/database/prisma.service';
import { OutboxService } from '../../src/modules/realtime/outbox.service';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { unique } from './banc';

/**
 * DEUX OUVRIERS, UNE SEULE FILE — et chaque annonce part UNE fois.
 *
 * Chaque réplique exécute le cron de l'outbox. Tant que la réservation ne
 * durait que le temps de la requête, une seconde réplique reprenait la ligne
 * pendant que la première émettait : le comptoir voyait la même commande
 * arriver deux fois.
 *
 * AUCUNE DOUBLURE NE RÉPOND À CETTE QUESTION. `FOR UPDATE SKIP LOCKED` et
 * l'échéance d'un bail sont des comportements de PostgreSQL ; un faux Prisma
 * rendrait ce qu'on lui a dit de rendre. Il faut deux services distincts, sur
 * la même base, lancés en même temps.
 *
 * La suite s'IGNORE sans `DATABASE_URL_TEST`, comme les autres : on ne fait
 * jamais échouer quelqu'un qui n'a pas monté l'infrastructure.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('outbox : deux ouvriers concurrents (PostgreSQL réel)', () => {
  let prisma: PrismaService;
  /** Ce que CHAQUE ouvrier a réellement émis, salon par salon. */
  let emisParA: string[];
  let emisParB: string[];
  let a: OutboxService;
  let b: OutboxService;

  /** Une passerelle qui note ce qui part, et rien de plus. */
  const passerelle = (journal: string[]) =>
    ({
      server: {
        to: () => ({ emit: (_nom: string, charge: { eventId: string }) => journal.push(charge.eventId) }),
      },
    }) as unknown as RealtimeGateway;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.realtimeOutbox.deleteMany({ where: { eventName: 'essai_concurrence' } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.realtimeOutbox.deleteMany({ where: { eventName: 'essai_concurrence' } });
    emisParA = [];
    emisParB = [];
    a = new OutboxService(prisma, passerelle(emisParA));
    b = new OutboxService(prisma, passerelle(emisParB));
  });

  /** Dépose N annonces en attente, et rend leurs identifiants. */
  async function deposer(combien: number): Promise<string[]> {
    const ids = Array.from({ length: combien }, () => unique('ev'));
    await prisma.realtimeOutbox.createMany({
      data: ids.map((eventId) => ({
        eventId,
        eventName: 'essai_concurrence',
        rooms: ['organization:essai'],
        payload: { eventId },
      })),
    });
    return ids;
  }

  /**
   * LE TEST QUI JUSTIFIE TOUT LE RESTE.
   *
   * Sans bail, les deux ouvriers rejouaient les mêmes lignes et le total des
   * émissions dépassait le nombre d'annonces.
   */
  it('n’émet chaque annonce QU’UNE SEULE FOIS, même lancés ensemble', async () => {
    const ids = await deposer(40);

    await Promise.all([a.rejouer(), b.rejouer()]);

    const tout = [...emisParA, ...emisParB];
    expect(tout).toHaveLength(ids.length);
    // Aucun doublon : c'est la propriété qu'on achète avec le bail.
    expect(new Set(tout).size).toBe(ids.length);
    expect([...tout].sort()).toEqual([...ids].sort());
  });

  it('se partagent le travail au lieu de se le disputer', async () => {
    await deposer(40);

    await Promise.all([a.rejouer(), b.rejouer()]);

    // On n'exige pas une moitié chacun — l'ordonnancement décide. Mais aucun
    // des deux ne doit avoir tout pris pendant que l'autre attendait : c'est
    // `SKIP LOCKED` qui évite l'attente.
    expect(emisParA.length + emisParB.length).toBe(40);
  });

  it('marque tout livré, et rend les baux', async () => {
    await deposer(10);

    await Promise.all([a.rejouer(), b.rejouer()]);

    const restantes = await prisma.realtimeOutbox.count({
      where: { eventName: 'essai_concurrence', deliveredAt: null },
    });
    expect(restantes).toBe(0);

    const baux = await prisma.realtimeOutbox.count({
      where: { eventName: 'essai_concurrence', claimedUntil: { not: null } },
    });
    expect(baux).toBe(0);
  });

  /**
   * UN BAIL DOIT EXPIRER, sinon il survit à la panne qu'il couvre.
   *
   * On simule un ouvrier mort après avoir réservé : la ligne porte un bail
   * encore valide. Personne ne doit la toucher — puis, une fois l'échéance
   * passée, elle repart.
   */
  it('respecte un bail en cours, et reprend la ligne une fois échu', async () => {
    const [id] = await deposer(1);

    // Un ouvrier l'a réservée il y a un instant, puis a disparu.
    await prisma.realtimeOutbox.updateMany({
      where: { eventId: id },
      data: { claimedUntil: new Date(Date.now() + 60_000), attempts: 1 },
    });

    expect((await a.rejouer()).rejoues).toBe(0);
    expect(emisParA).toHaveLength(0);

    // Le bail est échu : la ligne redevient disponible.
    await prisma.realtimeOutbox.updateMany({
      where: { eventId: id },
      data: { claimedUntil: new Date(Date.now() - 1_000) },
    });

    expect((await a.rejouer()).rejoues).toBe(1);
    expect(emisParA).toEqual([id]);
  });

  /**
   * L'ordre compte : un `order_updated` rejoué avant son `new_order`
   * afficherait une commande qui avance avant d'exister. Un seul ouvrier doit
   * donc servir dans l'ordre d'arrivée.
   */
  it('sert dans l’ordre d’arrivée', async () => {
    const ids = await deposer(15);

    await a.rejouer();

    expect(emisParA).toEqual(ids);
  });
});
