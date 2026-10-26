import { RealtimeService } from './realtime.service';
import type { RealtimeGateway } from './realtime.gateway';

/**
 * PRÉVENIR LES ÉCRANS NE DOIT JAMAIS CASSER UNE COMMANDE PAYÉE.
 *
 * Toutes ces émissions ont lieu APRÈS le commit : la commande existe, elle est
 * payée, l'argent est encaissé. Prévenir le comptoir est une courtoisie — pas
 * une étape de l'opération.
 *
 * Or `this.gateway.server` peut ne pas être prêt, et `server.to(...)` lever un
 * TypeError. Cette erreur remontait jusqu'au webhook Stripe, qui répondait en
 * échec — et Stripe rejouait, sur une commande déjà créée.
 *
 * Ces tests tiennent la règle : **l'émission échoue en silence côté métier, et
 * bruyamment dans les journaux.**
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

  it('ne lève pas quand la passerelle n’a pas encore de serveur', () => {
    const service = new RealtimeService({ server: undefined } as unknown as RealtimeGateway);

    expect(() => service.emitNewOrder(commande as never)).not.toThrow();
  });

  it('ne lève pas quand l’émission elle-même échoue', () => {
    const gateway = {
      server: {
        to: () => {
          throw new Error('Redis injoignable');
        },
      },
    } as unknown as RealtimeGateway;
    const service = new RealtimeService(gateway);

    expect(() => service.emitNewOrder(commande as never)).not.toThrow();
  });

  /**
   * Silencieux pour le métier ne veut pas dire silencieux tout court : un
   * événement perdu doit se lire dans les journaux, sans quoi on chercherait
   * du côté des écrans.
   */
  it('journalise l’échec plutôt que de le taire', () => {
    const gateway = {
      server: {
        to: () => {
          throw new Error('Redis injoignable');
        },
      },
    } as unknown as RealtimeGateway;
    const service = new RealtimeService(gateway);
    const journal = jest
      .spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    service.emitNewOrder(commande as never);

    expect(journal).toHaveBeenCalledWith(expect.stringContaining('Redis injoignable'));
    journal.mockRestore();
  });

  /**
   * Le cloisonnement reste entier : une commande au comptoir Nord ne doit
   * jamais sonner au Sud. Le passage par une aide commune ne devait pas
   * perdre cette propriété en route.
   */
  it('vise toujours les bons salons, et eux seuls', () => {
    const salons: string[] = [];
    const gateway = {
      server: {
        to: (salon: string) => {
          salons.push(salon);
          return { emit: () => undefined };
        },
      },
    } as unknown as RealtimeGateway;

    new RealtimeService(gateway).emitNewOrder(commande as never);

    expect(salons).toEqual([
      'organization:org-1',
      'event:ev-1',
      'supplier:buvette-nord',
    ]);
    expect(salons).not.toContain('supplier:buvette-sud');
  });

  it('émet une seule fois par salon', () => {
    const emissions: string[] = [];
    const gateway = {
      server: {
        to: (salon: string) => ({
          emit: (nom: string) => emissions.push(`${salon}/${nom}`),
        }),
      },
    } as unknown as RealtimeGateway;

    new RealtimeService(gateway).emitNewOrder(commande as never);

    expect(emissions).toHaveLength(3);
    expect(new Set(emissions).size).toBe(3);
  });
});
