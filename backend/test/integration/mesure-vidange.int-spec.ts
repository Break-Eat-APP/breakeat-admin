import { PrismaService } from '../../src/database/prisma.service';
import { OutboxService } from '../../src/modules/realtime/outbox.service';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { randomUUID } from 'crypto';

/**
 * COMBIEN DE TEMPS POUR RATTRAPER UNE COUPURE D'UNE HEURE.
 *
 * L'audit avance cinquante minutes pour dix mille annonces : un lot de deux
 * cents par minute, et rien de plus. Le match est fini avant que le comptoir
 * ait tout vu.
 *
 * Ce n'est pas un test de régression, c'est une MESURE — elle ne vérifie
 * qu'une chose, que la file se vide EN UN TOUR, et elle imprime le temps réel
 * que cela prend sur un PostgreSQL véritable. Les doublures ne peuvent pas
 * répondre à cette question : ce qui coûtait, c'étaient les allers-retours.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('vidange de l’outbox : la mesure (PostgreSQL réel)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.realtimeOutbox.deleteMany({ where: { eventName: 'mesure_vidange' } });
    await prisma.$disconnect();
  });

  it('vide dix mille annonces en UN SEUL tour', async () => {
    await prisma.realtimeOutbox.deleteMany({ where: { eventName: 'mesure_vidange' } });

    const COMBIEN = 10_000;
    for (let lot = 0; lot < COMBIEN / 1_000; lot++) {
      await prisma.realtimeOutbox.createMany({
        data: Array.from({ length: 1_000 }, () => {
          const eventId = randomUUID();
          return {
            eventId,
            eventName: 'mesure_vidange',
            rooms: ['organization:mesure', 'supplier:mesure'],
            payload: { eventId },
          };
        }),
      });
    }

    let partis = 0;
    const passerelle = {
      server: { to: () => ({ emit: () => (partis += 1) }) },
    } as unknown as RealtimeGateway;

    const service = new OutboxService(prisma, passerelle);

    const depart = Date.now();
    const bilan = await service.rejouer();
    const duree = Date.now() - depart;

    // eslint-disable-next-line no-console
    console.log(
      `${bilan.rejoues} annonces rejouees en ${bilan.passages} lot(s), ` +
        `${duree} ms (${Math.round(bilan.rejoues / (duree / 1000))}/s). ` +
        `Reste en attente : ${bilan.enAttente}.`,
    );

    expect(bilan.rejoues).toBe(COMBIEN);
    expect(bilan.enAttente).toBe(0);
    // Deux salons par annonce.
    expect(partis).toBe(COMBIEN * 2);
  }, 120_000);
});
