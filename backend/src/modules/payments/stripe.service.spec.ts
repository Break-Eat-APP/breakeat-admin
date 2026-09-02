import { ConfigService } from '@nestjs/config';
import { StripeService } from './stripe.service';

/**
 * Signature des webhooks — plusieurs secrets acceptés.
 *
 * Stripe attribue un secret par POINT DE TERMINAISON. Suivre à la fois les
 * paiements (événements du compte) et l'état du compte connecté du club
 * (`account.updated`, un événement Connect) peut demander deux points de
 * terminaison, donc deux secrets. Avec un seul, le second échoue à chaque
 * livraison sans autre trace qu'un « Invalid signature » dans les journaux.
 */
describe('StripeService — signature des webhooks', () => {
  function service(secret: string): StripeService {
    const config = {
      get: (cle: string) =>
        cle === 'app.stripe.webhookSecret'
          ? secret
          : cle === 'app.stripe.secretKey'
            ? 'sk_test_x'
            : undefined,
    } as unknown as ConfigService;
    const s = new StripeService(config);
    s.onModuleInit?.();
    return s;
  }

  /** Remplace le vérificateur Stripe : seul `bon` passe. */
  function brancherVerificateur(s: StripeService, bon: string): string[] {
    const essayes: string[] = [];
    (s as unknown as { stripe: { webhooks: { constructEvent: unknown } } }).stripe = {
      webhooks: {
        constructEvent: (_body: unknown, _sig: unknown, secret: string) => {
          essayes.push(secret);
          if (secret !== bon) throw new Error('Invalid signature');
          return { id: 'evt_1', type: 'account.updated' };
        },
      },
    } as never;
    return essayes;
  }

  it('accepte le premier secret', () => {
    const s = service('whsec_A');
    brancherVerificateur(s, 'whsec_A');
    expect(s.constructWebhookEvent(Buffer.from('{}'), 'sig').id).toBe('evt_1');
  });

  it('accepte un secret plus loin dans la liste', () => {
    const s = service('whsec_A, whsec_B');
    const essayes = brancherVerificateur(s, 'whsec_B');
    expect(s.constructWebhookEvent(Buffer.from('{}'), 'sig').id).toBe('evt_1');
    // L'ordre compte : on n'abandonne pas au premier refus.
    expect(essayes).toEqual(['whsec_A', 'whsec_B']);
  });

  it('rejette quand aucun secret ne correspond', () => {
    const s = service('whsec_A,whsec_B');
    brancherVerificateur(s, 'whsec_AUTRE');
    expect(() => s.constructWebhookEvent(Buffer.from('{}'), 'sig')).toThrow('Invalid signature');
  });

  it('refuse explicitement quand aucun secret n’est configuré', () => {
    const s = service('');
    brancherVerificateur(s, 'peu importe');
    // Message explicite plutôt qu'un échec de signature trompeur : la cause
    // est une variable absente, pas une requête falsifiée.
    expect(() => s.constructWebhookEvent(Buffer.from('{}'), 'sig')).toThrow(
      /STRIPE_WEBHOOK_SECRET absent/,
    );
  });
});
