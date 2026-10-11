/**
 * Ce que la carte d'un lieu ANNONCE doit être ce que le doigt obtient.
 *
 * Cette règle a divergé une fois : la navigation exigeait l'identifiant Flaix,
 * l'affichage se contentait du drapeau. Un lieu à moitié configuré s'annonçait
 * « Ouvert » et refusait au clic — une promesse à l'écran, un refus au doigt.
 * Les deux passent désormais par les mêmes fonctions, et ces tests les tiennent
 * ensemble.
 */
import { cheminDeCommande, ouvertALaCommande, type LieuOuvrable } from '../ouverture-lieu';

const lieu = (over: LieuOuvrable = {}): LieuOuvrable => ({
  flaixEnabled: false,
  flaixVenueId: null,
  currentEventId: null,
  ...over,
});

describe('par où passe la commande d’un lieu', () => {
  it('Flaix, quand le relais est COMPLET', () => {
    const v = lieu({ flaixEnabled: true, flaixVenueId: 'flx-1' });

    expect(cheminDeCommande(v)).toBe('flaix');
    expect(ouvertALaCommande(v)).toBe(true);
  });

  it('un lieu Flaix SANS identifiant n’est pas annoncé ouvert', () => {
    // LE défaut : `flaixEnabled` seul affichait « Ouvert », et le clic
    // retombait sur « Bientôt ». L'écran mentait.
    const v = lieu({ flaixEnabled: true, flaixVenueId: null });

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });

  it('un lieu Flaix mal configuré retombe sur son ÉVÉNEMENT, s’il en a un', () => {
    // Un réglage à moitié rempli ne doit pas priver le lieu de sa commande
    // normale.
    const v = lieu({ flaixEnabled: true, flaixVenueId: null, currentEventId: 'evt-1' });

    expect(cheminDeCommande(v)).toBe('evenement');
    expect(ouvertALaCommande(v)).toBe(true);
  });

  it('Flaix PRIME sur l’événement quand les deux sont là', () => {
    const v = lieu({ flaixEnabled: true, flaixVenueId: 'flx-1', currentEventId: 'evt-1' });

    expect(cheminDeCommande(v)).toBe('flaix');
  });

  it('un lieu sans Flaix et sans événement est « Bientôt »', () => {
    const v = lieu();

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });

  it('un identifiant Flaix sans le drapeau ne suffit pas', () => {
    // L'identifiant peut rester d'une configuration passée : c'est le drapeau
    // qui décide, et les deux sont exigés ensemble.
    const v = lieu({ flaixEnabled: false, flaixVenueId: 'flx-1' });

    expect(cheminDeCommande(v)).toBeNull();
  });

  it('un identifiant VIDE ne vaut pas un identifiant', () => {
    // Une chaîne vide passerait un test de présence naïf et ne mènerait nulle
    // part : c'est le cas qu'un formulaire d'admin produit le plus facilement.
    const v = lieu({ flaixEnabled: true, flaixVenueId: '' });

    expect(cheminDeCommande(v)).toBeNull();
    expect(ouvertALaCommande(v)).toBe(false);
  });
});
