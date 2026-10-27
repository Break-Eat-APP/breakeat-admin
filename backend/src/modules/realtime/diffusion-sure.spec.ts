import { RealtimeService } from './realtime.service';
import type { RealtimeGateway } from './realtime.gateway';
import type { OutboxService } from './outbox.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * PRÉVENIR LES ÉCRANS NE DOIT JAMAIS CASSER UNE COMMANDE PAYÉE — ET NE DOIT
 * PLUS JAMAIS SE PERDRE NON PLUS.
 *
 * Toutes ces émissions ont lieu APRÈS le commit : la commande existe, elle est
 * payée, l'argent est encaissé. Prévenir le comptoir est une courtoisie — pas
 * une étape de l'opération. `this.gateway.server` peut ne pas être prêt, et
 * `server.to(...)` lever un TypeError ; cette erreur remontait jusqu'au
 * webhook Stripe, qui répondait en échec, et Stripe rejouait sur une commande
 * déjà créée.
 *
 * Mais « échouer en silence » laissait un trou : l'écran du comptoir ne savait
 * jamais. Chaque émission dépose donc désormais une ligne dans l'outbox AVANT
 * de partir, et un ouvrier rejoue ce qui n'est pas marqué livré.
 *
 * Ces tests tiennent les deux règles à la fois :
 *   · l'émission échoue en silence côté métier, bruyamment dans les journaux ;
 *   · et rien ne part sans avoir d'abord été inscrit.
 */
describe('RealtimeService — diffuser ne casse jamais l’opération', () => {
  const commande = {
    orderId: 'o-1',
    publicOrderNumber: 'BE-42',
    organizationId: 'org-1',
    venueId: 'lieu-1',
    eventId: 'ev-1',
    supplierId: 'buvette-nord',
    pickupPointId: 'retrait-1',
  };

  /**
   * L'émission est un « fire-and-forget » assumé : l'appelant vient
   * d'encaisser et n'attend pas. Les tests doivent donc laisser le tour de
   * boucle se terminer avant d'observer.
   */
  const vider = () => new Promise((r) => setImmediate(r));

  function monter(gateway: unknown, outbox: Partial<OutboxService> = {}) {
    const deposer = jest.fn().mockResolvedValue(undefined);
    const marquerLivre = jest.fn().mockResolvedValue(undefined);
    const service = new RealtimeService(
      gateway as RealtimeGateway,
      { deposer, marquerLivre, ...outbox } as unknown as OutboxService,
      {} as PrismaService,
    );
    return { service, deposer, marquerLivre };
  }

  const passerelleEnPanne = () =>
    ({
      server: {
        to: () => {
          throw new Error('Redis injoignable');
        },
      },
    }) as unknown as RealtimeGateway;

  // ─── Ne jamais casser l'opération ───────────────────────────────

  it('ne lève pas quand la passerelle n’a pas encore de serveur', async () => {
    const { service } = monter({ server: undefined });

    expect(() => service.emitNewOrder(commande as never)).not.toThrow();
    await vider();
  });

  it('ne lève pas quand l’émission elle-même échoue', async () => {
    const { service } = monter(passerelleEnPanne());

    expect(() => service.emitNewOrder(commande as never)).not.toThrow();
    await vider();
  });

  /**
   * Silencieux pour le métier ne veut pas dire silencieux tout court : un
   * événement en retard doit se lire dans les journaux, sans quoi on
   * chercherait du côté des écrans.
   */
  it('journalise l’échec plutôt que de le taire', async () => {
    const { service } = monter(passerelleEnPanne());
    const journal = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    service.emitNewOrder(commande as never);
    await vider();

    expect(journal).toHaveBeenCalledWith(expect.stringContaining('Redis injoignable'));
    journal.mockRestore();
  });

  // ─── Rien ne se perd ────────────────────────────────────────────

  /**
   * L'ORDRE EST LA GARANTIE. Déposer après l'émission laisserait exactement le
   * trou qu'on ferme : émission ratée, rien d'inscrit, personne ne saura.
   */
  it('DÉPOSE dans l’outbox avant d’émettre', async () => {
    const vus: string[] = [];
    const gateway = {
      server: {
        to: () => {
          vus.push('emission');
          return { emit: () => undefined };
        },
      },
    };
    const { service, deposer } = monter(gateway);
    deposer.mockImplementation(() => {
      vus.push('depot');
      return Promise.resolve();
    });

    service.emitNewOrder(commande as never);
    await vider();

    expect(vus[0]).toBe('depot');
    expect(deposer).toHaveBeenCalledTimes(1);
  });

  it('inscrit les salons et l’enveloppe complète, pas un résumé', async () => {
    const { service, deposer } = monter({
      server: { to: () => ({ emit: () => undefined }) },
    });

    service.emitNewOrder(commande as never);
    await vider();

    const depot = deposer.mock.calls[0][1] as {
      eventName: string;
      rooms: string[];
      payload: { orderId: string; eventId: string };
    };
    expect(depot.eventName).toBe('new_order');
    expect(depot.rooms).toEqual([
      'organization:org-1',
      'event:ev-1',
      'supplier:buvette-nord',
    ]);
    // Rejouer ne doit RIEN recalculer : les données d'alors ont pu changer.
    expect(depot.payload.orderId).toBe('o-1');
    expect(depot.payload.eventId).toEqual(expect.any(String));
  });

  it('marque livré une fois l’émission passée', async () => {
    const { service, marquerLivre } = monter({
      server: { to: () => ({ emit: () => undefined }) },
    });

    service.emitNewOrder(commande as never);
    await vider();

    expect(marquerLivre).toHaveBeenCalledTimes(1);
  });

  /**
   * LE CŒUR DU FILET. Marquer livré après une émission ratée effacerait la
   * ligne de la vue de l'ouvrier : l'événement serait perdu pour de bon, et
   * la table donnerait l'illusion que tout est parti.
   */
  it('NE marque PAS livré quand l’émission échoue', async () => {
    const { service, deposer, marquerLivre } = monter(passerelleEnPanne());

    service.emitNewOrder(commande as never);
    await vider();

    expect(deposer).toHaveBeenCalledTimes(1);
    expect(marquerLivre).not.toHaveBeenCalled();
  });

  it('NE marque PAS livré quand la passerelle n’est pas prête', async () => {
    const { service, marquerLivre } = monter({ server: undefined });

    service.emitNewOrder(commande as never);
    await vider();

    expect(marquerLivre).not.toHaveBeenCalled();
  });

  /**
   * Si le dépôt lui-même échoue — base injoignable —, on tente quand même
   * l'émission : sans filet, mais pas sans rien. Un comptoir prévenu vaut
   * mieux qu'un comptoir muet.
   */
  it('émet quand même si le dépôt échoue, et le dit', async () => {
    const emis: string[] = [];
    const { service, marquerLivre } = monter(
      { server: { to: (s: string) => (emis.push(s), { emit: () => undefined }) } },
      { deposer: jest.fn().mockRejectedValue(new Error('base injoignable')) },
    );
    const journal = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    service.emitNewOrder(commande as never);
    await vider();

    expect(emis).toHaveLength(3);
    // Rien à marquer : il n'y a pas de ligne.
    expect(marquerLivre).not.toHaveBeenCalled();
    expect(journal).toHaveBeenCalledWith(expect.stringContaining('base injoignable'));
    journal.mockRestore();
  });

  // ─── Le cloisonnement reste entier ──────────────────────────────

  /**
   * Une commande au comptoir Nord ne doit jamais sonner au Sud. Le passage
   * par l'outbox ne devait pas perdre cette propriété en route.
   */
  it('vise toujours les bons salons, et eux seuls', async () => {
    const salons: string[] = [];
    const { service } = monter({
      server: {
        to: (salon: string) => {
          salons.push(salon);
          return { emit: () => undefined };
        },
      },
    });

    service.emitNewOrder(commande as never);
    await vider();

    expect(salons).toEqual(['organization:org-1', 'event:ev-1', 'supplier:buvette-nord']);
    expect(salons).not.toContain('supplier:buvette-sud');
  });

  it('émet une seule fois par salon', async () => {
    const emissions: string[] = [];
    const { service } = monter({
      server: {
        to: (salon: string) => ({
          emit: (nom: string) => emissions.push(`${salon}/${nom}`),
        }),
      },
    });

    service.emitNewOrder(commande as never);
    await vider();

    expect(emissions).toHaveLength(3);
    expect(new Set(emissions).size).toBe(3);
  });
});
