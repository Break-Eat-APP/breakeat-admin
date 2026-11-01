import { verifierLogoAdversaire } from './adversaire';
import { LONGUEUR_MAX_IMAGE, verifierAffiche, verifierImageDistante } from './image-distante';

/**
 * LES DEUX PORTES — le blason et l'affiche — passent par la MÊME règle.
 *
 * C'est tout l'objet de ce fichier. Avant le 01/11/2026 il n'y avait qu'une
 * porte ; l'affiche d'un concert est arrivée avec des besoins identiques, et
 * recopier la validation aurait créé deux exemplaires d'une règle de sécurité.
 * Le test qui compte vraiment ici est le dernier : il envoie les mêmes mauvaises
 * adresses dans les deux portes et exige le même refus. Il tombera le jour où
 * l'une des deux se mettra à vivre sa vie.
 */
describe('verifierImageDistante', () => {
  const NOMS = { complement: 'de l’image', sujet: 'une image' };

  it('accepte une adresse https et la normalise', () => {
    expect(verifierImageDistante('  https://cdn.club.test/blason.png  ', NOMS)).toEqual({
      valide: true,
      url: 'https://cdn.club.test/blason.png',
    });
  });

  it('refuse le http simple — iOS ne l’affiche pas', () => {
    // Le refus doit être posé ICI, à la saisie, où le message est lisible.
    // Laissé passer, il donnerait un trou sur l'iPhone d'un supporter, et le
    // club chercherait la panne du côté de son fichier.
    const v = verifierImageDistante('http://cdn.club.test/blason.png', NOMS);
    expect(v.valide).toBe(false);
    expect(v.valide === false && v.raison).toContain('https://');
  });

  it('refuse des identifiants glissés dans l’adresse', () => {
    // `https://moi:secret@…` partirait dans la réponse PUBLIQUE de l'app.
    expect(verifierImageDistante('https://moi:secret@cdn.club.test/b.png', NOMS).valide).toBe(
      false,
    );
  });

  it('refuse le vide, le n’importe quoi et le trop long', () => {
    expect(verifierImageDistante('   ', NOMS).valide).toBe(false);
    expect(verifierImageDistante('mon logo', NOMS).valide).toBe(false);
    expect(
      verifierImageDistante(`https://cdn.club.test/${'a'.repeat(LONGUEUR_MAX_IMAGE)}.png`, NOMS)
        .valide,
    ).toBe(false);
  });

  it('nomme l’image comme l’écran la nomme', () => {
    // Un message qui parle de « l'image » là où le champ dit « affiche »
    // oblige le club à deviner lequel des trois champs de la ligne corriger.
    const logo = verifierLogoAdversaire('http://x.test/a.png');
    const affiche = verifierAffiche('http://x.test/a.png');
    expect(logo.valide === false && logo.raison).toContain('du logo');
    expect(logo.valide === false && logo.raison).toContain('un logo en http');
    expect(affiche.valide === false && affiche.raison).toContain('de l’affiche');
    expect(affiche.valide === false && affiche.raison).toContain('une affiche en http');
  });

  it('LE BLASON ET L’AFFICHE REFUSENT EXACTEMENT LA MÊME CHOSE', () => {
    const refuses = [
      '   ',
      'pas une adresse',
      'http://x.test/a.png',
      'javascript:alert(1)',
      'ftp://x.test/a.png',
      'https://moi:secret@x.test/a.png',
      `https://x.test/${'a'.repeat(LONGUEUR_MAX_IMAGE)}.png`,
    ];
    for (const mauvaise of refuses) {
      expect(verifierLogoAdversaire(mauvaise).valide).toBe(false);
      expect(verifierAffiche(mauvaise).valide).toBe(false);
    }

    const acceptees = [
      'https://cdn.club.test/a.png',
      'https://cdn.club.test/a.jpg?v=2',
      // Une affiche carrée, ou sans extension : on ne juge NI les proportions
      // NI le format. Les lire demanderait de télécharger l'image depuis le
      // serveur, sur une adresse fournie par l'utilisateur.
      'https://cdn.club.test/affiche',
    ];
    for (const bonne of acceptees) {
      expect(verifierLogoAdversaire(bonne).valide).toBe(true);
      expect(verifierAffiche(bonne).valide).toBe(true);
    }
  });
});
