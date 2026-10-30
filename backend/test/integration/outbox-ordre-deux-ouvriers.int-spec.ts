import { PrismaService } from '../../src/database/prisma.service';
import { OutboxService } from '../../src/modules/realtime/outbox.service';
import type { RealtimeGateway } from '../../src/modules/realtime/realtime.gateway';
import { randomUUID } from 'crypto';

/**
 * DEUX ANNONCES D'UNE MÊME COMMANDE, DEUX OUVRIERS : QUI PART EN PREMIER ?
 *
 * L'outbox promet l'ordre d'arrivée, et le tient DANS un ouvrier : les lots
 * s'enchaînent l'un après l'autre, et chaque lot est trié avant d'émettre.
 * Entre ouvriers, personne ne l'a jamais promis — l'un réserve les deux cents
 * plus anciennes, l'autre les suivantes, et rien ne dit lequel finira le
 * premier.
 *
 * Ce test ne vérifie pas une correction : il ÉTABLIT la propriété, parce
 * qu'on ne peut pas décider si elle doit être corrigée sans savoir ce qu'elle
 * vaut. Les deux cas sont distingués —
 *
 *   · DEUX ANNONCES VOISINES, celles d'une vraie commande : un
 *     `order_updated` et le `order_ready` qui le suit sont déposés dans la
 *     MÊME transaction, donc avec des séquences consécutives. Elles tombent
 *     ensemble dans le même lot, et l'ordre tient ;
 *   · DEUX ANNONCES ÉLOIGNÉES de plus d'un lot : c'est là que l'ordre peut
 *     se perdre, et seulement là.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('outbox : l’ordre entre DEUX ouvriers (PostgreSQL réel)', () => {
  let prisma: PrismaService;
  const NOM = 'essai_ordre_deux';

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.realtimeOutbox.deleteMany({ where: { eventName: NOM } });
    await prisma.$disconnect();
  });

  beforeEach(() => prisma.realtimeOutbox.deleteMany({ where: { eventName: NOM } }));

  /** Un ouvrier qui note, dans l'ordre, ce qu'il a émis pour notre commande. */
  function ouvrier(journal: string[]) {
    const passerelle = {
      server: {
        to: () => ({
          emit: (_nom: string, charge: { etape?: string }) => {
            if (charge.etape) journal.push(charge.etape);
          },
        }),
      },
    } as unknown as RealtimeGateway;
    return new OutboxService(prisma, passerelle);
  }

  /** Dépose `combien` annonces de remplissage. */
  async function remplir(combien: number): Promise<void> {
    if (combien === 0) return;
    await prisma.realtimeOutbox.createMany({
      data: Array.from({ length: combien }, () => ({
        eventId: randomUUID(),
        eventName: NOM,
        rooms: ['r'],
        payload: {},
      })),
    });
  }

  /** Dépose une étape de NOTRE commande. */
  async function etape(nom: string): Promise<void> {
    await prisma.realtimeOutbox.create({
      data: { eventId: randomUUID(), eventName: NOM, rooms: ['r'], payload: { etape: nom } },
    });
  }

  /**
   * LE CAS RÉEL, et c'est celui qui compte.
   *
   * Une transition de commande dépose `order_updated` et `order_ready` dans
   * la MÊME transaction. Leurs séquences se suivent : elles ne peuvent pas se
   * retrouver dans deux lots différents, donc pas chez deux ouvriers.
   */
  it('tient l’ordre de deux annonces VOISINES d’une même commande', async () => {
    await etape('en_preparation');
    await etape('prete');

    const a: string[] = [];
    const b: string[] = [];
    await Promise.all([ouvrier(a).rejouer(), ouvrier(b).rejouer()]);

    // Quel que soit celui qui a pris le lot, il les a servies dans l'ordre.
    expect([...a, ...b]).toEqual(['en_preparation', 'prete']);
  });

  /**
   * ET LE CAS LIMITE : plus d'un lot entre les deux étapes.
   *
   * Il faut que deux cents autres annonces se soient glissées entre elles,
   * donc une FILE EN RETARD et deux instances. À la vitesse de vidange
   * mesurée — près de cinq mille annonces par seconde — deux cents annonces
   * représentent quarante millisecondes de retard. Deux gestes d'une même
   * commande séparés de quarante millisecondes, cela n'existe pas au
   * comptoir : une équipière ne touche pas deux boutons dans le même
   * quarantième de seconde.
   *
   * Ce test n'exige donc PAS l'ordre dans ce cas — il constate ce que le
   * système fait, pour que personne n'ait à le redécouvrir. Ce qui est exigé,
   * c'est qu'aucune annonce ne se perde ni ne parte deux fois.
   */
  it('éloignées de plus d’un lot : rien ne se perd, l’ordre n’est pas promis', async () => {
    await etape('en_preparation');
    await remplir(250);
    await etape('prete');

    const a: string[] = [];
    const b: string[] = [];
    await Promise.all([ouvrier(a).rejouer(), ouvrier(b).rejouer()]);

    const tout = [...a, ...b];
    // La propriété qui est tenue, et elle est la plus importante : chacune
    // part, et une seule fois.
    expect(tout.sort()).toEqual(['en_preparation', 'prete']);

    const restantes = await prisma.realtimeOutbox.count({
      where: { eventName: NOM, deliveredAt: null },
    });
    expect(restantes).toBe(0);
  });

  /**
   * UN SEUL OUVRIER TIENT L'ORDRE, MÊME SUR PLUSIEURS LOTS.
   *
   * Les lots s'enchaînent l'un après l'autre dans la même vidange, et chacun
   * est trié avant d'émettre. C'est ce qui rend le cas ci-dessus aussi étroit :
   * il faut DEUX instances pour l'atteindre.
   */
  it('un seul ouvrier tient l’ordre à travers plusieurs lots', async () => {
    await etape('en_preparation');
    await remplir(250);
    await etape('prete');

    const a: string[] = [];
    await ouvrier(a).rejouer();

    expect(a).toEqual(['en_preparation', 'prete']);
  });
});
