import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return status ok', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
  });

  it('should return a valid ISO timestamp', () => {
    const result = controller.check();
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('should return an environment field', () => {
    const result = controller.check();
    expect(result.environment).toBeDefined();
  });

  // Sans ce champ, on ne peut pas savoir QUELLE version repond : Railway laisse
  // l'ancien conteneur servir tant que le nouveau ne passe pas son controle de
  // sante, et une livraison en echec ressemble alors a une livraison reussie.
  it('nomme le commit deploye', () => {
    const result = controller.check();
    expect(result.commit).toBeDefined();
    expect(result.commit.length).toBeGreaterThan(0);
  });

  // « Est-ce que je paie dans l'app ou sur une page web ? » se constatait
  // seulement en payant. Ce booleen repond de l'exterieur, en une commande.
  describe('paiementNatif', () => {
    const cle = process.env.STRIPE_PUBLISHABLE_KEY;
    afterEach(() => {
      if (cle === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
      else process.env.STRIPE_PUBLISHABLE_KEY = cle;
    });

    it('est vrai quand la cle publiable est posee', () => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_peu_importe';
      expect(controller.check().paiementNatif).toBe(true);
    });

    it('est faux sans elle — l app retombera sur la page hebergee', () => {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
      expect(controller.check().paiementNatif).toBe(false);
    });

    it('ne laisse jamais filtrer la cle elle-meme', () => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_valeur_secrete_ou_pas';
      expect(JSON.stringify(controller.check())).not.toContain('pk_test_');
    });
  });
});
