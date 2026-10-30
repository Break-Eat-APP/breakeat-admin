import { OutboxService } from './outbox.service';
import type { RealtimeGateway } from './realtime.gateway';
import type { PrismaService } from '../../database/prisma.service';

/**
 * RIEN NE DOIT SE PERDRE POUR L'OPÉRATEUR.
 *
 * Une commande payée, c'est deux gestes : l'écrire en base, et prévenir
 * l'écran de la buvette. Entre les deux, un redémarrage ou une passerelle pas
 * encore prête suffisait à ce que le comptoir n'en sache jamais rien. La
 * commande existait, encaissée, et personne ne la préparait.
 *
 * Ces tests tiennent la promesse faite à l'exploitant : **tout finit par
 * s'afficher.**
 */
describe('OutboxService — le rattrapage', () => {
  /**
   * Une ligne telle que la RÉSERVATION la rend : c'est du SQL brut
   * (`FOR UPDATE SKIP LOCKED`), donc des colonnes en snake_case et non les
   * champs du client Prisma.
   */
  const ligne = (over: Record<string, unknown> = {}) => ({
    id: 'l-1',
    event_id: 'ev-uuid-1',
    event_name: 'new_order',
    rooms: ['organization:org-1', 'supplier:buvette-nord'],
    payload: { eventId: 'ev-uuid-1', orderId: 'o-1' },
    attempts: 1,
    ...over,
  });

  function monter(lignes: ReturnType<typeof ligne>[], serveurCasse = false) {
    const emis: string[] = [];
    const maj: { where: unknown; data: Record<string, unknown> }[] = [];

    const sql: string[] = [];
    const prisma = {
      // La reservation passe par du SQL brut : c'est la seule facon d'obtenir
      // `FOR UPDATE SKIP LOCKED`, donc deux instances qui se partagent la file
      // au lieu de rejouer les memes lignes.
      $queryRaw: jest.fn((morceaux: TemplateStringsArray) => {
        sql.push(morceaux.join(' '));
        return Promise.resolve(lignes);
      }),
      realtimeOutbox: {
        update: jest.fn((a: { where: unknown; data: Record<string, unknown> }) => {
          maj.push(a);
          return Promise.resolve({});
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };

    const gateway = {
      server: {
        to: (salon: string) => ({
          emit: (nom: string) => {
            if (serveurCasse) throw new Error('Redis injoignable');
            emis.push(`${salon}/${nom}`);
          },
        }),
      },
    };

    return {
      service: new OutboxService(
        prisma as unknown as PrismaService,
        gateway as unknown as RealtimeGateway,
      ),
      prisma,
      emis,
      maj,
      sql,
    };
  }

  // ─── Le rejeu ───────────────────────────────────────────────────

  it('rejoue une ligne jamais livrée, dans tous ses salons', async () => {
    const { service, emis } = monter([ligne()]);

    const bilan = await service.rejouer();

    expect(bilan.rejoues).toBe(1);
    expect(emis).toEqual([
      'organization:org-1/new_order',
      'supplier:buvette-nord/new_order',
    ]);
  });

  /**
   * REJOUER NE RECALCULE RIEN. L'enveloppe stockée part telle quelle : les
   * données d'alors ont pu changer depuis, et un écran doit recevoir ce qui
   * s'est réellement passé, pas l'état d'aujourd'hui.
   */
  it('renvoie l’enveloppe telle qu’elle a été déposée', async () => {
    const charge = { eventId: 'ev-uuid-1', orderId: 'o-1', status: 'PAID' };
    const recus: unknown[] = [];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([ligne({ payload: charge })]),
      realtimeOutbox: { update: jest.fn().mockResolvedValue({}) },
    };
    const gateway = {
      server: { to: () => ({ emit: (_n: string, c: unknown) => recus.push(c) }) },
    };

    await new OutboxService(
      prisma as unknown as PrismaService,
      gateway as unknown as RealtimeGateway,
    ).rejouer();

    expect(recus[0]).toEqual(charge);
  });

  it('marque livré ce qui vient de partir', async () => {
    const { service, maj } = monter([ligne()]);

    await service.rejouer();

    expect(maj[0].data.deliveredAt).toBeInstanceOf(Date);
    expect(maj[0].data.lastError).toBeNull();
  });

  /**
   * L'ORDRE COMPTE. Un `order_updated` rejoué avant son `new_order`
   * afficherait une commande qui avance avant d'exister.
   */
  /**
   * LA RÉSERVATION EST CE QUI REND DEUX INSTANCES POSSIBLES.
   *
   * Chaque réplique exécute ce cron. Une simple lecture leur rendrait à
   * toutes les mêmes lignes : le comptoir verrait la commande arriver deux
   * fois. `FOR UPDATE SKIP LOCKED` fait que chacune prend des lignes que les
   * autres sautent — sans attendre, sans doublon.
   */
  it('RÉSERVE les lignes au lieu de les lire — SKIP LOCKED', async () => {
    const { service, sql } = monter([ligne()]);

    await service.rejouer();

    const requete = sql[0].replace(/\s+/g, ' ');
    expect(requete).toContain('FOR UPDATE SKIP LOCKED');
    // Réserver, c'est ÉCRIRE : un simple SELECT ne verrouille rien au-delà
    // de la transaction implicite.
    expect(requete).toContain('UPDATE');
    expect(requete).toContain('attempts = attempts + 1');
  });

  /**
   * LE VERROU NE SUFFIT PAS — IL TOMBE AVEC LA REQUÊTE.
   *
   * `FOR UPDATE SKIP LOCKED` protège le temps de la requête qui réserve.
   * Une fois celle-ci terminée, la ligne est encore non livrée : une autre
   * réplique la reprenait pendant que la première émettait, et le comptoir
   * voyait la même commande arriver deux fois.
   *
   * Le bail couvre la phase d'ÉMISSION, et les autres ouvriers le
   * respectent.
   */
  it('POSE un bail, et respecte celui des autres', async () => {
    const { service, sql } = monter([ligne()]);

    await service.rejouer();

    const requete = sql[0].replace(/\s+/g, ' ');
    // Il le pose…
    expect(requete).toContain('claimed_until = NOW()');
    // … et il ne prend que les lignes dont le bail est échu ou absent.
    expect(requete).toContain('claimed_until IS NULL OR claimed_until < NOW()');
  });

  /**
   * Un bail qu'il faudrait lever à la main survivrait à la panne qu'il est
   * censé couvrir. Livrer le rend : la ligne est finie, plus personne n'a
   * à la réserver.
   */
  it('REND le bail en marquant livré', async () => {
    const { service, maj } = monter([ligne()]);

    await service.rejouer();

    expect(maj[0].data.deliveredAt).toBeInstanceOf(Date);
    expect(maj[0].data.claimedUntil).toBeNull();
  });

  /**
   * L'ORDRE COMPTE. Un `order_updated` rejoué avant son `new_order`
   * afficherait une commande qui avance avant d'exister. Et on ne reprend
   * que ce qui n'est pas livré, sinon on rejouerait toute l'histoire.
   */
  it('prend les plus anciennes, et seulement les non livrées', async () => {
    const { service, sql } = monter([ligne()]);

    await service.rejouer();

    const requete = sql[0].replace(/\s+/g, ' ');
    expect(requete).toContain('delivered_at IS NULL');
    // Par la SÉQUENCE, pas par la date : deux annonces déposées dans la
    // même transaction portent la même date à la milliseconde près, et
    // PostgreSQL rendait alors les ex æquo dans l'ordre qu'il voulait.
    expect(requete).toContain('ORDER BY sequence ASC');
    expect(requete).toContain('LIMIT');
  });

  // ─── Quand ça rate encore ───────────────────────────────────────

  /**
   * Un échec ne doit PAS marquer la ligne livrée : elle serait perdue de vue,
   * et la table donnerait l'illusion que tout est parti.
   */
  it('compte l’essai et garde la ligne quand l’émission rate', async () => {
    const { service, maj } = monter([ligne()], true);

    const bilan = await service.rejouer();

    expect(bilan.rejoues).toBe(0);
    // Ne PAS marquer livré est tout l'enjeu : la ligne resterait invisible
    // de l'ouvrier, et la table donnerait l'illusion que tout est parti.
    expect(maj[0].data.deliveredAt).toBeUndefined();
    // L'essai a déjà été compté par la RÉSERVATION. Le recompter ici le
    // doublerait — et une ligne serait abandonnée deux fois plus vite.
    expect(maj[0].data.attempts).toBeUndefined();
    expect(maj[0].data.lastError).toContain('Redis injoignable');
  });

  /**
   * Une ligne qui échoue dix fois n'échoue pas par hasard. La rejouer sans
   * fin masquerait les suivantes derrière elle, passage après passage — et
   * c'est alors TOUT le rattrapage qui s'arrête.
   */
  it('abandonne après dix essais, et le dit fort', async () => {
    // 10 et non 9 : la réservation a déjà compté cet essai avant de rendre
    // la ligne. C'est donc le dixième, et le dernier.
    const { service } = monter([ligne({ attempts: 10 })], true);
    const journal = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    const bilan = await service.rejouer();

    expect(bilan.abandonnes).toBe(1);
    expect(journal).toHaveBeenCalledWith(expect.stringContaining('ABANDONNE'));
    journal.mockRestore();
  });

  /**
   * La passerelle pas encore prête, c'est EXACTEMENT la panne que cette table
   * couvre. Les lignes attendent ; rien n'est consommé, rien n'est perdu.
   */
  it('ne touche à rien quand la passerelle n’est pas prête', async () => {
    const prisma = { $queryRaw: jest.fn(), realtimeOutbox: { update: jest.fn() } };

    const bilan = await new OutboxService(
      prisma as unknown as PrismaService,
      { server: undefined } as unknown as RealtimeGateway,
    ).rejouer();

    expect(bilan).toEqual({ rejoues: 0, abandonnes: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('ne fait rien quand il n’y a rien à rejouer', async () => {
    const { service, emis } = monter([]);

    expect(await service.rejouer()).toEqual({ rejoues: 0, abandonnes: 0 });
    expect(emis).toEqual([]);
  });

  // ─── Le marquage immédiat ───────────────────────────────────────

  /**
   * `marquerLivre` ne doit JAMAIS lever : il est appelé après une émission
   * déjà réussie. Échouer là ferait remonter une erreur sur un chemin qui a
   * abouti — et au pire, l'ouvrier rejouera. Un doublon, pas une perte.
   */
  it('marquerLivre ne lève pas quand la base refuse', async () => {
    const prisma = {
      realtimeOutbox: {
        updateMany: jest.fn().mockRejectedValue(new Error('base injoignable')),
      },
    };
    const service = new OutboxService(
      prisma as unknown as PrismaService,
      { server: {} } as unknown as RealtimeGateway,
    );

    await expect(service.marquerLivre('ev-uuid-1')).resolves.toBeUndefined();
  });

  it('ne marque QUE les lignes encore non livrées', async () => {
    const { service, prisma } = monter([]);

    await service.marquerLivre('ev-uuid-1');

    const appel = prisma.realtimeOutbox.updateMany.mock.calls[0][0] as {
      where: { eventId: string; deliveredAt: null };
    };
    expect(appel.where).toEqual({ eventId: 'ev-uuid-1', deliveredAt: null });
  });

  // ─── La purge ───────────────────────────────────────────────────

  /**
   * C'est une file d'attente, pas un journal : le registre immuable, c'est
   * `OrderAuditTrail`. Et on ne purge QUE ce qui est livré — supprimer une
   * ligne en attente, c'est perdre l'événement qu'elle protégeait.
   */
  it('ne purge que les lignes LIVRÉES, et assez anciennes', async () => {
    const { service, prisma } = monter([]);

    expect(await service.purger()).toBe(3);

    const appel = prisma.realtimeOutbox.deleteMany.mock.calls[0][0] as {
      where: { deliveredAt: { not: null; lt: Date } };
    };
    // `{ not: null }` se LIT « non nulle » : c'est la facon dont Prisma
    // ecrit « deja livree ». La valeur attendue est donc bien `null`.
    expect(appel.where.deliveredAt.not).toBeNull();
    expect(appel.where.deliveredAt.lt.getTime()).toBeLessThan(Date.now());
  });
});
