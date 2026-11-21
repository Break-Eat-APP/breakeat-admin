import { ConfigService } from '@nestjs/config';
import { CommandesClientFlaixService } from './commandes-client-flaix.service';

const ORIGINE = 'https://commande.flaix.test';

function service(url = ORIGINE, cle = 'cle-de-test') {
  const valeurs: Record<string, string> = {
    'app.flaix.commandesUrl': url,
    'app.flaix.commandesApiKey': cle,
  };
  return new CommandesClientFlaixService({
    get: (k: string) => valeurs[k],
  } as unknown as ConfigService);
}

const MAINTENANT = new Date('2026-11-22T21:00:00+01:00');

const commandeBrute = (sur: Record<string, unknown> = {}) => ({
  reference: 1003,
  jeton: '0123456789abcdef0123456789abcdef',
  passeeLe: '2026-11-22T20:10:00+01:00',
  statut: 'en_attente',
  paiement: 'au_retrait',
  evenement: { id: 'om-lens', nom: 'Marseille vs Lens', jour: '2026-11-22' },
  lieu: { id: 'velodrome', idInterne: 74, nom: 'Orange Vélodrome', ville: 'Marseille' },
  pointDeRetrait: 'Tribune Nord',
  retraitPrevu: '2026-11-22T20:13:00+01:00',
  lignes: [{ produit: 'Frites', quantite: 2, prixUnitaireTtc: 5, tauxTva: 10, totalTtc: 10 }],
  total: { ttc: 10, ht: 9.09, tva: 0.91, devise: 'EUR' },
  lienSuivi: `${ORIGINE}/api/public/orders/0123456789abcdef0123456789abcdef`,
  lienRecu: `${ORIGINE}/api/public/orders/0123456789abcdef0123456789abcdef/receipt.pdf`,
  ...sur,
});

function reponse(corps: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => corps } as Response;
}

describe('CommandesClientFlaixService', () => {
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it("est éteint sans URL ni clé, et n'appelle pas Flaix", async () => {
    const r = await service('', '').pourEmail('client@exemple.fr', MAINTENANT);
    expect(r).toEqual({ active: false, commandes: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("n'appelle pas Flaix sans e-mail", async () => {
    const r = await service().pourEmail(null, MAINTENANT);
    expect(r).toEqual({ active: true, commandes: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("demande les commandes avec la clé et l'e-mail, puis lit l'état en direct", async () => {
    fetchMock
      .mockResolvedValueOnce(reponse({ commandes: [commandeBrute()] }))
      .mockResolvedValueOnce(
        reponse({ status: 'ready', status_label: 'Prête', status_hint: 'Viens la chercher.', pickup_str: '20:15' }),
      );

    const r = await service().pourEmail(' Client@Exemple.fr ', MAINTENANT);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${ORIGINE}/api/public/clients/commandes`);
    expect(init.headers['X-Api-Key']).toBe('cle-de-test');
    expect(JSON.parse(init.body)).toEqual({ email: 'client@exemple.fr' });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${ORIGINE}/api/public/orders/0123456789abcdef0123456789abcdef/status`,
    );

    expect(r.active).toBe(true);
    expect(r.commandes).toHaveLength(1);
    const c = r.commandes[0];
    expect(c).toMatchObject({
      numero: '1003',
      lieu: 'Orange Vélodrome',
      evenement: 'Marseille vs Lens',
      pointDeRetrait: 'Tribune Nord',
      etat: 'ready',
      etatLibelle: 'Prête',
      prete: true,
      enCours: true,
      retraitAffiche: '20:15',
      totalTtc: 10,
    });
    expect(c.lignes).toEqual([{ produit: 'Frites', quantite: 2, totalTtc: 10, tauxTva: 10 }]);
  });

  it("ne lit pas l'état d'une commande ancienne, qui n'est plus en cours", async () => {
    fetchMock.mockResolvedValueOnce(
      reponse({ commandes: [commandeBrute({ passeeLe: '2026-08-11T17:36:00+02:00' })] }),
    );
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.commandes[0]).toMatchObject({ enCours: false, etat: null, etatLibelle: 'En attente' });
  });

  it('une commande récupérée sort des commandes en cours', async () => {
    fetchMock
      .mockResolvedValueOnce(reponse({ commandes: [commandeBrute()] }))
      .mockResolvedValueOnce(reponse({ status: 'collected', status_label: 'Récupérée' }));
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(r.commandes[0]).toMatchObject({ enCours: false, prete: false, etatLibelle: 'Récupérée' });
  });

  it('une panne de Flaix rend une liste vide, sans exception', async () => {
    fetchMock.mockRejectedValueOnce(new Error('délai dépassé'));
    await expect(service().pourEmail('client@exemple.fr', MAINTENANT)).resolves.toEqual({
      active: true,
      indisponible: true,
      commandes: [],
    });
  });

  it.each(['http://commande.flaix.test', 'https://moi:secret@commande.flaix.test', 'pas une adresse'])(
    "s'éteint avec une origine non sûre (%s) : rien ne part en clair",
    async (url) => {
      const r = await service(url).pourEmail('client@exemple.fr', MAINTENANT);
      expect(r).toEqual({ active: false, commandes: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("garde l'origine seule quand l'adresse configurée porte un chemin", async () => {
    fetchMock.mockResolvedValueOnce(reponse({ commandes: [] }));
    await service(`${ORIGINE}/api/`).pourEmail('client@exemple.fr', MAINTENANT);
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGINE}/api/public/clients/commandes`);
  });

  it("borne la liste à 50 commandes et les lectures d'état à 5", async () => {
    const nombreuses = Array.from({ length: 60 }, (_, i) =>
      commandeBrute({
        jeton: `jeton${String(i).padStart(8, '0')}`,
        passeeLe: new Date(MAINTENANT.getTime() - (i + 1) * 60_000).toISOString(),
      }),
    );
    fetchMock.mockResolvedValueOnce(reponse({ commandes: nombreuses }));
    fetchMock.mockResolvedValue(reponse({ status: 'queued', status_label: 'En attente' }));
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(r.commandes).toHaveLength(50);
    expect(r.commandes[0].id).toBe('jeton00000000');
    expect(fetchMock).toHaveBeenCalledTimes(1 + 5);
  });

  it('une réponse en erreur rend une liste vide', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ erreur: 'clé refusée' }, 401));
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(r.commandes).toEqual([]);
    expect(r.indisponible).toBe(true);
  });

  it("un suivi illisible garde le statut de la liste", async () => {
    fetchMock
      .mockResolvedValueOnce(reponse({ commandes: [commandeBrute()] }))
      .mockRejectedValueOnce(new Error('coupure'));
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(r.commandes[0]).toMatchObject({ etatLibelle: 'En attente', enCours: true, prete: false });
  });

  it("écarte un lien hors de l'origine Flaix et une commande sans jeton valable", async () => {
    fetchMock
      .mockResolvedValueOnce(
        reponse({
          commandes: [
            commandeBrute({ lienRecu: 'https://ailleurs.exemple/recu.pdf', lienSuivi: 'http://commande.flaix.test/x' }),
            commandeBrute({ jeton: '../../admin' }),
          ],
        }),
      )
      .mockResolvedValueOnce(reponse({ status: 'queued', status_label: 'En attente' }));
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(r.commandes).toHaveLength(1);
    expect(r.commandes[0].lienRecu).toBeNull();
    expect(r.commandes[0].lienSuivi).toBeNull();
  });

  it('ne redemande pas la même liste à Flaix dans les 5 secondes', async () => {
    fetchMock
      .mockResolvedValueOnce(reponse({ commandes: [] }))
      .mockResolvedValueOnce(reponse({ commandes: [] }));
    const s = service();
    await s.pourEmail('client@exemple.fr', MAINTENANT);
    await s.pourEmail('CLIENT@exemple.fr', new Date(MAINTENANT.getTime() + 3_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await s.pourEmail('client@exemple.fr', new Date(MAINTENANT.getTime() + 6_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('range les commandes de la plus récente à la plus ancienne', async () => {
    fetchMock.mockResolvedValueOnce(
      reponse({
        commandes: [
          commandeBrute({ jeton: 'aaaaaaaaaaaa', passeeLe: '2026-08-11T17:36:00+02:00' }),
          commandeBrute({ jeton: 'bbbbbbbbbbbb', passeeLe: '2026-11-18T17:08:00+01:00' }),
        ],
      }),
    );
    const r = await service().pourEmail('client@exemple.fr', MAINTENANT);
    expect(r.commandes.map((c) => c.id)).toEqual(['bbbbbbbbbbbb', 'aaaaaaaaaaaa']);
  });
});
