/**
 * Une photo se remplit, un logo se centre.
 *
 * La carte affichait `imageUrl` — le LOGO du club — recadré en `cover` : un
 * écusson étiré sur toute la largeur, contour tronqué. Ces tests fixent le
 * cadrage de chaque visuel, et surtout les replis : ce sont eux qui lâchent
 * en silence le jour où un club n'a pas encore mis sa photo.
 */
import { visuelDeLieu, type LieuVisuel } from '../visuel-lieu';

const lieu = (over: Partial<LieuVisuel> = {}): LieuVisuel => ({
  name: 'Stade Vélodrome',
  photoUrl: null,
  imageUrl: null,
  ...over,
});

describe('le visuel d’un lieu', () => {
  it('la PHOTO remplit le cadre', () => {
    const v = visuelDeLieu(lieu({ photoUrl: 'https://img/stade.jpg' }));

    expect(v).toEqual({ type: 'image', uri: 'https://img/stade.jpg', cadrage: 'cover' });
  });

  it('sans photo, le LOGO du club — centré, pas rogné', () => {
    const v = visuelDeLieu(lieu({ imageUrl: 'https://img/ecusson.png' }));

    expect(v).toEqual({ type: 'image', uri: 'https://img/ecusson.png', cadrage: 'contain' });
  });

  it('la photo passe DEVANT le logo quand les deux existent', () => {
    const v = visuelDeLieu(lieu({ photoUrl: 'https://img/stade.jpg', imageUrl: 'https://img/e.png' }));

    expect(v).toEqual({ type: 'image', uri: 'https://img/stade.jpg', cadrage: 'cover' });
  });

  it('sur une petite tuile, le logo d’abord', () => {
    // Un écusson se reconnaît dans 56 px ; un bout de pelouse recadré, non.
    const v = visuelDeLieu(
      lieu({ photoUrl: 'https://img/stade.jpg', imageUrl: 'https://img/e.png' }),
      'logo',
    );

    expect(v).toEqual({ type: 'image', uri: 'https://img/e.png', cadrage: 'contain' });
  });

  it('… et retombe sur la photo si le club n’a pas de logo', () => {
    const v = visuelDeLieu(lieu({ photoUrl: 'https://img/stade.jpg' }), 'logo');

    expect(v).toEqual({ type: 'image', uri: 'https://img/stade.jpg', cadrage: 'cover' });
  });

  it('une URL VIDE est traitée comme absente', () => {
    // Elle passe un simple test de présence et affiche un carré cassé.
    const v = visuelDeLieu(lieu({ photoUrl: '', imageUrl: '   ' }));

    expect(v).toEqual({ type: 'lettre', lettre: 'S' });
  });

  it('une URL entourée d’espaces est nettoyée, pas rejetée', () => {
    const v = visuelDeLieu(lieu({ photoUrl: '  https://img/stade.jpg  ' }));

    expect(v).toEqual({ type: 'image', uri: 'https://img/stade.jpg', cadrage: 'cover' });
  });

  it('sans aucun visuel, l’initiale du nom', () => {
    expect(visuelDeLieu(lieu({ name: 'palais des sports' }))).toEqual({
      type: 'lettre',
      lettre: 'P',
    });
  });

  it('un nom vide donne « ? », pas une pastille vide', () => {
    // Une pastille vide se prend pour un chargement qui n'aboutit pas.
    expect(visuelDeLieu(lieu({ name: '   ' }))).toEqual({ type: 'lettre', lettre: '?' });
  });

  it('un champ absent vaut un champ nul', () => {
    // L'API peut ne pas renvoyer la clé du tout (favori enregistré avant que
    // le champ existe) : ce cas ne doit pas lever.
    expect(visuelDeLieu({ name: 'Zénith' })).toEqual({ type: 'lettre', lettre: 'Z' });
  });
});
