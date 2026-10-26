import { ScheduledPushService } from './scheduled-push.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * UNE CAMPAGNE MARQUÉE « ENVOYÉE » L'A-T-ELLE VRAIMENT ÉTÉ ?
 *
 * `ExpoPushService.send()` ne lève jamais : il absorbe les erreurs réseau et
 * rend un résumé. Une campagne dont TOUS les lots avaient échoué — Expo
 * injoignable, coupure réseau — était donc enregistrée `SENT` avec
 * `sentCount: 0`.
 *
 * Le club lisait « envoyé » pour une annonce que personne n'avait reçue. Il
 * ne s'en apercevait qu'au silence du stade, et cherchait du côté des
 * téléphones.
 *
 * Un statut qui ment est pire qu'un statut absent : on cesse de le vérifier.
 */
describe('ScheduledPushService — le statut dit la vérité', () => {
  const ID = 'push-1';

  /**
   * Monte le service avec un envoi Expo dont on choisit le résultat, et rend
   * ce qui a été écrit en base.
   */
  function monter(resultatExpo: { sent: number; failed: number; invalidTokens?: string[] }, jetons: string[]) {
    const ecrit: Array<Record<string, unknown>> = [];
    const prisma = {
      scheduledPush: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: ID,
          kind: 'PUSH',
          title: 'Match ce soir',
          body: 'Les buvettes ouvrent à 19h.',
          organizationId: 'org-1',
          eventId: null,
          venueId: null,
        }),
        update: jest.fn((args: { data: Record<string, unknown> }) => {
          ecrit.push(args.data);
          return Promise.resolve({});
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      order: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }]) },
      pushToken: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new ScheduledPushService(
      prisma,
      { send: jest.fn().mockResolvedValue({ invalidTokens: [], ...resultatExpo }) } as never,
      { tokensForUsers: jest.fn().mockResolvedValue(jetons), purgeInvalid: jest.fn() } as never,
      { archiver: jest.fn().mockResolvedValue(jetons.length) } as never,
    );
    return { service, ecrit, prisma };
  }

  it('marque ÉCHOUÉ quand on a visé des appareils et que RIEN n’est parti', async () => {
    const { service, ecrit } = monter({ sent: 0, failed: 3 }, ['j1', 'j2', 'j3']);

    await service.process(ID);

    expect(ecrit[0]).toMatchObject({ status: 'FAILED', sentCount: 0 });
  });

  it('marque ENVOYÉ dès qu’un seul appareil a reçu', async () => {
    const { service, ecrit } = monter({ sent: 1, failed: 2 }, ['j1', 'j2', 'j3']);

    await service.process(ID);

    // Succès partiel : le compte dit la vérité, le statut reste ENVOYÉ.
    expect(ecrit[0]).toMatchObject({ status: 'SENT', sentCount: 1 });
  });

  /**
   * Zéro destinataire n'est PAS un échec : si personne n'a de jeton —
   * appareils neufs, notifications refusées —, il n'y avait rien à envoyer,
   * et l'annonce vit sur la cloche, archivée avant l'envoi.
   *
   * Sans cette distinction, un club dont aucun client n'a encore autorisé les
   * notifications verrait toutes ses campagnes en échec, et cesserait d'y
   * croire.
   */
  it('marque ENVOYÉ quand il n’y avait personne à joindre', async () => {
    const { service, ecrit } = monter({ sent: 0, failed: 0 }, []);

    await service.process(ID);

    expect(ecrit[0]).toMatchObject({ status: 'SENT', sentCount: 0 });
  });

  it('enregistre toujours le nombre réellement atteint', async () => {
    const { service, ecrit } = monter({ sent: 42, failed: 0 }, Array.from({ length: 50 }, (_, i) => `j${i}`));

    await service.process(ID);

    expect(ecrit[0]).toMatchObject({ status: 'SENT', sentCount: 42 });
  });

  // ─── `sentAt` est une date d'ENVOI, pas de tentative ──────────────

  /**
   * Elle était posée même en échec total : une campagne `FAILED` portait une
   * heure d'envoi — « échouée, envoyée à 18 h 42 ». Le club qui relit ses
   * annonces ne sait plus laquelle est partie, et un rapport qui compte les
   * envois par date compte des envois qui n'ont pas eu lieu.
   *
   * L'ABSENCE de date est l'information : c'est elle qui distingue « jamais
   * parti » de « parti ». `updatedAt` garde l'heure de la tentative.
   */
  it('ne pose AUCUNE date d’envoi quand rien n’est parti', async () => {
    const { service, ecrit } = monter({ sent: 0, failed: 3 }, ['j1', 'j2', 'j3']);

    await service.process(ID);

    expect(ecrit[0].status).toBe('FAILED');
    expect(ecrit[0]).not.toHaveProperty('sentAt');
  });

  it('pose la date dès qu’un appareil a reçu', async () => {
    const { service, ecrit } = monter({ sent: 1, failed: 2 }, ['j1', 'j2']);

    await service.process(ID);

    expect(ecrit[0].sentAt).toBeInstanceOf(Date);
  });

  /**
   * Zéro destinataire reste un ENVOI abouti — il n'y avait rien à envoyer.
   * La date doit donc être là, sinon le rapport verrait un trou.
   */
  it('pose la date même quand il n’y avait personne à joindre', async () => {
    const { service, ecrit } = monter({ sent: 0, failed: 0 }, []);

    await service.process(ID);

    expect(ecrit[0].status).toBe('SENT');
    expect(ecrit[0].sentAt).toBeInstanceOf(Date);
  });
});

/**
 * UNE CAMPAGNE RESTÉE « EN COURS » N'A PLUS PERSONNE POUR LA FINIR.
 *
 * Le passage `PENDING` → `PROCESSING` empêche deux instances de traiter la
 * même campagne. Mais si le processus meurt entre ce passage et la fin, la
 * ligne reste `PROCESSING` pour toujours : le cron ne regarde que les
 * `PENDING`. Un redéploiement au mauvais moment suffisait, et la campagne
 * disparaissait en silence.
 */
describe('ScheduledPushService — les campagnes abandonnées', () => {
  function monter(bloquees: Array<{ id: string; kind: string }>) {
    const updateMany = jest.fn().mockResolvedValue({ count: bloquees.length });
    const prisma = {
      scheduledPush: {
        // 1er appel : les bloquées. 2e : les dues (aucune ici).
        findMany: jest
          .fn()
          .mockResolvedValueOnce(bloquees)
          .mockResolvedValue([]),
        updateMany,
      },
    } as unknown as PrismaService;

    const service = new ScheduledPushService(prisma, {} as never, {} as never, {} as never);
    return { service, updateMany, prisma };
  }

  it('marque ÉCHOUÉ une campagne en cours depuis trop longtemps', async () => {
    const { service, updateMany } = monter([{ id: 'p1', kind: 'PUSH' }]);

    await service.processDue();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  /**
   * On ne la REJOUE pas : l'archivage a lieu avant l'envoi, donc la rejouer
   * dupliquerait les entrées de la cloche — et peut-être les notifications
   * elles-mêmes. Une annonce reçue deux fois agace ; une annonce manquée se
   * recrée, à condition de le savoir.
   */
  it('ne la remet PAS en attente — pas de rejeu, pas de doublon', async () => {
    const { service, updateMany } = monter([{ id: 'p1', kind: 'PUSH' }]);

    await service.processDue();

    const statuts = updateMany.mock.calls.map((c) => (c[0] as { data: { status: string } }).data.status);
    expect(statuts).not.toContain('PENDING');
  });

  it('ne touche à rien quand aucune n’est bloquée', async () => {
    const { service, updateMany } = monter([]);

    await service.processDue();

    expect(updateMany).not.toHaveBeenCalled();
  });

  /**
   * Un quart d'heure : bien au-delà de la durée d'un envoi normal. En deçà,
   * on couperait une campagne encore en cours.
   */
  it('ne regarde que les lignes en cours depuis plus de 15 minutes', async () => {
    const { service, prisma } = monter([]);

    await service.processDue();

    const where = (prisma.scheduledPush.findMany as jest.Mock).mock.calls[0][0].where as {
      status: string;
      updatedAt: { lt: Date };
    };
    expect(where.status).toBe('PROCESSING');
    const minutes = (Date.now() - where.updatedAt.lt.getTime()) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(14.9);
    expect(minutes).toBeLessThanOrEqual(15.1);
  });
});
