import { estChezFlaix, hoteHorsFlaix, navigationAutorisee } from '../navigation-flaix';

/**
 * La page de commande Flaix, dans l'app. Un refus de trop bloque le PAIEMENT
 * sans un mot ; une autorisation de trop ouvre une page qu'on ne contrôle pas.
 * Les deux se testent.
 */
describe('navigation de la page Flaix', () => {
  it('reconnaît les domaines Flaix, et seulement eux', () => {
    expect(estChezFlaix('https://commande.flaix.bo.synertic.net/o/x')).toBe(true);
    expect(estChezFlaix('https://ops.flaixlabs.com/rapport')).toBe(true);
    expect(estChezFlaix('https://synertic.net/')).toBe(true);
    // Le mot dans le nom ne suffit pas.
    expect(estChezFlaix('https://synertic.net.pirate.fr/')).toBe(false);
    expect(estChezFlaix('https://faux-flaixlabs.com/')).toBe(false);
    expect(estChezFlaix('pas une adresse')).toBe(false);
  });

  it('laisse passer Flaix et les pages vides', () => {
    expect(navigationAutorisee('https://commande.flaix.bo.synertic.net/paiement')).toBe(true);
    expect(navigationAutorisee('about:blank')).toBe(true);
    expect(navigationAutorisee(undefined)).toBe(true);
  });

  it('laisse passer un prestataire de paiement en HTTPS — cadre ou redirection', () => {
    // Un champ de carte hébergé chez le prestataire, ou une étape 3-D Secure.
    expect(navigationAutorisee('https://js.stripe.com/v3/elements-inner-card.html')).toBe(true);
    expect(navigationAutorisee('https://checkout.stripe.com/c/pay/cs_test')).toBe(true);
    expect(navigationAutorisee('https://acs.banque-exemple.fr/3ds/challenge')).toBe(true);
  });

  it('refuse le clair, les schémas d’apps et l’illisible', () => {
    expect(navigationAutorisee('http://checkout.exemple.fr/pay')).toBe(false);
    expect(navigationAutorisee('intent://scan/#Intent;scheme=zxing;end')).toBe(false);
    expect(navigationAutorisee('javascript:alert(1)')).toBe(false);
    expect(navigationAutorisee('n’importe quoi')).toBe(false);
  });

  it('annonce l’adresse dès qu’on quitte Flaix, et seulement là', () => {
    expect(hoteHorsFlaix('https://checkout.stripe.com/c/pay/cs_test')).toBe('checkout.stripe.com');
    expect(hoteHorsFlaix('https://commande.flaix.bo.synertic.net/o/x')).toBeNull();
    expect(hoteHorsFlaix('about:blank')).toBeNull();
    expect(hoteHorsFlaix(undefined)).toBeNull();
  });
});
