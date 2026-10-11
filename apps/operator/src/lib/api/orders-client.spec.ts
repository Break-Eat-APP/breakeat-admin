/**
 * LE POSTE OPÉRATEUR — l'écran qu'on tient pendant trois heures de service.
 *
 * Ce que ces tests gardent est ce qui se paie au comptoir, devant le client :
 * une session qui saute en plein coup de feu, un numéro qu'on ne peut pas
 * crier, une transition qui part sur la mauvaise route.
 *
 * Deux défauts de ce fichier ont déjà été payés en production, et sont
 * verrouillés ici :
 *
 *  - la **boucle de déconnexion** : un `window.location.reload()` sur 401. Le
 *    tableau lance plusieurs appels au montage ; le premier 401 rechargeait la
 *    page, qui relançait les mêmes appels, qui rechargeaient encore. L'écran
 *    « se connectait puis sautait », sans laisser le temps de rien ;
 *  - la **course au renouvellement** : plusieurs 401 simultanés consommant le
 *    même jeton, dont un seul usage est accepté par le serveur.
 *
 * Le client est rechargé à chaque test : il garde un état de module (le
 * renouvellement partagé), et un test qui hériterait du précédent ne
 * prouverait rien.
 */

type Client = typeof import('./orders-client');

function chargerClient(): Client {
  let client: Client = null as never;
  jest.isolateModules(() => {
    client = require('./orders-client') as Client;
  });
  return client;
}

function reponse(status: number, corps: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as Response;
}

describe('le client du poste opérateur', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  // ─── Le numéro qu'on crie ────────────────────────────────────

  describe('numeroAffiche', () => {
    it('préfère le numéro du JOUR — « 18 » se crie, « BE-00000023 » non', () => {
      const client = chargerClient();
      expect(client.numeroAffiche({ dailyNumber: 18, publicOrderNumber: 'BE-00000023' })).toBe('18');
    });

    it('retombe sur la référence longue quand le numéro du jour manque', () => {
      // Le compteur du jour peut être indisponible (voir `numeroDuJour`) : la
      // commande existe quand même et doit pouvoir être appelée.
      const client = chargerClient();
      expect(client.numeroAffiche({ dailyNumber: null, publicOrderNumber: 'BE-00000023' })).toBe(
        'BE-00000023',
      );
      expect(client.numeroAffiche({ publicOrderNumber: 'BE-00000024' })).toBe('BE-00000024');
    });

    it('n’est pas trompé par le numéro ZÉRO', () => {
      // `0` est un numéro valable, et `||` l'aurait écarté au profit de la
      // référence longue. C'est `!= null` qui est juste ici.
      const client = chargerClient();
      expect(client.numeroAffiche({ dailyNumber: 0, publicOrderNumber: 'BE-1' })).toBe('0');
    });
  });

  // ─── Les transitions du comptoir ─────────────────────────────

  describe('les transitions', () => {
    it('partent sur LA bonne route, en PATCH, avec le jeton', async () => {
      const client = chargerClient();
      fetchMock.mockResolvedValue(reponse(200, { id: 'o-1', status: 'PREPARING' }));

      await client.startPreparingOrder('o-1', 'jeton-1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/orders/o-1/start-preparing');
      expect(init.method).toBe('PATCH');
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer jeton-1');
    });

    it('chacune a sa propre route — une inversion changerait l’état du comptoir', async () => {
      const client = chargerClient();
      fetchMock.mockResolvedValue(reponse(200, {}));

      await client.markOrderReady('o-1', 'jeton-1');
      await client.markOrderPickedUp('o-1', 'jeton-1');
      await client.cancelOrder('o-1', 'jeton-1', 'rupture');

      const routes = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(routes[0]).toContain('/orders/o-1/mark-ready');
      expect(routes[1]).toContain('/orders/o-1/mark-picked-up');
      expect(routes[2]).toContain('/orders/o-1/cancel');
      // Le motif d'annulation est transmis : c'est lui qui part au client.
      expect(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body)).toContain('rupture');
    });

    it('une erreur serveur est remontée telle quelle, pas avalée', async () => {
      // Au comptoir, un bouton qui ne fait rien sans rien dire est pire qu'une
      // erreur : l'équipière appuie trois fois.
      const client = chargerClient();
      fetchMock.mockResolvedValue(reponse(409, { message: 'transition refusée' }));

      await expect(client.markOrderReady('o-1', 'jeton-1')).rejects.toThrow(/409/);
    });
  });

  // ─── La session, en plein service ────────────────────────────

  describe('la session', () => {
    it('RENOUVELLE sur 401 et rejoue, au lieu d’éjecter l’équipière', async () => {
      // Le jeton d'accès vit quinze minutes ; un service dure des heures.
      const client = chargerClient();
      localStorage.setItem('operator_token', 'acces-vieux');
      localStorage.setItem('operator_refresh', 'renouvellement-1');

      fetchMock
        .mockResolvedValueOnce(reponse(401))
        .mockResolvedValueOnce(
          reponse(200, { accessToken: 'acces-neuf', refreshToken: 'renouvellement-2' }),
        )
        .mockResolvedValueOnce(reponse(200, { eventId: 'evt-1', counts: {}, orders: {} }));

      await expect(client.fetchDashboard('evt-1', 'acces-vieux')).resolves.toMatchObject({
        eventId: 'evt-1',
      });

      expect(localStorage.getItem('operator_token')).toBe('acces-neuf');
      expect(localStorage.getItem('operator_refresh')).toBe('renouvellement-2');
      // Le rejeu porte le jeton NEUF.
      const rejeu = fetchMock.mock.calls[2] as [string, RequestInit];
      expect((rejeu[1].headers as Record<string, string>)['Authorization']).toBe('Bearer acces-neuf');
    });

    it('NE RECHARGE JAMAIS la page — c’était la boucle de déconnexion', async () => {
      // Le défaut d'origine : `window.location.reload()` sur 401, avec
      // plusieurs appels au montage. L'écran sautait en boucle.
      const client = chargerClient();
      const recharger = jest.fn();
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: recharger },
        writable: true,
      });
      fetchMock.mockResolvedValue(reponse(401));

      await expect(client.fetchDashboard('evt-1', 'jeton-mort')).rejects.toThrow(/Session expirée/i);

      expect(recharger).not.toHaveBeenCalled();
    });

    it('SIGNALE la fin de session par un événement, et efface les jetons', async () => {
      // La page décide, une seule fois, de revenir au formulaire. Sans jeton de
      // renouvellement, il n'y a rien à tenter.
      const client = chargerClient();
      localStorage.setItem('operator_token', 'jeton-mort');
      const ecoute = jest.fn();
      window.addEventListener(client.SESSION_EXPIREE, ecoute);
      fetchMock.mockResolvedValue(reponse(401));

      await expect(client.fetchDashboard('evt-1', 'jeton-mort')).rejects.toThrow(/Session expirée/i);

      expect(ecoute).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('operator_token')).toBeNull();
      expect(localStorage.getItem('operator_refresh')).toBeNull();
      window.removeEventListener(client.SESSION_EXPIREE, ecoute);
    });

    it('UN SEUL renouvellement pour plusieurs 401 simultanés', async () => {
      // Le serveur consomme le jeton au premier usage : trois renouvellements
      // feraient un succès et deux refus, pris pour une session morte.
      const client = chargerClient();
      localStorage.setItem('operator_token', 'acces-vieux');
      localStorage.setItem('operator_refresh', 'renouvellement-1');

      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/auth/refresh')) {
          return reponse(200, { accessToken: 'acces-neuf', refreshToken: 'renouvellement-2' });
        }
        const entetes = (init?.headers ?? {}) as Record<string, string>;
        return entetes['Authorization'] === 'Bearer acces-neuf'
          ? reponse(200, { eventId: 'evt-1', counts: {}, orders: {} })
          : reponse(401);
      });

      await Promise.all([
        client.fetchDashboard('evt-1', 'acces-vieux'),
        client.fetchDashboard('evt-1', 'acces-vieux'),
        client.fetchDashboard('evt-1', 'acces-vieux'),
      ]);

      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh')),
      ).toHaveLength(1);
    });

    it('reprend le jeton qu’une requête VOISINE vient de renouveler', async () => {
      // Le jeton passé par la page peut être périmé alors que le stockage en
      // porte déjà un neuf : on le reprend plutôt que d'en consommer un autre.
      const client = chargerClient();
      localStorage.setItem('operator_token', 'acces-neuf');
      localStorage.setItem('operator_refresh', 'renouvellement-1');

      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
        const entetes = (init?.headers ?? {}) as Record<string, string>;
        return entetes['Authorization'] === 'Bearer acces-neuf'
          ? reponse(200, { eventId: 'evt-1', counts: {}, orders: {} })
          : reponse(401);
      });

      await expect(client.fetchDashboard('evt-1', 'acces-perime')).resolves.toMatchObject({
        eventId: 'evt-1',
      });

      // Aucun renouvellement consommé : le voisin avait déjà fait le travail.
      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh')),
      ).toHaveLength(0);
    });

    it('la connexion, elle, ne déclenche aucun renouvellement', async () => {
      const client = chargerClient();
      fetchMock.mockResolvedValue(
        reponse(200, { accessToken: 'a', refreshToken: 'r', user: { id: 'u-1' } }),
      );

      await client.login('equipiere@club.fr', 'motdepasse');

      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh')),
      ).toHaveLength(0);
    });
  });
});
