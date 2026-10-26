import {
  adresseAvecPool,
  resumePool,
  CONNEXIONS_PAR_INSTANCE,
  ATTENTE_POOL,
} from './pool';

/**
 * LE POOL EST-IL DÉCIDÉ, OU DEVINÉ ?
 *
 * Sans option, Prisma ouvre `cœurs × 2 + 1` connexions. Dans un conteneur, le
 * nombre de cœurs rapporté est souvent celui de la machine hôte : la même
 * image ouvre 9 connexions ici et 33 ailleurs, sans qu'une ligne de code ait
 * changé.
 *
 * Multiplié par le nombre d'instances, c'est la panne du soir de gros match :
 * on ajoute un replica pour encaisser l'affluence, et c'est lui qui épuise les
 * connexions. L'API répond « too many connections » pendant que le processeur
 * s'ennuie.
 *
 * Ces tests tiennent deux choses : que la valeur est bien posée, et que
 * l'exploitant garde le dernier mot.
 */
describe('pool de connexions', () => {
  const BASE = 'postgresql://u:p@hote:5432/base';

  it('pose les trois paramètres quand rien n’est dit', () => {
    const u = new URL(adresseAvecPool(BASE) as string);
    expect(u.searchParams.get('connection_limit')).toBe(String(CONNEXIONS_PAR_INSTANCE));
    expect(u.searchParams.get('pool_timeout')).toBe(String(ATTENTE_POOL));
    expect(u.searchParams.get('connect_timeout')).toBeTruthy();
  });

  /**
   * Le point qui compte autant que le reste : un exploitant qui pose
   * `?connection_limit=25` dans Railway doit l'emporter. Un correctif qui
   * écrase un réglage délibéré se retourne contre celui qui l'a posé.
   */
  it('RESPECTE une limite déjà choisie par l’exploitant', () => {
    const u = new URL(adresseAvecPool(`${BASE}?connection_limit=25`) as string);
    expect(u.searchParams.get('connection_limit')).toBe('25');
    // Et complète quand même ce qui manque.
    expect(u.searchParams.get('pool_timeout')).toBe(String(ATTENTE_POOL));
  });

  it('préserve les paramètres étrangers, comme sslmode', () => {
    const u = new URL(adresseAvecPool(`${BASE}?sslmode=require`) as string);
    expect(u.searchParams.get('sslmode')).toBe('require');
    expect(u.searchParams.get('connection_limit')).toBe(String(CONNEXIONS_PAR_INSTANCE));
  });

  it('préserve le schéma que Prisma ajoute', () => {
    const u = new URL(adresseAvecPool(`${BASE}?schema=public`) as string);
    expect(u.searchParams.get('schema')).toBe('public');
  });

  /**
   * Sans adresse, on ne fabrique rien : Prisma lèvera sa propre erreur, bien
   * plus parlante que tout ce qu'on écrirait ici.
   */
  it('ne fabrique rien sans adresse', () => {
    expect(adresseAvecPool(undefined)).toBeUndefined();
    expect(adresseAvecPool('')).toBeUndefined();
  });

  /**
   * Mieux vaut un pool par défaut qu'une base injoignable : une adresse qu'on
   * ne sait pas lire se passe telle quelle.
   */
  it('passe une adresse non standard sans la mutiler', () => {
    expect(adresseAvecPool('pas-une-url')).toBe('pas-une-url');
  });

  describe('résumé pour le journal de démarrage', () => {
    it('dit les valeurs retenues', () => {
      expect(resumePool(BASE)).toContain(`connexions ${CONNEXIONS_PAR_INSTANCE}`);
      expect(resumePool(BASE)).toContain('attente pool');
    });

    /**
     * Cette ligne part dans les journaux. Une adresse de base y donnerait un
     * accès complet aux données — identifiants compris.
     */
    it('ne laisse JAMAIS filtrer l’adresse ni le mot de passe', () => {
      const resume = resumePool('postgresql://admin:motdepasse@hote:5432/prod');
      expect(resume).not.toContain('motdepasse');
      expect(resume).not.toContain('admin');
      expect(resume).not.toContain('hote');
    });

    it('le dit quand aucune adresse n’est posée', () => {
      expect(resumePool(undefined)).toBe('aucune adresse de base');
    });
  });
});
