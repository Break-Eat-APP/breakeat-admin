import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { afficherTelephone, estUnTelephonePlausible, normaliserTelephone } from './telephone';

/**
 * LA TABLE DE CAS, COMMUNE AU SERVEUR ET À L'APPLICATION.
 *
 * La même liste, à l'identique, vit dans
 * `apps/mobile/src/lib/__tests__/telephone.test.ts`. C'est elle qui tient les
 * deux copies ensemble : si l'une des règles change sans l'autre, un des deux
 * jeux de tests tombe.
 *
 * Toute ligne ajoutée ici doit l'être là-bas. Le jour où ce n'est plus vrai,
 * c'est que le serveur et l'app ont recommencé à accepter des choses
 * différentes — ce qui est exactement le défaut qu'on corrige.
 */
const CAS: Array<[string, string | null]> = [
  // ── Les trois formes du MÊME numéro ───────────────────────────
  ['06 12 34 56 78', '+33612345678'],
  ['+33 6 12 34 56 78', '+33612345678'],
  ['0033612345678', '+33612345678'],
  ['0612345678', '+33612345678'],
  ['612345678', '+33612345678'],

  // ── Séparateurs ──────────────────────────────────────────────
  ['06.12.34.56.78', '+33612345678'],
  ['(06) 12-34-56-78', '+33612345678'],
  ['06 12 34 56 78', '+33612345678'],
  ['06 12 34 56 78', '+33612345678'],

  // ── Le zéro national de trop, après l'indicatif ──────────────
  ['+33 06 12 34 56 78', '+33612345678'],
  ['0033 06 12 34 56 78', '+33612345678'],

  // ── Ce que l'ancienne règle acceptait, et qui n'est pas un numéro ──
  ['---------', null],
  ['.........', null],
  ['()()()()()', null],
  ['   ', null],
  ['', null],
  ['abcdefghij', null],
  ['06 12 34 56 7A', null],

  // ── Dix zéros : huit chiffres après « 00 », donc assez longs ─────
  ['0000000000', null],
  ['+00000000', null],

  // ── Longueurs ────────────────────────────────────────────────
  ['12345', null],
  ['+33', null],
  ['+33612345', null],
  ['0612345678901', null],
  ['+1234567890123456', null],

  // ── Étranger, en forme internationale ────────────────────────
  ['+32 477 12 34 56', '+32477123456'],
  ['+1 212 555 0123', '+12125550123'],
  ['+49 151 23456789', '+4915123456789'],

  // ── Fixes français ───────────────────────────────────────────
  ['01 42 00 00 00', '+33142000000'],
  ['09 70 00 00 00', '+33970000000'],
];

describe('normaliserTelephone', () => {
  it.each(CAS)('« %s » → %s', (saisie, attendu) => {
    expect(normaliserTelephone(saisie)).toBe(attendu);
  });

  it('rend null sans saisie', () => {
    expect(normaliserTelephone(null)).toBeNull();
    expect(normaliserTelephone(undefined)).toBeNull();
  });

  /**
   * LE DÉFAUT QUI MOTIVE TOUT CE FICHIER.
   *
   * L'expression précédente — `/^\+?[\d\s\-().]{7,20}$/` — acceptait la
   * ponctuation seule : neuf tirets étaient un numéro valide, côté serveur
   * comme côté application. Le comptoir héritait d'un champ rempli avec
   * lequel il ne pouvait joindre personne.
   */
  it('refuse une saisie sans aucun chiffre, là où l’ancienne règle l’acceptait', () => {
    const ancienneRegle = /^\+?[\d\s\-().]{7,20}$/;
    for (const sansChiffre of ['---------', '.........', '() () () ()', '--- --- ---']) {
      expect(ancienneRegle.test(sansChiffre)).toBe(true);
      expect(normaliserTelephone(sansChiffre)).toBeNull();
    }
  });

  /**
   * CE QUI RENDAIT UN CLIENT IRRECONNAISSABLE.
   *
   * Les trois saisies ci-dessous désignent le même téléphone et donnaient
   * trois valeurs différentes en base. Le lien Flaix recevait l'une ou
   * l'autre selon l'humeur du client au moment de l'inscription.
   */
  it('rapproche les écritures d’un même numéro', () => {
    const memes = ['06 12 34 56 78', '+33612345678', '0033 6 12 34 56 78', '612345678', '+33 06 12 34 56 78'];
    const formes = new Set(memes.map((m) => normaliserTelephone(m)));
    expect(formes.size).toBe(1);
    expect([...formes][0]).toBe('+33612345678');
  });

  /**
   * L'ÉCART ENTRE LES DEUX BORNES, qui n'existe plus.
   *
   * L'application exigeait 9 caractères, le serveur 7 : « 1234567 » passait
   * le DTO et était refusé par le formulaire. Les deux posent désormais la
   * même question, et la réponse ne dépend plus de qui la pose.
   */
  it('refuse des deux côtés ce que seule une des deux bornes refusait', () => {
    expect(normaliserTelephone('1234567')).toBeNull();
    expect(normaliserTelephone('12345678')).toBeNull();
  });
});

describe('estUnTelephonePlausible', () => {
  it('suit normaliserTelephone', () => {
    expect(estUnTelephonePlausible('06 12 34 56 78')).toBe(true);
    expect(estUnTelephonePlausible('---------')).toBe(false);
    expect(estUnTelephonePlausible(undefined)).toBe(false);
  });
});

/**
 * LES DEUX COPIES N'ONT PAS DIVERGÉ.
 *
 * Une table de cas identique des deux côtés prouve que les deux fichiers
 * répondent pareil AUX CAS QU'ON A PENSÉS. Elle ne dit rien d'un cas qu'on
 * n'a pas écrit, et c'est justement là qu'une divergence s'installerait sans
 * bruit : quelqu'un corrige un bord dans l'un, l'autre reste en arrière, et
 * les deux jeux de tests continuent de passer.
 *
 * On compare donc le CODE lui-même, commentaires retirés — les deux bandeaux
 * se renvoient l'un à l'autre et diffèrent forcément.
 *
 * SAUTE SI LE FICHIER MOBILE EST ABSENT : ce test tourne aussi dans des
 * contextes qui ne copient que `backend/`. Une copie supprimée casserait de
 * toute façon la compilation de l'application au premier import.
 */
describe('la copie mobile', () => {
  const chemin = join(__dirname, '../../../../apps/mobile/src/lib/telephone.ts');

  const sansCommentaires = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .join('\n');

  const dispo = existsSync(chemin);

  (dispo ? it : it.skip)('porte exactement le même code que le serveur', () => {
    const ici = readFileSync(join(__dirname, 'telephone.ts'), 'utf-8');
    const laBas = readFileSync(chemin, 'utf-8');
    expect(sansCommentaires(laBas)).toBe(sansCommentaires(ici));
  });
});

describe('afficherTelephone', () => {
  it('rend sa forme lisible à un numéro français', () => {
    expect(afficherTelephone('+33612345678')).toBe('06 12 34 56 78');
    expect(afficherTelephone('+33142000000')).toBe('01 42 00 00 00');
  });

  it('laisse l’étranger tel quel — on ne sait pas le découper', () => {
    expect(afficherTelephone('+32477123456')).toBe('+32477123456');
    expect(afficherTelephone('+12125550123')).toBe('+12125550123');
  });

  it('rend une chaîne vide sans numéro', () => {
    expect(afficherTelephone(null)).toBe('');
    expect(afficherTelephone(undefined)).toBe('');
    expect(afficherTelephone('')).toBe('');
  });

  it('fait l’aller-retour avec la normalisation', () => {
    const e164 = normaliserTelephone('06 12 34 56 78');
    expect(normaliserTelephone(afficherTelephone(e164))).toBe(e164);
  });
});
