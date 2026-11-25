/**
 * LE SUIVI DES COMMANDES FLAIX, EN BASE (24/11/2026) : « Ta commande est
 * prête » et la Live Activity, sur une VRAIE base.
 *
 * Remplace les tests de la version en mémoire : mêmes promesses (une seule
 * notification, 3 essais au plus, rien au-delà de 12 h), plus celles de la
 * Live Activity et de la persistance.
 */
import { LiveActivityStatus } from '@prisma/client';
import { SurveillanceCommandesFlaixService } from '../../src/modules/flaix/surveillance-commandes-flaix.service';
import type { CommandeFlaix } from '../../src/modules/flaix/commandes-client-flaix.service';
import { monterServices, unique } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

// L'HEURE DU TEST SUIT L'HORLOGE (25/11/2026). Une date fixe passait en local
// le 24 au soir et échouait en CI le lendemain : la base pose « prochaine
// lecture » à son propre `now()`, qui dépassait alors cette date fixe, et
// aucune commande n'était due. Une minute dans le futur : toujours due.
const T0 = new Date(Date.now() + 60_000);
const plus = (ms: number) => new Date(T0.getTime() + ms);

function commande(p: Partial<CommandeFlaix> = {}): CommandeFlaix {
  return {
    id: unique('jeton').replace(/[^A-Za-z0-9_-]/g, ''),
    numero: '1003',
    passeeLe: T0.toISOString(),
    lieu: 'Guillaume Stadium',
    ville: 'Lyon',
    evenement: 'U2',
    pointDeRetrait: 'Burger king',
    retraitPrevu: null,
    retraitAffiche: null,
    lignes: [],
    totalTtc: 14.87,
    devise: 'EUR',
    etat: 'queued',
    etatLibelle: 'En attente',
    etatDetail: null,
    prete: false,
    enCours: true,
    lienSuivi: null,
    lienRecu: null,
    ...p,
  };
}

decrire('suivi des commandes Flaix (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  let etats: Record<string, string | null>;
  let envois: number;
  let reussite: boolean;
  let apns: { token: string; event: string; status: string }[];

  const lireEtat = async (jeton: string) =>
    etats[jeton] == null ? null : { etat: etats[jeton] as string, libelle: null, detail: null, retraitAffiche: null };
  const service = () =>
    new SurveillanceCommandesFlaixService(
      s.prisma,
      { lireEtat } as never,
      {
        send: async (msgs: unknown[]) => {
          envois += msgs.length;
          return { sent: reussite ? msgs.length : 0, invalidTokens: [] };
        },
      } as never,
      { tokensForUsers: async () => ['ExponentPushToken[x]'], purgeInvalid: async () => undefined } as never,
      {
        sendLiveActivityUpdate: async (token: string, event: string, etat: { status: string }) => {
          apns.push({ token, event, status: etat.status });
          return { ok: true, status: 200, tokenInvalid: false };
        },
      } as never,
    );

  let userId: string;
  beforeEach(async () => {
    etats = {};
    envois = 0;
    reussite = true;
    apns = [];
    userId = (
      await s.prisma.user.create({
        data: { email: `${unique('client')}@test.fr`, passwordHash: 'x', displayName: 'Client' },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  const suivi = (jeton: string) => s.prisma.suiviCommandeFlaix.findUniqueOrThrow({ where: { jeton } });

  it('suit une commande en cours, une seule fois, et garde une commande prête sans la réannoncer', async () => {
    const svc = service();
    const enCours = commande();
    const prete = commande({ etat: 'ready', prete: true });
    const finie = commande({ enCours: false, etat: 'delivered' });
    await svc.surveiller(userId, [enCours, prete, finie]);
    await svc.surveiller(userId, [enCours]);

    expect(await s.prisma.suiviCommandeFlaix.count({ where: { userId } })).toBe(2);
    expect((await suivi(prete.id)).preteAnnoncee).toBe(true);
  });

  it('annonce « prête » une fois, passe au rythme lent, puis clôt à la remise avec la Live Activity', async () => {
    const svc = service();
    const c = commande();
    await svc.surveiller(userId, [c]);
    await svc.enregistrerActivite({ userId, jeton: c.id, activityId: 'act-1', pushToken: 'ab'.repeat(32) });

    etats[c.id] = 'preparing';
    await svc.tourner(T0);
    expect(apns).toEqual([{ token: 'ab'.repeat(32), event: 'update', status: 'PREPARING' }]);

    etats[c.id] = 'ready';
    await svc.tourner(plus(15_000));
    let l = await suivi(c.id);
    expect(envois).toBe(1);
    expect(l.preteAnnoncee).toBe(true);
    expect(l.prochaineLecture.getTime()).toBe(plus(75_000).getTime());

    // Pas encore l'heure : rien n'est relu.
    await svc.tourner(plus(30_000));
    expect(envois).toBe(1);

    etats[c.id] = 'delivered';
    await svc.tourner(plus(75_000));
    l = await suivi(c.id);
    expect(l.termine).toBe(true);
    expect(l.remiseLe?.getTime()).toBe(plus(75_000).getTime());
    expect(apns.at(-1)).toEqual({ token: 'ab'.repeat(32), event: 'end', status: 'COLLECTED' });
    const act = await s.prisma.liveActivityFlaix.findFirstOrThrow({ where: { jeton: c.id } });
    expect(act.status).toBe(LiveActivityStatus.ENDED);
    expect(envois).toBe(1);
  });

  it('retente un envoi raté, puis abandonne après 3 essais', async () => {
    const svc = service();
    const c = commande();
    await svc.surveiller(userId, [c]);
    etats[c.id] = 'ready';
    reussite = false;
    await svc.tourner(T0);
    await svc.tourner(plus(15_000));
    expect((await suivi(c.id)).preteAnnoncee).toBe(false);
    await svc.tourner(plus(75_000));
    const l = await suivi(c.id);
    expect(l.preteAnnoncee).toBe(true);
    expect(l.essaisAnnonce).toBe(3);
  });

  it('garde la commande quand Flaix ne répond pas', async () => {
    const svc = service();
    const c = commande();
    await svc.surveiller(userId, [c]);
    await svc.tourner(T0);
    const l = await suivi(c.id);
    expect(l.termine).toBe(false);
    expect(l.prochaineLecture.getTime()).toBe(plus(15_000).getTime());
  });

  it('abandonne une commande passée il y a plus de 12 h', async () => {
    const svc = service();
    const c = commande();
    await svc.surveiller(userId, [c]);
    etats[c.id] = 'queued';
    await svc.tourner(plus(13 * 3600_000));
    expect((await suivi(c.id)).termine).toBe(true);
  });

  it('suivi depuis l’app : rend l’état de départ, et refuse le jeton d’un autre', async () => {
    const svc = service();
    const c = commande({ etat: 'preparing' });
    const etat = await svc.suivreDepuisLApp(userId, c.id, [c]);
    expect(etat).toMatchObject({ status: 'PREPARING', orderNumber: '1003', pickupPoint: 'Burger king' });

    const autre = (
      await s.prisma.user.create({ data: { email: `${unique('autre')}@test.fr`, passwordHash: 'x', displayName: 'Autre' } })
    ).id;
    await expect(svc.suivreDepuisLApp(autre, c.id, [])).rejects.toThrow(/introuvable/);
    await expect(
      svc.enregistrerActivite({ userId: autre, jeton: c.id, activityId: 'x', pushToken: 'cd'.repeat(32) }),
    ).rejects.toThrow(/introuvable/);
  });
});
