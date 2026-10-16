import { personnaliserLien, porteDesEtiquettes } from './personnaliser-lien';

/**
 * C'est ce remplacement qui évite au client de se reconnecter chez Flaix.
 * S'il échoue, le défaut est VISIBLE (du texte entre crochets dans le
 * formulaire) ou INVISIBLE (la moitié des paramètres perdus dans un fragment
 * d'URL) — et c'est le second qui coûte cher.
 */

/** Le lien réel du client, tel qu'il le colle depuis son back-office. */
const LIEN_REEL =
  'https://commande.flaix.bo.synertic.net/o/marseille-vs-gap' +
  '?firstname=[#firstname]&lastname=[#lastname]&mail=[#mail]&phone=[#Votre portable]';

const CLIENT = {
  firstName: 'Rémi',
  lastName: 'Notta',
  email: 'remi@example.com',
  phone: '+33612345678',
  displayName: 'Rémi Notta',
};

describe('personnaliser un lien Flaix', () => {
  it('remplit le lien RÉEL du client', () => {
    expect(personnaliserLien(LIEN_REEL, CLIENT)).toBe(
      'https://commande.flaix.bo.synertic.net/o/marseille-vs-gap' +
        '?firstname=R%C3%A9mi&lastname=Notta&mail=remi%40example.com&phone=%2B33612345678',
    );
  });

  it('plus aucun « # » ne subsiste', () => {
    // LE défaut invisible : un `#` ouvre un fragment, et un navigateur
    // n'envoie jamais le fragment au serveur. Tout ce qui suit la première
    // étiquette n'arriverait jamais chez Flaix.
    expect(personnaliserLien(LIEN_REEL, CLIENT)).not.toContain('#');
  });

  it('un client NON CONNECTÉ obtient l’adresse nue', () => {
    // Flaix lui demandera ses coordonnées : c'est le repli correct.
    expect(personnaliserLien(LIEN_REEL, null)).toBe(
      'https://commande.flaix.bo.synertic.net/o/marseille-vs-gap',
    );
  });

  it('un champ manquant retire SON paramètre, et garde les autres', () => {
    const sansTelephone = { ...CLIENT, phone: null };

    const r = personnaliserLien(LIEN_REEL, sansTelephone);

    expect(r).toContain('firstname=R%C3%A9mi');
    expect(r).toContain('mail=remi%40example.com');
    expect(r).not.toContain('phone');
  });

  it('un champ VIDE ou en espaces vaut un champ absent', () => {
    const r = personnaliserLien(LIEN_REEL, { ...CLIENT, lastName: '   ' });

    expect(r).not.toContain('lastname');
    expect(r).toContain('firstname=R%C3%A9mi');
  });

  it('une étiquette INCONNUE retire son paramètre plutôt que de l’écrire', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?a=[#numero de licence]&mail=[#mail]';

    const r = personnaliserLien(lien, CLIENT);

    expect(r).toBe('https://commande.flaix.bo.synertic.net/o/x?mail=remi%40example.com');
  });

  it('les libellés Shapper sont reconnus, accents et espaces compris', () => {
    const lien =
      'https://commande.flaix.bo.synertic.net/o/x' +
      '?a=[#Votre portable]&b=[#TÉLÉPHONE]&c=[#votre_portable]&d=[#Votre%20portable]';

    const r = personnaliserLien(lien, CLIENT);

    // Les quatre désignent le téléphone.
    expect(r).toBe(
      'https://commande.flaix.bo.synertic.net/o/x' +
        '?a=%2B33612345678&b=%2B33612345678&c=%2B33612345678&d=%2B33612345678',
    );
  });

  it('les valeurs sont ÉCHAPPÉES — un nom composé ne casse pas l’adresse', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?n=[#lastname]';

    const r = personnaliserLien(lien, { ...CLIENT, lastName: 'Da Silva & Fils' });

    expect(r).toBe('https://commande.flaix.bo.synertic.net/o/x?n=Da%20Silva%20%26%20Fils');
  });

  it('deux étiquettes dans le MÊME paramètre', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?qui=[#firstname] [#lastname]';

    expect(personnaliserLien(lien, CLIENT)).toBe(
      'https://commande.flaix.bo.synertic.net/o/x?qui=R%C3%A9mi%20Notta',
    );
  });

  it('… et il suffit qu’UNE des deux manque pour retirer le paramètre', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?qui=[#firstname] [#lastname]';

    expect(personnaliserLien(lien, { ...CLIENT, lastName: null })).toBe(
      'https://commande.flaix.bo.synertic.net/o/x',
    );
  });

  it('un lien SANS étiquette n’est pas touché', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/n-n';

    expect(personnaliserLien(lien, CLIENT)).toBe(lien);
  });

  it('un lien avec des paramètres ordinaires les conserve', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?src=breakeat&v=2&mail=[#mail]';

    expect(personnaliserLien(lien, CLIENT)).toBe(
      'https://commande.flaix.bo.synertic.net/o/x?src=breakeat&v=2&mail=remi%40example.com',
    );
  });

  it('un VRAI fragment est conservé tel quel', () => {
    // Tous les « # » ne sont pas des étiquettes : il ne faut pas casser une
    // ancre légitime au passage.
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?a=1#panier';

    expect(personnaliserLien(lien, CLIENT)).toBe(lien);
  });

  it('le premier paramètre retiré, le « ? » se replace correctement', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?phone=[#phone]&mail=[#mail]';

    expect(personnaliserLien(lien, { ...CLIENT, phone: null })).toBe(
      'https://commande.flaix.bo.synertic.net/o/x?mail=remi%40example.com',
    );
  });

  it('tous les paramètres retirés : il ne reste pas de « ? » orphelin', () => {
    expect(personnaliserLien(LIEN_REEL, {})).toBe(
      'https://commande.flaix.bo.synertic.net/o/marseille-vs-gap',
    );
  });

  it('un drapeau sans « = » est conservé', () => {
    const lien = 'https://commande.flaix.bo.synertic.net/o/x?debug&mail=[#mail]';

    expect(personnaliserLien(lien, CLIENT)).toBe(
      'https://commande.flaix.bo.synertic.net/o/x?debug&mail=remi%40example.com',
    );
  });
});

describe('détecter qu’un lien attend une identité', () => {
  it('reconnaît une étiquette', () => {
    expect(porteDesEtiquettes(LIEN_REEL)).toBe(true);
  });

  it('… et n’en invente pas', () => {
    expect(porteDesEtiquettes('https://commande.flaix.bo.synertic.net/o/n-n')).toBe(false);
    expect(porteDesEtiquettes('https://commande.flaix.bo.synertic.net/o/x?a=1#ancre')).toBe(false);
  });

  it('se rappelle correctement d’un appel à l’autre', () => {
    // Une expression régulière globale garde un curseur entre deux appels :
    // sans remise à zéro, un appel sur deux répondrait « non » à tort.
    for (let i = 0; i < 4; i += 1) expect(porteDesEtiquettes(LIEN_REEL)).toBe(true);
  });
});
