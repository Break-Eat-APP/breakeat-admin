import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, OrgStatus, GlobalRole } from '@prisma/client';
import { BackofficeService } from './backoffice.service';
import { PrismaService } from '../../database/prisma.service';
import { ExpoPushService } from '../notifications/expo-push.service';
import { PushTokensService } from '../notifications/push-tokens.service';
import { ScheduledPushService } from '../notifications/scheduled-push.service';

/**
 * Unit tests for BackofficeService.
 *
 * Focus areas:
 *  - KPI math: CA HT derived from TTC at the configured 10% rate, average
 *    baskets, and the divide-by-zero guard when there are no paid orders.
 *  - Organisation CRUD: slug-uniqueness conflicts, 404s, and the
 *    activate/deactivate → ACTIVE/SUSPENDED mapping.
 */
describe('BackofficeService', () => {
  let service: BackofficeService;
  let prisma: {
    order: { aggregate: jest.Mock; count: jest.Mock };
    orderItem: { groupBy: jest.Mock };
    user: { count: jest.Mock; findUnique: jest.Mock; update: jest.Mock; delete: jest.Mock };
    organization: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    group: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: { aggregate: jest.fn(), count: jest.fn() },
      // La ventilation TVA lit les lignes de commande groupees par taux.
      // Par defaut : tout a 10 %, le regime historique de la plateforme.
      orderItem: {
        groupBy: jest.fn().mockResolvedValue([
          { vatRateBps: 1000, _sum: { lineTotalCents: 11_000 } },
        ]),
      },
      user: { count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
      organization: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      group: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackofficeService,
        { provide: PrismaService, useValue: prisma },
        // Configured reporting VAT rate = 10% (resto sur place).
        // Notifications push : injectées par le service mais non sollicitées par
        // les cas testés ici (KPIs + CRUD org) → mocks vides suffisants pour la DI.
        { provide: ExpoPushService, useValue: { send: jest.fn() } },
        { provide: PushTokensService, useValue: { tokensForUsers: jest.fn(), purgeInvalid: jest.fn() } },
        { provide: ScheduledPushService, useValue: { schedule: jest.fn(), list: jest.fn(), cancel: jest.fn() } },
      ],
    }).compile();

    service = module.get(BackofficeService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGlobalKpis', () => {
    it('derives CA HT from TTC at 10% and computes average baskets', async () => {
      // 4 paid orders totalling 11_000 cents TTC (110.00€).
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 11_000 },
        _count: { _all: 4 },
      });
      prisma.user.count.mockResolvedValue(42);
      prisma.organization.count.mockResolvedValue(3);

      const kpis = await service.getGlobalKpis();

      // Only SUCCEEDED payments count toward CA.
      expect(prisma.order.aggregate).toHaveBeenCalledWith({
        where: { paymentStatus: PaymentStatus.SUCCEEDED },
        _sum: { totalCents: true },
        _count: { _all: true },
      });

      expect(kpis.revenue.caTtcCents).toBe(11_000);
      // 11000 / 1.10 = 10000 exactly.
      expect(kpis.revenue.caHtCents).toBe(10_000);
      expect(kpis.revenue.vatRate).toBe(0.1);
      expect(kpis.revenue.vatBreakdown).toEqual([
        { vatRateBps: 1000, label: '10 %', ttcCents: 11_000, htCents: 10_000, tvaCents: 1_000 },
      ]);

      expect(kpis.ordersCount).toBe(4);
      // 11000 / 4 = 2750 TTC ; 10000 / 4 = 2500 HT.
      expect(kpis.averageBasket.ttcCents).toBe(2_750);
      expect(kpis.averageBasket.htCents).toBe(2_500);

      expect(kpis.accountsCount).toBe(42);
      expect(kpis.organizationsCount).toBe(3);
    });

    it('rounds CA HT to the nearest cent for non-round totals', async () => {
      // 999 cents TTC → 999 / 1.10 = 908.18… → rounds to 908.
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 999 },
        _count: { _all: 1 },
      });
      prisma.orderItem.groupBy.mockResolvedValue([
        { vatRateBps: 1000, _sum: { lineTotalCents: 999 } },
      ]);
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.count.mockResolvedValue(1);

      const kpis = await service.getGlobalKpis();

      expect(kpis.revenue.caHtCents).toBe(908);
      expect(kpis.averageBasket.htCents).toBe(908);
    });

    it('sépare les trois taux de la restauration', async () => {
      // Une soirée ordinaire : des frites (10 %), de la bière (20 %) et des
      // bouteilles d'eau capsulées vendues à emporter (5,5 %).
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 10_000 },
        _count: { _all: 20 },
      });
      prisma.orderItem.groupBy.mockResolvedValue([
        { vatRateBps: 550, _sum: { lineTotalCents: 2_000 } },
        { vatRateBps: 1000, _sum: { lineTotalCents: 5_000 } },
        { vatRateBps: 2000, _sum: { lineTotalCents: 3_000 } },
      ]);
      prisma.user.count.mockResolvedValue(1);
      prisma.organization.count.mockResolvedValue(1);

      const kpis = await service.getGlobalKpis();

      expect(kpis.revenue.vatBreakdown.map((t) => t.label)).toEqual(['5,5 %', '10 %', '20 %']);
      // Un taux unique à 10 % aurait annoncé 9 091 € de HT ; le vrai chiffre
      // est plus bas, parce que la bière porte deux fois plus de TVA.
      expect(kpis.revenue.caHtCents).toBe(1_896 + 4_545 + 2_500);
      expect(kpis.revenue.caHtCents).toBeLessThan(9_091);
      // Le pied de tableau tombe toujours juste.
      expect(kpis.revenue.vatBreakdown.reduce((n, t) => n + t.ttcCents, 0)).toBe(10_000);
    });

    it('returns zeroes and avoids divide-by-zero when there are no paid orders', async () => {
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: null },
        _count: { _all: 0 },
      });
      prisma.orderItem.groupBy.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      prisma.organization.count.mockResolvedValue(0);

      const kpis = await service.getGlobalKpis();

      expect(kpis.revenue.caTtcCents).toBe(0);
      expect(kpis.revenue.caHtCents).toBe(0);
      expect(kpis.ordersCount).toBe(0);
      expect(kpis.averageBasket.ttcCents).toBe(0);
      expect(kpis.averageBasket.htCents).toBe(0);
    });
  });

  describe('createOrganization', () => {
    it('creates an org shell when the slug is free', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Club X', slug: 'club-x' });

      const result = await service.createOrganization({ name: 'Club X', slug: 'club-x' });

      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Club X', slug: 'club-x' },
      });
      expect(result.id).toBe('org-1');
    });

    it('rejects a duplicate slug with 409', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'existing', slug: 'club-x' });

      await expect(
        service.createOrganization({ name: 'Club X', slug: 'club-x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });
  });

  describe('updateOrganization', () => {
    it('throws 404 when the org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrganization('missing', { name: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a slug already taken by another org', async () => {
      prisma.organization.findUnique
        .mockResolvedValueOnce({ id: 'org-1', slug: 'old-slug' }) // target lookup
        .mockResolvedValueOnce({ id: 'org-2', slug: 'taken' }); // clash lookup

      await expect(
        service.updateOrganization('org-1', { slug: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'club-x' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', name: 'Renamed' });

      await service.updateOrganization('org-1', { name: 'Renamed' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'Renamed' },
      });
    });
  });

  describe('setOrganizationStatus', () => {
    it('maps activate → ACTIVE', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: OrgStatus.ACTIVE });

      await service.setOrganizationStatus('org-1', true);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrgStatus.ACTIVE },
      });
    });

    it('maps deactivate → SUSPENDED', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: OrgStatus.SUSPENDED });

      await service.setOrganizationStatus('org-1', false);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrgStatus.SUSPENDED },
      });
    });

    it('throws 404 for an unknown org', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.setOrganizationStatus('missing', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── setUserActive ────────────────────────────────────────────
  //
  // Les deux verrous protègent d'un verrouillage définitif : les mots de passe
  // sont hachés et il n'existe aucun « mot de passe oublié » pour le
  // back-office. Un blocage de trop et la plateforme est fermée.

  describe('setUserActive', () => {
    const MOI = 'admin-courant';
    const AUTRE = 'compte-cible';

    it('bloque un compte ordinaire', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: AUTRE, email: 'test@club.fr', globalRole: GlobalRole.CUSTOMER, isActive: true,
      });
      prisma.user.update.mockResolvedValue({ id: AUTRE, isActive: false });

      await service.setUserActive(AUTRE, false, MOI);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: AUTRE }, data: { isActive: false } }),
      );
    });

    it('refuse qu’on se bloque soi-même', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: MOI, email: 'moi@breakeat.fr', globalRole: GlobalRole.SUPER_ADMIN, isActive: true,
      });

      await expect(service.setUserActive(MOI, false, MOI)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuse de bloquer le dernier administrateur plateforme actif', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: AUTRE, email: 'admin@breakeat.fr', globalRole: GlobalRole.SUPER_ADMIN, isActive: true,
      });
      prisma.user.count.mockResolvedValue(0); // aucun autre SUPER_ADMIN actif

      await expect(service.setUserActive(AUTRE, false, MOI)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('accepte de bloquer un administrateur s’il en reste un autre', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: AUTRE, email: 'admin2@breakeat.fr', globalRole: GlobalRole.SUPER_ADMIN, isActive: true,
      });
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue({ id: AUTRE, isActive: false });

      await expect(service.setUserActive(AUTRE, false, MOI)).resolves.toBeDefined();
    });

    it('rétablit un compte sans passer par les verrous', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: MOI, email: 'moi@breakeat.fr', globalRole: GlobalRole.SUPER_ADMIN, isActive: false,
      });
      prisma.user.update.mockResolvedValue({ id: MOI, isActive: true });

      await expect(service.setUserActive(MOI, true, MOI)).resolves.toBeDefined();
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('renvoie 404 sur un compte inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setUserActive('inconnu', false, MOI)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── deleteUser ──────────────────────────────────────────────

  describe('deleteUser', () => {
    const MOI = 'admin-courant';
    const AUTRE = 'user-2';

    beforeEach(() => {
      prisma.order.count.mockResolvedValue(0);
    });

    it('supprime un compte sans commande', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: AUTRE, email: 'test@club.fr', globalRole: 'CUSTOMER',
      });

      const res = await service.deleteUser(AUTRE, MOI);

      expect(res.deleted).toBe(true);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: AUTRE } });
    });

    it('refuse un compte porteur de commandes — le CA doit survivre', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: AUTRE, email: 'client@club.fr', globalRole: 'CUSTOMER',
      });
      prisma.order.count.mockResolvedValue(4);

      await expect(service.deleteUser(AUTRE, MOI)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('refuse qu’on se supprime soi-même', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: MOI, email: 'moi@breakeat.fr', globalRole: 'SUPER_ADMIN',
      });

      await expect(service.deleteUser(MOI, MOI)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('refuse le dernier administrateur plateforme actif', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: AUTRE, email: 'admin@breakeat.fr', globalRole: 'SUPER_ADMIN',
      });
      prisma.user.count.mockResolvedValue(0);

      await expect(service.deleteUser(AUTRE, MOI)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('refuse un compte inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteUser('inconnu', MOI)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });
  });

  // ─── resetOrgData ────────────────────────────────────────────

  describe('resetOrgData', () => {
    const ORG_ID = 'org-1';
    const NOM = 'Les Spartiates';

    /** Transaction mockée : compte les suppressions demandées. */
    function transactionQuiCompte(compte = 3) {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          order: { deleteMany: jest.fn().mockResolvedValue({ count: compte }) },
          loyaltyAccount: { deleteMany: jest.fn().mockResolvedValue({ count: compte }) },
          scheduledPush: { deleteMany: jest.fn().mockResolvedValue({ count: compte }) },
          pickupPoint: { deleteMany: jest.fn().mockResolvedValue({ count: compte }) },
          event: { deleteMany: jest.fn().mockResolvedValue({ count: compte }) },
          supplier: { deleteMany: jest.fn().mockResolvedValue({ count: compte }) },
        }),
      );
    }

    it('efface les données quand le nom est recopié exactement', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, name: NOM });
      transactionQuiCompte(3);

      const res = await service.resetOrgData(ORG_ID, NOM);

      expect(res.organization).toBe(NOM);
      expect(res.supprime.evenements).toBe(3);
      expect(res.supprime.buvettes).toBe(3);
    });

    it('refuse un nom approchant — la confirmation doit être exacte', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, name: NOM });

      await expect(service.resetOrgData(ORG_ID, 'les spartiates')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuse une confirmation vide', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, name: NOM });

      await expect(service.resetOrgData(ORG_ID, '   ')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuse une organisation inconnue', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.resetOrgData('inconnue', NOM)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ne touche NI au lieu, NI aux accès, NI aux groupes', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: ORG_ID, name: NOM });
      const tx: Record<string, { deleteMany: jest.Mock }> = {};
      for (const m of ['order', 'loyaltyAccount', 'scheduledPush', 'pickupPoint', 'event', 'supplier']) {
        tx[m] = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      }
      // Toute tentative de viser ces tables ferait planter la transaction : le
      // mock ne les expose pas. C'est l'assertion — le lieu et les accès sont
      // ce qui permet de se reconnecter et de reconfigurer après le ménage.
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

      await service.resetOrgData(ORG_ID, NOM);

      expect(tx.event.deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG_ID } });
      expect(tx.supplier.deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG_ID } });
    });
  });
});
