/**
 * Ce que la carte d'un lieu ANNONCE doit être ce que le doigt obtient.
 *
 * Cette règle a divergé une fois : la navigation exigeait une chose,
 * l'affichage une autre. Un lieu à moitié configuré s'annonçait « Ouvert » et
 * refusait au clic — une promesse à l'écran, un refus au doigt. Les deux
 * passent désormais par les mêmes fonctions, et ces tests les tiennent
 * ensemble.
 */
import {
  cheminDeCommande,
  heureDOuverture,
  ouvertALaCommande,
  type LieuOuvrable,
} from '../ouverture-lieu';

const lieu = (over: LieuOuvrable = {}): LieuOuvrable => ({
  flaixEnabled: false,
  flaixOrderUrl: null,
  commandeOuvreA: null,
  currentEventId: null,
  ...over,
});

const LIEN = 'https://ops.flaixlabs.com/commande/samedi';

describe('par où passe la commande d’un lieu', () => {
  it('Flaix, quand le serveur a résolu un LIEN pour maintenant', () => {
    const v = lieu({ flaixEnabled: true, flaixOrderUrl: LIEN });

    expect(cheminDeCommande(v)).toBe('flaix');
    expect(ouvertALaCommande(v)).toBe(true);
  });

  it('un lieu Flaix SANS lien du moment n’est pas annoncé ouvert', () => {
    // LE défaut d'origine : `flaixEnabled` seul affichait « Ouvert », et le
    // clic retombait sur « Bientôt ». L'écran mentait. Aujourd'hui la même
    // garde tient sur ce qui ouvre réellement une page : le lien.
    const v = lieu({ flaixEnabled: true, flaixOrderUrl: null });

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });

  it('un lieu Flaix dont la commande ouvre PLUS TARD est fermé, pas détourné', () => {
    // Vu à l'écran : il s'annonçait « Ouvert » et envoyait le client dans le
    // parcours Break Eat — des produits et des prix que le club ne tient plus,
    // puisque c'est Flaix qui vend. Un lieu Flaix n'a pas deux portes.
    const v = lieu({
      flaixEnabled: true,
      flaixOrderUrl: null,
      commandeOuvreA: '2026-10-17T16:30:00.000Z',
      currentEventId: 'evt-1',
    });

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });

  it('… mais un lieu Flaix SANS aucun lien garde son parcours Break Eat', () => {
    // Le club a basculé l'interrupteur et n'a pas encore collé ses liens : on
    // ne lui coupe pas la vente entre-temps.
    const v = lieu({ flaixEnabled: true, flaixOrderUrl: null, currentEventId: 'evt-1' });

    expect(cheminDeCommande(v)).toBe('evenement');
    expect(ouvertALaCommande(v)).toBe(true);
  });

  it('Flaix PRIME sur l’événement quand les deux sont là', () => {
    const v = lieu({ flaixEnabled: true, flaixOrderUrl: LIEN, currentEventId: 'evt-1' });

    expect(cheminDeCommande(v)).toBe('flaix');
  });

  it('un lieu sans Flaix et sans événement est « Bientôt »', () => {
    const v = lieu();

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });

  it('un lien sans le drapeau ne suffit pas', () => {
    // Le serveur ne devrait pas en envoyer — mais UN interrupteur commande
    // tout le relais, et l'app ne le contourne pas non plus.
    const v = lieu({ flaixEnabled: false, flaixOrderUrl: LIEN });

    expect(cheminDeCommande(v)).toBeNull();
  });

  it('un lien VIDE ne vaut pas un lien', () => {
    // Une chaîne vide passerait un test de présence naïf et n'ouvrirait rien.
    const v = lieu({ flaixEnabled: true, flaixOrderUrl: '' });

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });
});

describe('l’heure d’ouverture annoncée', () => {
  it('donne l’heure quand la commande est encore fermée', () => {
    const v = lieu({ flaixEnabled: true, commandeOuvreA: '2026-10-17T16:30:00.000Z' });

    // Formatée dans le fuseau de l'appareil : on vérifie la forme, pas la
    // valeur — un test qui fixerait « 18:30 » tomberait en changeant de fuseau.
    expect(heureDOuverture(v)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('ne dit RIEN quand la commande est déjà ouverte', () => {
    // Afficher une heure d'ouverture passée pendant que le bouton marche
    // sèmerait le doute.
    const v = lieu({
      flaixEnabled: true,
      flaixOrderUrl: LIEN,
      commandeOuvreA: '2026-10-17T16:30:00.000Z',
    });

    expect(heureDOuverture(v)).toBeNull();
  });

  it('ne dit rien sans heure', () => {
    expect(heureDOuverture(lieu())).toBeNull();
  });

  it('une date illisible ne casse pas l’écran', () => {
    // Une valeur abîmée doit se taire, pas afficher « Invalid Date ».
    const v = lieu({ flaixEnabled: true, commandeOuvreA: 'pas-une-date' });

    expect(heureDOuverture(v)).toBeNull();
  });
});
