import { afficherTelephone, estUnTelephonePlausible, normaliserTelephone } from '../telephone';

/**
 * LA TABLE DE CAS, COMMUNE AU SERVEUR ET À L'APPLICATION.
 *
 * La même liste, à l'identique, vit dans
 * `backend/src/common/helpers/telephone.spec.ts`. C'est elle qui tient les
 * deux copies ensemble : si l'une des règles change sans l'autre, un des deux
 * jeux de tests tombe.
 *
 * Toute ligne ajoutée ici doit l'être là-bas. Le jour où ce n'est plus vrai,
 * c'est que le serveur et l'app ont recommencé à accepter des choses
 * différentes — ce qui est exactement le défaut qu'on corrige : l'application
 * exigeait 9 caractères quand le serveur en demandait 7.
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
   * LE DÉFAUT QUI MOTIVE CE FICHIER.
   *
   * L'expression du formulaire — `/^\+?[\d\s\-().]{9,20}$/` — acceptait la
   * ponctuation seule. Neuf tirets passaient le contrôle de l'écran et
   * partaient au serveur, qui les acceptait aussi.
   */
  it('refuse une saisie sans aucun chiffre, là où l’ancienne règle l’acceptait', () => {
    const ancienneRegleEcran = /^\+?[\d\s\-().]{9,20}$/;
    for (const sansChiffre of ['---------', '.........', '() () () ()', '--- --- ---']) {
      expect(ancienneRegleEcran.test(sansChiffre)).toBe(true);
      expect(normaliserTelephone(sansChiffre)).toBeNull();
    }
  });

  /**
   * L'ÉCART ENTRE L'ÉCRAN ET LE SERVEUR.
   *
   * L'écran exigeait 9 caractères, le DTO 7. « 1234567 » était refusé ici et
   * accepté là-bas — et un client qui corrigeait son profil depuis une autre
   * page pouvait enregistrer ce que l'inscription venait de lui refuser.
   */
  it('pose la même borne que le serveur', () => {
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
