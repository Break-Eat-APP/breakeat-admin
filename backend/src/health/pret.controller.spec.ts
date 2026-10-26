import { PretController } from './pret.controller';
import type { PrismaService } from '../database/prisma.service';

/**
 * `/ready` — LA QUESTION QUE PERSONNE NE POUVAIT POSER.
 *
 * `/health` répond « ok » sans rien vérifier, et c'est voulu : Railway
 * l'interroge en continu, et un conteneur dont la base hoquette une seconde
 * ne doit pas être tué pour autant.
 *
 * Mais les 23-25 octobre, la production a servi du code vieux de quatre jours
 * avec un `/health` parfaitement vert. Une migration avait échoué, Railway
 * gardait l'ancien conteneur, et rien, de l'extérieur, ne le disait. C'est
 * exactement ce trou que ces tests ferment.
 */
describe('/ready', () => {
  /** La réponse HTTP, réduite à ce qui nous intéresse : le code. */
  const reponse = () => {
    const r = { code: 0, status: (c: number) => ((r.code = c), r) };
    return r;
  };

  function monter(opts: { base?: unknown; migrations?: unknown }) {
    const prisma = {
      $queryRaw: jest.fn((strings: TemplateStringsArray) => {
        const sql = strings.join(' ');
        const cas = sql.includes('_prisma_migrations') ? opts.migrations : opts.base;
        if (cas instanceof Error) return Promise.reject(cas);
        return Promise.resolve(cas ?? []);
      }),
    };
    return {
      controleur: new PretController(prisma as unknown as PrismaService),
      prisma,
    };
  }

  it('répond 200 et « pret » quand tout va', async () => {
    const { controleur } = monter({ base: [{ '?column?': 1 }], migrations: [] });
    const res = reponse();

    const corps = await controleur.pret(res as never);

    expect(res.code).toBe(200);
    expect(corps.status).toBe('pret');
    expect(corps.base.ok).toBe(true);
    expect(corps.migrations.ok).toBe(true);
  });

  /**
   * LE CAS QUI A MOTIVÉ CE FICHIER — l'état `P3009`.
   *
   * Une migration commencée et jamais finie bloque TOUTES les suivantes, en
   * silence, à chaque déploiement. Le serveur démarre, répond, encaisse — avec
   * un schéma à moitié posé.
   */
  it('répond 503 quand une migration est restée en échec, et la NOMME', async () => {
    const { controleur } = monter({
      base: [{ '?column?': 1 }],
      migrations: [{ migration_name: '20261023_note_de_commande' }],
    });
    const res = reponse();

    const corps = await controleur.pret(res as never);

    expect(res.code).toBe(503);
    expect(corps.status).toBe('pas-pret');
    expect(corps.migrations.ok).toBe(false);
    // Sans le nom, on sait qu'il y a un problème et pas lequel : la moitié
    // du service rendu.
    expect(corps.migrations.detail).toContain('20261023_note_de_commande');
  });

  /**
   * Une VRAIE requête, pas un ping de socket : un pool épuisé ou une base en
   * lecture seule répond au TCP et refuse les requêtes.
   */
  it('répond 503 quand la base refuse une requête', async () => {
    const { controleur } = monter({
      base: new Error('too many connections'),
      migrations: [],
    });
    const res = reponse();

    const corps = await controleur.pret(res as never);

    expect(res.code).toBe(503);
    expect(corps.base.ok).toBe(false);
    expect(corps.base.detail).toContain('too many connections');
  });

  /**
   * Une base montée à la main (test, bac à sable) n'a pas d'historique
   * Prisma. Ce n'est pas une panne : `/ready` crierait au loup sur tout
   * environnement jetable.
   */
  it('ne s’alarme pas d’une base sans historique Prisma', async () => {
    const { controleur } = monter({
      base: [{ '?column?': 1 }],
      migrations: new Error('relation "_prisma_migrations" does not exist'),
    });
    const res = reponse();

    const corps = await controleur.pret(res as never);

    expect(res.code).toBe(200);
    expect(corps.migrations.ok).toBe(true);
  });

  /**
   * Le commit est rendu ICI AUSSI : quand `/ready` dit non, la première
   * question est « quelle version refuse ? ». L'avoir sous les yeux évite un
   * second aller-retour.
   */
  it('rend le commit déployé, même en échec', async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'abcdef1234567890';
    const { controleur } = monter({ base: new Error('coupure'), migrations: [] });

    const corps = await controleur.pret(reponse() as never);

    expect(corps.commit).toBe('abcdef1');
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
  });
});
