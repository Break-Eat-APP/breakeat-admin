/**
 * LA SESSION DU PANNEAU D'ADMIN — et l'organisation choisie avec elle.
 *
 * C'est ici que le défaut de la course au renouvellement a été payé en
 * production : jeton d'accès expiré, la page Campagnes lançait deux requêtes à
 * la fois, chacune renouvelait avec le MÊME jeton, la première réussissait, la
 * seconde était refusée — et ce refus passait pour une session morte. Tout
 * était effacé, organisation choisie comprise, et « le dashboard sautait au
 * clic » alors que la session était parfaitement valide.
 *
 * Le correctif tient depuis ; rien ne le gardait. Ces tests le gardent.
 *
 * Note de méthode : le client est rechargé à chaque test. Il garde un état de
 * module — le renouvellement partagé — et un test qui hériterait de celui du
 * précédent ne prouverait rien.
 */

type Client = typeof import('./admin-client');

const RESPONSABLE = {
  id: 'u-1',
  email: 'manager@club.fr',
  displayName: 'Responsable',
  globalRole: 'CUSTOMER',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function chargerClient(): Client {
  let client: Client = null as never;
  jest.isolateModules(() => {
    client = require('./admin-client') as Client;
  });
  return client;
}

function reponse(status: number, corps: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => corps,
  } as Response;
}

/** Une session complète, telle que la connexion la laisse. */
function ouvrirSession(client: Client) {
  client.setSessionTokens('acces-vieux', 'renouvellement-1');
  localStorage.setItem('admin_user', JSON.stringify(RESPONSABLE));
  localStorage.setItem('admin_org_id', 'org-1');
  localStorage.setItem('admin_org_name', 'Club test');
}

describe('la session du panneau d’admin', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  // ─── Ce que la session garde ─────────────────────────────────

  describe('le stockage', () => {
    it('conserve les deux jetons, le compte et l’organisation choisie', () => {
      const client = chargerClient();
      ouvrirSession(client);

      expect(client.getToken()).toBe('acces-vieux');
      expect(client.getRefreshToken()).toBe('renouvellement-1');
      expect(client.getStoredUser()?.email).toBe(RESPONSABLE.email);
      expect(client.getOrgId()).toBe('org-1');
      expect(client.getOrgName()).toBe('Club test');
    });

    it('un renouvellement non fourni n’efface pas celui en place', () => {
      const client = chargerClient();
      ouvrirSession(client);

      client.setSessionTokens('acces-neuf');

      expect(client.getToken()).toBe('acces-neuf');
      expect(client.getRefreshToken()).toBe('renouvellement-1');
    });

    it('clearSession emporte AUSSI l’organisation choisie', () => {
      // Elle était oubliée : on revenait connecté mais sans club, devant un
      // dashboard vide qu'aucun message n'expliquait.
      const client = chargerClient();
      ouvrirSession(client);

      client.clearSession();

      expect(client.getToken()).toBe('');
      expect(client.getRefreshToken()).toBe('');
      expect(client.getStoredUser()).toBeNull();
      expect(client.getOrgId()).toBe('');
      expect(client.getOrgName()).toBe('');
    });

    it('un compte stocké illisible ne fait pas tomber l’app', () => {
      const client = chargerClient();
      localStorage.setItem('admin_user', 'ceci n’est pas du JSON');

      expect(client.getStoredUser()).toBeNull();
    });
  });

  // ─── Le renouvellement ───────────────────────────────────────

  describe('le renouvellement après un 401', () => {
    it('renouvelle puis rejoue, avec le jeton NEUF', async () => {
      const client = chargerClient();
      ouvrirSession(client);

      fetchMock
        .mockResolvedValueOnce(reponse(401))
        .mockResolvedValueOnce(
          reponse(200, { accessToken: 'acces-neuf', refreshToken: 'renouvellement-2' }),
        )
        .mockResolvedValueOnce(reponse(200, { id: 'org-1', name: 'Club test' }));

      await expect(client.apiGetOrganization('org-1')).resolves.toEqual({
        id: 'org-1',
        name: 'Club test',
      });

      expect(client.getToken()).toBe('acces-neuf');
      expect(client.getRefreshToken()).toBe('renouvellement-2');
      const rejeu = fetchMock.mock.calls[2]?.[1] as RequestInit;
      expect((rejeu.headers as Record<string, string>)['Authorization']).toBe('Bearer acces-neuf');
    });

    it('UN SEUL renouvellement pour plusieurs 401 simultanés', async () => {
      // LE défaut de production. Le serveur fait tourner le jeton : le premier
      // usage le consomme. Deux renouvellements avec le même jeton, c'est un
      // succès et un refus — et ce refus effaçait toute la session.
      const client = chargerClient();
      ouvrirSession(client);

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/auth/refresh')) {
          return reponse(200, { accessToken: 'acces-neuf', refreshToken: 'renouvellement-2' });
        }
        const entetes = (init?.headers ?? {}) as Record<string, string>;
        return entetes['Authorization'] === 'Bearer acces-neuf'
          ? reponse(200, { ok: true })
          : reponse(401);
      });

      await Promise.all([
        client.apiGetOrganization('org-1'),
        client.apiGetOrgMembers('org-1'),
        client.apiMeWithMemberships(),
      ]);

      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh')),
      ).toHaveLength(1);
      // La session a survécu — c'est tout l'enjeu.
      expect(client.getOrgId()).toBe('org-1');
    });

    it('un 401 qui persiste annonce un REFUS D’ACTION, pas une expiration', async () => {
      // Le jeton est bon : c'est le rôle qui ne permet pas. Déconnecter serait
      // trompeur, et relancer la reprise produirait des dizaines d'appels.
      const client = chargerClient();
      ouvrirSession(client);

      fetchMock.mockImplementation(async (url: string) =>
        String(url).includes('/auth/refresh')
          ? reponse(200, { accessToken: 'acces-neuf' })
          : reponse(401),
      );

      await expect(client.apiGetOrganization('org-1')).rejects.toThrow(/droit|rôle/i);
      expect(client.getToken()).toBe('acces-neuf');
      expect(client.getOrgId()).toBe('org-1');
    });

    it('un onglet voisin qui a déjà renouvelé ne déconnecte pas celui-ci', async () => {
      const client = chargerClient();
      ouvrirSession(client);

      let appelsMetier = 0;
      fetchMock.mockImplementation(async (url: string) => {
        if (String(url).includes('/auth/refresh')) {
          localStorage.setItem('admin_token', 'acces-du-voisin');
          localStorage.setItem('admin_refresh', 'renouvellement-du-voisin');
          return reponse(401); // notre jeton a été consommé par le voisin
        }
        appelsMetier += 1;
        return appelsMetier === 1 ? reponse(401) : reponse(200, { ok: true });
      });

      await expect(client.apiGetOrganization('org-1')).resolves.toEqual({ ok: true });
      expect(appelsMetier).toBe(2);
      expect(client.getToken()).toBe('acces-du-voisin');
      expect(client.getOrgId()).toBe('org-1');
    });

    it('sans jeton de renouvellement, la session est effacée', async () => {
      const client = chargerClient();
      localStorage.setItem('admin_token', 'acces-vieux');
      localStorage.setItem('admin_user', JSON.stringify(RESPONSABLE));
      localStorage.setItem('admin_org_id', 'org-1');

      fetchMock.mockResolvedValue(reponse(401));

      await expect(client.apiGetOrganization('org-1')).rejects.toThrow(/Session expirée/i);
      expect(client.getToken()).toBe('');
      expect(client.getOrgId()).toBe('');
    });

    it('la connexion refusée n’est pas une session expirée', async () => {
      const client = chargerClient();
      fetchMock.mockResolvedValue(reponse(401, { message: 'Invalid credentials' }));

      await expect(client.apiLogin('manager@club.fr', 'faux')).rejects.toThrow(
        /mot de passe incorrect/i,
      );
      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh')),
      ).toHaveLength(0);
    });
  });
});
