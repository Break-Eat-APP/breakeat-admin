import { SurveillanceCommandesFlaixService } from './surveillance-commandes-flaix.service';
import type { CommandeFlaix, CommandesClientFlaixService, EtatFlaix } from './commandes-client-flaix.service';
import type { ExpoPushService } from '../notifications/expo-push.service';
import type { PushTokensService } from '../notifications/push-tokens.service';

const MAINTENANT = new Date('2026-11-22T20:30:00+01:00');

const commande = (sur: Partial<CommandeFlaix> = {}): CommandeFlaix => ({
  id: 'jeton000000000001',
  numero: '1047',
  passeeLe: '2026-11-22T20:10:00+01:00',
  lieu: 'Palais Omnisports Marseille',
  ville: 'Marseille',
  evenement: 'Marseille Vs Chamonix',
  pointDeRetrait: 'Tribune Nord',
  retraitPrevu: null,
  retraitAffiche: null,
  lignes: [],
  totalTtc: 10,
  devise: 'EUR',
  etat: 'queued',
  etatLibelle: 'En attente',
  etatDetail: null,
  prete: false,
  enCours: true,
  lienSuivi: null,
  lienRecu: null,
  ...sur,
});

const etat = (e: string): EtatFlaix => ({ etat: e, libelle: null, detail: null, retraitAffiche: null });

function monter(etats: Record<string, (EtatFlaix | null)[]> = {}) {
  const lireEtat = jest.fn(async (jeton: string) => (etats[jeton]?.shift() ?? null));
  const send = jest.fn(async (m: unknown[]) => ({ sent: m.length, failed: 0, invalidTokens: [] as string[] }));
  const tokensForUsers = jest.fn(async () => ['ExponentPushToken[a]']);
  const purgeInvalid = jest.fn(async () => undefined);
  const s = new SurveillanceCommandesFlaixService(
    { lireEtat } as unknown as CommandesClientFlaixService,
    { send } as unknown as ExpoPushService,
    { tokensForUsers, purgeInvalid } as unknown as PushTokensService,
  );
  return { s, lireEtat, send, tokensForUsers };
}

describe('SurveillanceCommandesFlaixService', () => {
  it("retient une commande en cours, pas une commande prête ni terminée", () => {
    const { s } = monter();
    s.surveiller('u1', [
      commande({ id: 'jeton000000000001' }),
      commande({ id: 'jeton000000000002', prete: true, etat: 'ready' }),
      commande({ id: 'jeton000000000003', enCours: false }),
    ]);
    expect(s.taille).toBe(1);
  });

  it("ne retient pas deux fois la même commande", () => {
    const { s } = monter();
    s.surveiller('u1', [commande()]);
    s.surveiller('u1', [commande()]);
    expect(s.taille).toBe(1);
  });

  it("envoie « Ta commande est prête » au passage à prête, une seule fois", async () => {
    const { s, send, tokensForUsers } = monter({
      jeton000000000001: [etat('queued'), etat('ready'), etat('ready')],
    });
    s.surveiller('u1', [commande()]);

    await s.tourner(MAINTENANT);
    expect(send).not.toHaveBeenCalled();

    await s.tourner(MAINTENANT);
    expect(tokensForUsers).toHaveBeenCalledWith(['u1']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[a]',
        title: 'Ta commande est prête',
        body: 'Commande n° 1047 — à récupérer au point de retrait Tribune Nord.',
        data: { type: 'order_ready', source: 'flaix' },
      }),
    ]);
    expect(s.taille).toBe(0);

    await s.tourner(MAINTENANT);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("une liste lue juste avant « prête » ne fait pas annoncer deux fois", async () => {
    const { s, send } = monter({ jeton000000000001: [etat('ready'), etat('ready')] });
    s.surveiller('u1', [commande()]);
    await s.tourner(MAINTENANT);
    expect(send).toHaveBeenCalledTimes(1);
    // La liste en cache dit encore « en attente » :
    s.surveiller('u1', [commande()]);
    expect(s.taille).toBe(0);
    await s.tourner(MAINTENANT);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('arrête de surveiller une commande récupérée ou annulée, sans rien envoyer', async () => {
    const { s, send } = monter({ jeton000000000001: [etat('collected')] });
    s.surveiller('u1', [commande()]);
    await s.tourner(MAINTENANT);
    expect(s.taille).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('garde la commande quand Flaix ne répond pas', async () => {
    const { s, send } = monter({ jeton000000000001: [null, etat('ready')] });
    s.surveiller('u1', [commande()]);
    await s.tourner(MAINTENANT);
    expect(s.taille).toBe(1);
    await s.tourner(MAINTENANT);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('abandonne une commande passée il y a plus de 12 h, sans interroger Flaix', async () => {
    const { s, lireEtat } = monter();
    s.surveiller('u1', [commande({ passeeLe: '2026-11-22T06:00:00+01:00' })]);
    await s.tourner(MAINTENANT);
    expect(s.taille).toBe(0);
    expect(lireEtat).not.toHaveBeenCalled();
  });

  it("une erreur d'envoi ne casse pas le tour", async () => {
    const { s, send } = monter({ jeton000000000001: [etat('ready')] });
    send.mockRejectedValueOnce(new Error('Expo injoignable'));
    s.surveiller('u1', [commande()]);
    await expect(s.tourner(MAINTENANT)).resolves.toBeUndefined();
    expect(s.taille).toBe(0);
  });

  it('ne fait rien sans commande surveillée', async () => {
    const { s, lireEtat } = monter();
    await s.tourner(MAINTENANT);
    expect(lireEtat).not.toHaveBeenCalled();
  });
});
