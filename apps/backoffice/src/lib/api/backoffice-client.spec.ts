/**
 * LA SESSION DU BACK-OFFICE — la mécanique la plus délicate de cette app.
 *
 * Elle est aussi la plus silencieuse quand elle casse : on est renvoyé au
 * login, et ça ressemble à un problème d'identifiants. Le défaut corrigé le
 * 01/10 en est l'exemple — le serveur renvoyait un jeton de renouvellement
 * depuis toujours, personne ne le gardait, et quitter l'écran un quart d'heure
 * suffisait à perdre sa session.
 *
 * Ces tests sont les PREMIERS de cette application. Ils visent ce que le
 * dossier d'audit nomme en priorité : la connexion, le renouvellement, les
 * permissions.
 *
 * Note de méthode : le client est rechargé (`jest.resetModules`) à chaque test.
 * Il garde un état de module — le renouvellement partagé — et un test qui
 * hériterait de celui du précédent ne prouverait rien.
 */

type Client = typeof import('./backoffice-client');

const UTILISATEUR = {
  id: 'u-1',
  email: 'sa@breakeat.fr',
  displayName: 'Super Admin',
  globalRole: 'SUPER_ADMIN',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Charge un client neuf, sans état hérité du test précédent. */
function chargerClient(): Client {
  let client: Client = null as never;
  jest.isolateModules(() => {
    client = require('./backoffice-client') as Client;
  });
  return client;
}

/** Une réponse `fetch` minimale, telle que le client la lit. */
function reponse(status: number, corps: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => corps,
  } as Response;
}

describe('la session du back-office', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  // ─── Ce qui est conservé à la connexion ──────────────────────

  describe('setSession', () => {
    it('garde le jeton de RENOUVELLEMENT, pas seulement celui d’accès', () => {
      // Le défaut : seul le jeton d'accès était stocké. Il vit quinze minutes.
      const client = chargerClient();

      client.setSession('acces-1', UTILISATEUR, 'renouvellement-1');

      expect(client.getToken()).toBe('acces-1');
      expect(client.getRefreshToken()).toBe('renouvellement-1');
      expect(client.getStoredUser()?.email).toBe(UTILISATEUR.email);
    });

    it('n’efface pas un renouvellement existant quand on n’en fournit pas', () => {
      const client = chargerClient();
      client.setSession('acces-1', UTILISATEUR, 'renouvellement-1');

      client.setSession('acces-2', UTILISATEUR);

      expect(client.getRefreshToken()).toBe('renouvellement-1');
    });

    it('clearSession emporte les TROIS clés', () => {
      // Une clé oubliée, c'est une session à moitié morte : le garde de la mise
      // en page laisse passer, et chaque appel échoue.
      const client = chargerClient();
      client.setSession('acces-1', UTILISATEUR, 'renouvellement-1');

      client.clearSession();

      expect(client.getToken()).toBe('');
      expect(client.getRefreshToken()).toBe('');
      expect(client.getStoredUser()).toBeNull();
    });

    it('un utilisateur stocké illisible ne fait pas tomber l’app', () => {
      const client = chargerClient();
      localStorage.setItem('backoffice_user', '{ ceci n’est pas du JSON');

      expect(client.getStoredUser()).toBeNull();
    });
  });

  // ─── Les permissions ─────────────────────────────────────────

  describe('isSuperAdmin — le back-office est réservé', () => {
    it('accepte un SUPER_ADMIN', () => {
      const client = chargerClient();
      expect(client.isSuperAdmin(UTILISATEUR)).toBe(true);
    });

    it('refuse un administrateur de club, et l’absence de compte', () => {
      // Le serveur recontrôle le rôle sur chaque route : ce garde-ci est du
      // confort d'affichage. Mais s'il laissait passer, l'écran se chargerait
      // vide avec des erreurs partout plutôt qu'un refus clair.
      const client = chargerClient();
      expect(client.isSuperAdmin({ ...UTILISATEUR, globalRole: 'ORG_ADMIN' })).toBe(false);
      expect(client.isSuperAdmin(null)).toBe(false);
    });
  });

  // ─── Le renouvellement ───────────────────────────────────────

  describe('le renouvellement après un 401', () => {
    it('RENOUVELLE puis rejoue la requête, au lieu de déconnecter', async () => {
      const client = chargerClient();
      client.setSession('acces-vieux', UTILISATEUR, 'renouvellement-1');

      fetchMock
        .mockResolvedValueOnce(reponse(401)) // la requête, jeton expiré
        .mockResolvedValueOnce(
          reponse(200, { accessToken: 'acces-neuf', refreshToken: 'renouvellement-2' }),
        )
        .mockResolvedValueOnce(reponse(200, { accountsCount: 42 })); // le rejeu

      const kpis = await client.apiGetKpis();

      expect(kpis).toEqual({ accountsCount: 42 });
      // Le nouveau couple est conservé : le serveur fait tourner le jeton.
      expect(client.getToken()).toBe('acces-neuf');
      expect(client.getRefreshToken()).toBe('renouvellement-2');
      // Et le rejeu porte le jeton NEUF, pas l'ancien.
      const rejeu = fetchMock.mock.calls[2]?.[1] as RequestInit;
      expect((rejeu.headers as Record<string, string>)['Authorization']).toBe('Bearer acces-neuf');
    });

    it('UN SEUL renouvellement part, même si trois requêtes prennent un 401 ensemble', async () => {
      // Le serveur consomme le jeton au premier usage : trois renouvellements
      // avec le même jeton, c'est un succès et deux refus — et ces refus
      // passaient pour une session morte. Le défaut avait déjà été payé une
      // fois sur le panneau d'admin.
      const client = chargerClient();
      client.setSession('acces-vieux', UTILISATEUR, 'renouvellement-1');

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/auth/refresh')) {
          return reponse(200, { accessToken: 'acces-neuf', refreshToken: 'renouvellement-2' });
        }
        const entetes = (init?.headers ?? {}) as Record<string, string>;
        return entetes['Authorization'] === 'Bearer acces-neuf'
          ? reponse(200, { ok: true })
          : reponse(401);
      });

      await Promise.all([client.apiGetKpis(), client.apiGetKpis(), client.apiGetKpis()]);

      const renouvellements = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/auth/refresh'),
      );
      expect(renouvellements).toHaveLength(1);
    });

    it('un 401 qui PERSISTE après renouvellement dit que l’action est refusée', async () => {
      // Et ne relance pas la reprise : sans ce garde-fou, chaque clic produisait
      // des dizaines d'appels. Déconnecter serait trompeur — le jeton est bon.
      const client = chargerClient();
      client.setSession('acces-vieux', UTILISATEUR, 'renouvellement-1');

      fetchMock.mockImplementation(async (url: string) =>
        String(url).includes('/auth/refresh')
          ? reponse(200, { accessToken: 'acces-neuf' })
          : reponse(401),
      );

      await expect(client.apiGetKpis()).rejects.toThrow(/droit/i);

      const renouvellements = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/auth/refresh'),
      );
      expect(renouvellements).toHaveLength(1);
      // La session survit : ce n'est pas elle qui est en cause.
      expect(client.getToken()).toBe('acces-neuf');
    });

    it('sans jeton de renouvellement, la session est effacée', async () => {
      const client = chargerClient();
      localStorage.setItem('backoffice_token', 'acces-vieux');
      localStorage.setItem('backoffice_user', JSON.stringify(UTILISATEUR));

      fetchMock.mockResolvedValue(reponse(401));

      await expect(client.apiGetKpis()).rejects.toThrow(/Session expirée/i);
      expect(client.getToken()).toBe('');
      expect(client.getStoredUser()).toBeNull();
    });

    it('un onglet VOISIN qui a déjà renouvelé ne déconnecte pas celui-ci', async () => {
      // Le serveur refuse notre jeton parce qu'un autre onglet l'a consommé.
      // La session vit encore : l'effacer déconnecterait les deux onglets.
      const client = chargerClient();
      client.setSession('acces-vieux', UTILISATEUR, 'renouvellement-1');

      let appelsMetier = 0;
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes('/auth/refresh')) {
          // Entre-temps, le voisin a écrit SON couple dans le même stockage.
          localStorage.setItem('backoffice_token', 'acces-du-voisin');
          localStorage.setItem('backoffice_refresh', 'renouvellement-du-voisin');
          return reponse(401); // notre jeton à nous, lui, est refusé
        }
        appelsMetier += 1;
        // Le premier appel part avec le jeton expiré ; le rejeu, avec celui du
        // voisin. Sans ce décompte, la doublure répondrait 200 du premier coup
        // et le test ne prouverait rien — c'est ce qui s'est produit.
        return appelsMetier === 1 ? reponse(401) : reponse(200, { ok: true });
      });

      await expect(client.apiGetKpis()).resolves.toEqual({ ok: true });
      expect(appelsMetier).toBe(2);
      expect(client.getToken()).toBe('acces-du-voisin');
    });

    it('la CONNEXION qui échoue n’est pas une session expirée', async () => {
      // Un 401 sur une route sans session, c'est un refus : le serveur dit
      // lequel. Le traiter comme une expiration affichait « Session expirée »
      // pour un mauvais mot de passe — et cachait à un compte archivé qu'il
      // pouvait se réinscrire.
      const client = chargerClient();
      fetchMock.mockResolvedValue(reponse(401, { message: 'Invalid credentials' }));

      await expect(client.apiLogin('sa@breakeat.fr', 'faux')).rejects.toThrow(
        /mot de passe incorrect/i,
      );
      // Aucun renouvellement tenté sur la connexion.
      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh')),
      ).toHaveLength(0);
    });
  });
});
