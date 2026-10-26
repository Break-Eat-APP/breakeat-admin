import { estEnLigne, secretJwtFaible, SECRET_JWT_DE_DEVELOPPEMENT } from './est-en-ligne';

/**
 * RECONNAÎTRE UN DÉPLOIEMENT, SANS DÉPENDRE DE QUI A RÉGLÉ QUOI.
 *
 * `NODE_ENV` valait `staging` sur les DEUX services Railway, production
 * comprise. Tout ce qui en dépendait était inactif en ligne — dont le masquage
 * des erreurs internes, qui renvoyait au client le message brut de PostgreSQL.
 *
 * Ces tests verrouillent les deux sens : reconnaître une mise en ligne même
 * quand `NODE_ENV` ment, et ne JAMAIS la reconnaître sur la machine d'un
 * développeur — sinon il perdrait ses messages d'erreur et chercherait à
 * l'aveugle.
 */
describe('estEnLigne', () => {
  const environnement = process.env;

  beforeEach(() => {
    process.env = { ...environnement };
    for (const cle of Object.keys(process.env)) {
      if (cle.startsWith('RAILWAY_')) delete process.env[cle];
    }
    delete process.env.NODE_ENV;
  });
  afterAll(() => {
    process.env = environnement;
  });

  it('reconnaît un déploiement Railway même si NODE_ENV dit « staging »', () => {
    process.env.NODE_ENV = 'staging';
    process.env.RAILWAY_GIT_COMMIT_SHA = '485e6d7c97368782f20768b50078b06ee6c8d0df';
    expect(estEnLigne()).toBe(true);
  });

  it('reconnaît un déploiement par l’identifiant de service', () => {
    process.env.RAILWAY_SERVICE_ID = 'svc-1';
    expect(estEnLigne()).toBe(true);
  });

  it('accepte encore NODE_ENV=production, pour les hébergeurs qui le posent', () => {
    process.env.NODE_ENV = 'production';
    expect(estEnLigne()).toBe(true);
  });

  /**
   * Le cas qui compte autant que les autres : sur un poste de développement,
   * les messages d'erreur complets doivent rester visibles.
   */
  it('rend faux sur une machine de développement', () => {
    process.env.NODE_ENV = 'development';
    expect(estEnLigne()).toBe(false);
  });

  it('rend faux quand rien n’est renseigné', () => {
    expect(estEnLigne()).toBe(false);
  });
});

describe('secretJwtFaible', () => {
  it('refuse un secret absent', () => {
    expect(secretJwtFaible(undefined)).toBe('absent');
  });

  /**
   * Ce repli est écrit en clair dans le dépôt. Qui le connaît forge le jeton
   * de n'importe qui — SUPER_ADMIN compris, qui franchit toutes les gardes
   * d'organisation.
   */
  it('refuse le repli de développement, publié dans ce dépôt', () => {
    expect(secretJwtFaible(SECRET_JWT_DE_DEVELOPPEMENT)).toMatch(/repli de développement/);
  });

  it('refuse un secret trop court, et dit de combien', () => {
    expect(secretJwtFaible('court')).toBe('trop court (5 caractères, 32 minimum)');
  });

  it('accepte un secret de 32 caractères ou plus', () => {
    expect(secretJwtFaible('a'.repeat(32))).toBeNull();
    expect(secretJwtFaible('a'.repeat(64))).toBeNull();
  });
});
