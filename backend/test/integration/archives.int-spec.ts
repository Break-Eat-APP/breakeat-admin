/**
 * Comptes et organisations archivés ou supprimés : rien ne doit bloquer.
 *
 * Joué sur une VRAIE base Postgres construite par les migrations de production.
 * Les règles de suppression et d'unicité vivent dans le SQL des migrations,
 * qui diverge par endroits de `schema.prisma` : une doublure ne les verrait pas.
 *
 * Lancer :
 *   DATABASE_URL_TEST=postgresql://… pnpm test:integration
 * Sans cette variable, la suite est ignorée.
 */
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { RecuService } from '../../src/modules/orders/recu.service';
import { adresseTemoin, libererCompteArchive } from '../../src/common/helpers/liberation-archives';
import { UsersService } from '../../src/modules/users/users.service';
import { monterServices, unique, creerOrganisationComplete, creerCommande } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('comptes et organisations archivés ou supprimés (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const jeton = 'x'.repeat(30);
  const mail = (p: string) => `${unique(p)}@test.fr`;
  let sa: string;

  const inscrire = (email: string, password = 'motdepasse1') =>
    s.auth.register({ email, password, displayName: 'Jo' } as never);
  const archiver = (id: string) => s.backoffice.setUserActive(id, false, sa);
  const viaApple = (subject: string, email: string) => {
    s.apple.prochaine = { provider: 'apple', subject, email, emailVerifie: true };
    return s.auth.connexionSociale({ provider: 'apple', token: jeton });
  };

  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: mail('sa'),
          passwordHash: 'x',
          displayName: 'SA',
          globalRole: 'SUPER_ADMIN',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  describe('réinscription après archivage', () => {
    it('par e-mail : un compte NEUF, l’ancien garde son historique', async () => {
      const email = mail('client');
      const ancien = await inscrire(email);
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      await creerCommande(s.prisma, ancien.user.id, o);
      await archiver(ancien.user.id);

      const neuf = await inscrire(email, 'autremotdepasse');

      expect(neuf.user.id).not.toBe(ancien.user.id);
      expect(neuf.user.email).toBe(email);
      // L'ancien garde ses commandes : la comptabilité reste juste.
      const apres = await s.prisma.user.findUniqueOrThrow({ where: { id: ancien.user.id } });
      expect(apres.email).toBe(adresseTemoin(ancien.user.id));
      expect(apres.archivedEmail).toBe(email);
      expect(await s.prisma.order.count({ where: { userId: ancien.user.id } })).toBe(1);
      // Le compte neuf ne voit RIEN de l'ancien.
      expect(await s.prisma.order.count({ where: { userId: neuf.user.id } })).toBe(0);
    });

    it('par Apple, identité liée à un compte archivé : un compte neuf', async () => {
      const sujet = unique('sub');
      const email = mail('apple');
      const ancien = await viaApple(sujet, email);
      await archiver(ancien.user.id);

      const neuf = await viaApple(sujet, email);

      expect(neuf.user.id).not.toBe(ancien.user.id);
      const identite = await s.prisma.userIdentity.findUniqueOrThrow({
        where: { provider_subject: { provider: 'apple', subject: sujet } },
      });
      expect(identite.userId).toBe(neuf.user.id);
    });

    it('par Apple, même adresse qu’un compte e-mail archivé : un compte neuf', async () => {
      const email = mail('mix');
      const ancien = await inscrire(email);
      await archiver(ancien.user.id);

      const neuf = await viaApple(unique('sub'), email);

      expect(neuf.user.id).not.toBe(ancien.user.id);
    });

    it('un compte ACTIF bloque toujours l’inscription', async () => {
      const email = mail('actif');
      await inscrire(email);
      await expect(inscrire(email)).rejects.toThrow(ConflictException);
    });

    it('l’ancien mot de passe ne rouvre pas le compte, et le message dit quoi faire', async () => {
      const email = mail('login');
      const ancien = await inscrire(email);
      await archiver(ancien.user.id);

      const tentative = s.auth.login({ email, password: 'motdepasse1' } as never);
      await expect(tentative).rejects.toThrow(UnauthorizedException);
      await expect(s.auth.login({ email, password: 'motdepasse1' } as never)).rejects.toThrow(
        /réinscrire/,
      );
    });

    it('les sessions et jetons push de l’ancien compte meurent à la libération', async () => {
      const email = mail('jetons');
      const ancien = await inscrire(email);
      const appareil = unique('ExponentPushToken');
      await s.prisma.pushToken.create({
        data: { userId: ancien.user.id, token: appareil, platform: 'ios' },
      });
      await archiver(ancien.user.id);

      const neuf = await inscrire(email);

      await expect(s.auth.refresh(ancien.refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(await s.prisma.pushToken.count({ where: { token: appareil } })).toBe(0);
      // Le même téléphone peut s'enregistrer pour le compte neuf.
      await s.prisma.pushToken.create({
        data: { userId: neuf.user.id, token: appareil, platform: 'ios' },
      });
    });

    it('un membre d’équipe archivé ne retrouve pas son club en se réinscrivant', async () => {
      const email = mail('staff');
      const ancien = await inscrire(email);
      await creerOrganisationComplete(s.prisma, unique('org'), ancien.user.id);
      await archiver(ancien.user.id);

      const neuf = await inscrire(email);

      const moi = await new UsersService(s.prisma).findByIdWithMemberships(neuf.user.id);
      expect(moi.memberships).toHaveLength(0);
    });

    it('deux réinscriptions simultanées : une seule réussit, sans casse', async () => {
      const email = mail('course');
      const ancien = await inscrire(email);
      await archiver(ancien.user.id);

      const r = await Promise.allSettled([inscrire(email), inscrire(email)]);

      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(await s.prisma.user.count({ where: { email } })).toBe(1);
    });
  });

  describe('réactivation depuis le back-office', () => {
    it('reprend son adresse si personne ne s’en est servi', async () => {
      const email = mail('reprise');
      const ancien = await inscrire(email);
      await archiver(ancien.user.id);
      // Adresse libérée, mais personne ne l'a reprise (inscription abandonnée
      // après la libération, par exemple).
      await libererCompteArchive(s.prisma, { email });

      const r = await s.backoffice.setUserActive(ancien.user.id, true, sa);

      expect(r.email).toBe(email);
      expect(r.isActive).toBe(true);
    });

    it('refuse clairement si la personne s’est réinscrite entre-temps', async () => {
      const email = mail('conflit');
      const ancien = await inscrire(email);
      await archiver(ancien.user.id);
      await inscrire(email);

      await expect(s.backoffice.setUserActive(ancien.user.id, true, sa)).rejects.toThrow(
        /nouvelle inscription/,
      );
    });

    it('la liste montre l’adresse d’origine et signale qu’elle a été rendue', async () => {
      const email = mail('liste');
      const ancien = await inscrire(email);
      await archiver(ancien.user.id);
      await inscrire(email);

      const liste = await s.backoffice.listUsers();
      const ligne = liste.find((u) => u.id === ancien.user.id);

      expect(ligne?.email).toBe(email);
      expect(ligne?.adresseLiberee).toBe(true);
    });
  });

  describe('suppression de compte', () => {
    it('un compte chargé (Apple, notifications, jetons, fidélité, panier) se supprime, puis on se réinscrit', async () => {
      const email = mail('plein');
      const a = await viaApple(unique('sub'), email);
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      await s.prisma.userNotification.create({
        data: { userId: a.user.id, title: 't', body: 'b' },
      });
      await s.prisma.pushToken.create({
        data: { userId: a.user.id, token: unique('ExponentPushToken'), platform: 'ios' },
      });
      await s.prisma.loyaltyAccount.create({
        data: { userId: a.user.id, organizationId: o.org.id },
      });
      await s.prisma.cart.create({
        data: {
          userId: a.user.id,
          eventId: o.event.id,
          supplierId: o.supplier.id,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

      await s.backoffice.deleteUser(a.user.id, sa);
      const neuf = await inscrire(email);

      expect(neuf.user.id).not.toBe(a.user.id);
    });

    it('un compte avec commandes est refusé (la comptabilité), l’archivage prend le relais', async () => {
      const email = mail('cmd');
      const a = await inscrire(email);
      await creerCommande(
        s.prisma,
        a.user.id,
        await creerOrganisationComplete(s.prisma, unique('org'), sa),
      );

      await expect(s.backoffice.deleteUser(a.user.id, sa)).rejects.toThrow(/commande/);
      await archiver(a.user.id);
      await expect(inscrire(email)).resolves.toBeDefined();
    });
  });

  describe('organisations', () => {
    it('une organisation complète avec commandes se supprime ; les commandes restent lisibles', async () => {
      const client = await inscrire(mail('c'));
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      const commande = await creerCommande(s.prisma, client.user.id, o);

      await s.backoffice.deleteOrganization(o.org.id);

      // « Mes commandes » et le reçu ne doivent pas tomber sur une commande
      // dont le club n'existe plus.
      const mesCommandes = await OrdersService.prototype.withPickupGuidance.call(
        { prisma: s.prisma } as never,
        [commande],
      );
      expect(mesCommandes[0].supplierName).toBeNull();
      const recu = await new RecuService(s.prisma).html(commande.id);
      expect(recu).toContain(commande.publicOrderNumber);
    });

    it('le slug d’une organisation supprimée se réutilise', async () => {
      const slug = unique('org');
      const o = await creerOrganisationComplete(s.prisma, slug, sa);
      await s.backoffice.deleteOrganization(o.org.id);
      await expect(
        s.backoffice.createOrganization({ name: 'Club', slug } as never),
      ).resolves.toBeDefined();
    });

    it('le slug d’une organisation SUSPENDUE se libère pour une organisation neuve', async () => {
      const slug = unique('org');
      const o = await creerOrganisationComplete(s.prisma, slug, sa);
      await s.backoffice.setOrganizationStatus(o.org.id, false);

      const neuve = await s.backoffice.createOrganization({ name: 'Club', slug } as never);

      expect(neuve.slug).toBe(slug);
      const ancienne = await s.prisma.organization.findUniqueOrThrow({ where: { id: o.org.id } });
      expect(ancienne.slug).not.toBe(slug);
      expect(ancienne.archivedSlug).toBe(slug);
    });

    it('le slug d’une organisation ACTIVE reste protégé, avec un message clair', async () => {
      const slug = unique('org');
      await creerOrganisationComplete(s.prisma, slug, sa);
      await expect(
        s.backoffice.createOrganization({ name: 'Club', slug } as never),
      ).rejects.toThrow(/déjà celui de l'organisation active/);
    });

    it('réactivée, une organisation reprend son slug s’il est libre', async () => {
      const slug = unique('org');
      const o = await creerOrganisationComplete(s.prisma, slug, sa);
      await s.backoffice.setOrganizationStatus(o.org.id, false);
      const neuve = await s.backoffice.createOrganization({ name: 'Club', slug } as never);
      await s.backoffice.deleteOrganization(neuve.id);

      const r = await s.backoffice.setOrganizationStatus(o.org.id, true);

      expect(r.slug).toBe(slug);
      expect(r.archivedSlug).toBeNull();
    });

    it('réactivée alors que son slug est repris, elle revient quand même', async () => {
      const slug = unique('org');
      const o = await creerOrganisationComplete(s.prisma, slug, sa);
      await s.backoffice.setOrganizationStatus(o.org.id, false);
      await s.backoffice.createOrganization({ name: 'Club', slug } as never);

      const r = await s.backoffice.setOrganizationStatus(o.org.id, true);

      expect(r.status).toBe('ACTIVE');
      expect(r.slug).not.toBe(slug);
    });

    it('la remise à zéro fonctionne avec commandes et points de retrait', async () => {
      const client = await inscrire(mail('c'));
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      await creerCommande(s.prisma, client.user.id, o);
      await expect(s.backoffice.resetOrgData(o.org.id, o.org.name)).resolves.toBeDefined();
    });

    it('un membre d’une organisation supprimée garde un compte utilisable', async () => {
      const email = mail('membre');
      const a = await inscrire(email);
      const o = await creerOrganisationComplete(s.prisma, unique('org'), a.user.id);
      await s.backoffice.deleteOrganization(o.org.id);

      await expect(
        s.auth.login({ email, password: 'motdepasse1' } as never),
      ).resolves.toBeDefined();
    });

    it('les tableaux de bord ouvrent l’organisation ACTIVE, pas une ancienne suspendue', async () => {
      const a = await inscrire(mail('manager'));
      const ancienne = await creerOrganisationComplete(s.prisma, unique('org'), a.user.id);
      const actuelle = await creerOrganisationComplete(s.prisma, unique('org'), a.user.id);
      await s.backoffice.setOrganizationStatus(actuelle.org.id, false);
      await s.backoffice.setOrganizationStatus(actuelle.org.id, true);
      await s.backoffice.setOrganizationStatus(ancienne.org.id, false);

      const moi = await new UsersService(s.prisma).findByIdWithMemberships(a.user.id);

      expect(moi.memberships[0].organizationId).toBe(actuelle.org.id);
    });
  });

  describe('données de démonstration', () => {
    /**
     * Une commande de l'ancien passage en caisse de démonstration, telle qu'il
     * les écrivait : payée, avec lignes, paiement, points dépensés et gagnés,
     * créneau occupé, historique et Live Activity.
     */
    async function commandeDemo(
      userId: string,
      o: Awaited<ReturnType<typeof creerOrganisationComplete>>,
      compteFidelite: string,
      creneau: string,
    ) {
      const commande = await s.prisma.order.create({
        data: {
          publicOrderNumber: `DEMO-${unique('X').toUpperCase()}`,
          userId,
          organizationId: o.org.id,
          eventId: o.event.id,
          venueId: o.venue.id,
          supplierId: o.supplier.id,
          pickupPointId: o.pickup.id,
          slotId: creneau,
          status: 'PAID',
          paymentStatus: 'SUCCEEDED',
          subtotalCents: 1400,
          discountCents: 200,
          totalCents: 1200,
          pointsRedeemed: 20,
          pointsEarned: 12,
          items: {
            create: {
              productId: o.product.id,
              productNameSnapshot: 'Bière',
              unitPriceCentsSnapshot: 700,
              quantity: 2,
              lineTotalCents: 1400,
            },
          },
          auditTrail: { create: { actorType: 'SYSTEM', nextState: 'PAID' } },
        },
      });
      await s.prisma.payment.create({
        data: {
          orderId: commande.id,
          stripePaymentIntentId: unique('pi_demo'),
          amountCents: 1200,
          status: 'SUCCEEDED',
        },
      });
      await s.prisma.liveActivity.create({
        data: {
          userId,
          orderId: commande.id,
          activityId: unique('act'),
          pushToken: unique('la'),
        },
      });
      // Les points : −20 dépensés, +12 gagnés, comme la caisse de démo les écrivait.
      await s.prisma.loyaltyTransaction.createMany({
        data: [
          {
            accountId: compteFidelite,
            orderId: commande.id,
            kind: 'REDEEM',
            points: -20,
            balanceAfter: 80,
          },
          {
            accountId: compteFidelite,
            orderId: commande.id,
            kind: 'EARN',
            points: 12,
            balanceAfter: 92,
          },
        ],
      });
      await s.prisma.slot.update({
        where: { id: creneau },
        data: { currentLoad: { increment: 1 } },
      });
      return commande;
    }

    it('la purge efface la démo et ses traces, sans toucher aux vraies commandes', async () => {
      const client = await inscrire(mail('demo'));
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      // Solde réel après la démo : 100 de départ − 20 + 12.
      const compte = await s.prisma.loyaltyAccount.create({
        data: { userId: client.user.id, organizationId: o.org.id, balance: 92 },
      });
      const creneau = await s.prisma.slot.create({
        data: {
          eventId: o.event.id,
          startAt: new Date(Date.now() + 3_600_000),
          endAt: new Date(Date.now() + 7_200_000),
          capacity: 10,
          currentLoad: 1, // une vraie commande
        },
      });
      const vraie = await creerCommande(s.prisma, client.user.id, o);
      const demo = await commandeDemo(client.user.id, o, compte.id, creneau.id);

      const avant = await s.backoffice.apercuDemo();
      const ligne = avant.parOrganisation.find((x) => x.organizationId === o.org.id);
      expect(ligne).toMatchObject({ commandes: 1, montantCents: 1200 });

      const bilan = await s.backoffice.purgerDemo(avant.phraseConfirmation);

      expect(bilan.commandes).toBeGreaterThanOrEqual(1);
      expect(await s.prisma.order.findUnique({ where: { id: demo.id } })).toBeNull();
      expect(await s.prisma.payment.count({ where: { orderId: demo.id } })).toBe(0);
      expect(await s.prisma.orderItem.count({ where: { orderId: demo.id } })).toBe(0);
      expect(await s.prisma.liveActivity.count({ where: { orderId: demo.id } })).toBe(0);
      expect(await s.prisma.loyaltyTransaction.count({ where: { orderId: demo.id } })).toBe(0);
      // Le solde revient à ce qu'il aurait été sans la démo : 92 − (−20 + 12) = 100.
      const solde = await s.prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: compte.id } });
      expect(solde.balance).toBe(100);
      // La place du créneau est rendue ; celle de la vraie commande reste.
      const apres = await s.prisma.slot.findUniqueOrThrow({ where: { id: creneau.id } });
      expect(apres.currentLoad).toBe(1);
      // La vraie commande est intacte.
      expect(await s.prisma.order.findUnique({ where: { id: vraie.id } })).not.toBeNull();
      expect((await s.backoffice.apercuDemo()).commandes).toBe(0);
    });

    it('après la purge, un compte de test qui n’avait QUE de la démo se supprime', async () => {
      const client = await inscrire(mail('testeur'));
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      const compte = await s.prisma.loyaltyAccount.create({
        data: { userId: client.user.id, organizationId: o.org.id, balance: 92 },
      });
      const creneau = await s.prisma.slot.create({
        data: {
          eventId: o.event.id,
          startAt: new Date(),
          endAt: new Date(Date.now() + 3_600_000),
          capacity: 10,
        },
      });
      await commandeDemo(client.user.id, o, compte.id, creneau.id);

      await expect(s.backoffice.deleteUser(client.user.id, sa)).rejects.toThrow(/commande/);
      await s.backoffice.purgerDemo('PURGER LA DEMO');
      await expect(s.backoffice.deleteUser(client.user.id, sa)).resolves.toMatchObject({
        deleted: true,
      });
    });

    it('le solde ne passe jamais sous zéro, même si les points de démo ont été dépensés', async () => {
      const client = await inscrire(mail('depense'));
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      // 12 points gagnés en démo… puis dépensés : le solde réel est à 3.
      const compte = await s.prisma.loyaltyAccount.create({
        data: { userId: client.user.id, organizationId: o.org.id, balance: 3 },
      });
      const creneau = await s.prisma.slot.create({
        data: {
          eventId: o.event.id,
          startAt: new Date(),
          endAt: new Date(Date.now() + 3_600_000),
          capacity: 5,
        },
      });
      await commandeDemo(client.user.id, o, compte.id, creneau.id);
      await s.prisma.loyaltyTransaction.deleteMany({
        where: { accountId: compte.id, kind: 'REDEEM' },
      });

      await s.backoffice.purgerDemo('PURGER LA DEMO');

      const solde = await s.prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: compte.id } });
      expect(solde.balance).toBe(0);
    });

    it('refuse sans la phrase exacte, et n’efface rien', async () => {
      const client = await inscrire(mail('garde'));
      const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
      const compte = await s.prisma.loyaltyAccount.create({
        data: { userId: client.user.id, organizationId: o.org.id, balance: 92 },
      });
      const creneau = await s.prisma.slot.create({
        data: {
          eventId: o.event.id,
          startAt: new Date(),
          endAt: new Date(Date.now() + 3_600_000),
          capacity: 5,
        },
      });
      const demo = await commandeDemo(client.user.id, o, compte.id, creneau.id);

      await expect(s.backoffice.purgerDemo('purger')).rejects.toThrow(/Confirmation incorrecte/);
      expect(await s.prisma.order.findUnique({ where: { id: demo.id } })).not.toBeNull();
      await s.backoffice.purgerDemo('PURGER LA DEMO');
    });
  });
});
