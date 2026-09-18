import { OrderStatus, PaymentStatus } from '@prisma/client';
import { ClientsService } from './clients.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Le fichier client d'un club : ce qu'il contient, et ce qu'il ne doit jamais
 * contenir.
 */
describe('ClientsService', () => {
  const ORG = 'cccccccc-3333-4333-8333-333333333333';
  const LIEU = 'aaaaaaaa-1111-4111-8111-111111111111';
  const MOI = 'moi';

  const JO = 'user-jo';
  const ANA = 'user-ana';

  function monter() {
    const groupBy = jest.fn().mockImplementation((args: { by: string[] }) => {
      // Deux lectures différentes passent par `groupBy` : les totaux par
      // client, et les lieux fréquentés.
      if (args.by.includes('venueId')) {
        return Promise.resolve([
          { userId: JO, venueId: LIEU },
          { userId: ANA, venueId: LIEU },
        ]);
      }
      return Promise.resolve([
        {
          userId: JO,
          _count: { _all: 3 },
          _sum: { totalCents: 3000 },
          _min: { createdAt: new Date('2026-08-01T12:00:00Z') },
          _max: { createdAt: new Date('2026-09-15T12:00:00Z') },
        },
        {
          userId: ANA,
          _count: { _all: 1 },
          _sum: { totalCents: 700 },
          _min: { createdAt: new Date('2026-09-10T12:00:00Z') },
          _max: { createdAt: new Date('2026-09-10T12:00:00Z') },
        },
      ]);
    });

    const prisma = {
      user: {
        // requireOrgAccess relit le rôle en base : SUPER_ADMIN passe partout.
        findUnique: jest.fn().mockResolvedValue({ globalRole: 'SUPER_ADMIN' }),
        findMany: jest.fn().mockResolvedValue([
          { id: JO, displayName: 'Jo Bricole', email: 'jo@exemple.fr', phone: '0600000000' },
          { id: ANA, displayName: 'Ana', email: 'ana@exemple.fr', phone: null },
        ]),
      },
      order: { groupBy },
      venue: { findMany: jest.fn().mockResolvedValue([{ id: LIEU, name: 'Vélodrome' }]) },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          { productNameSnapshot: 'Bière', quantity: 4, order: { userId: JO } },
          { productNameSnapshot: 'Burger', quantity: 1, order: { userId: JO } },
          { productNameSnapshot: 'Frites', quantity: 2, order: { userId: ANA } },
        ]),
      },
    } as unknown as PrismaService;

    return { service: new ClientsService(prisma), prisma, groupBy };
  }

  it('compte les commandes, le total et le panier moyen de chaque client', async () => {
    const { service } = monter();
    const [premier] = await service.lister(ORG, MOI);

    expect(premier).toMatchObject({
      nom: 'Jo Bricole',
      email: 'jo@exemple.fr',
      telephone: '0600000000',
      commandes: 3,
      totalCents: 3000,
      panierMoyenCents: 1000,
    });
  });

  it('classe du plus dépensier au moins dépensier', async () => {
    const { service } = monter();
    const clients = await service.lister(ORG, MOI);
    expect(clients.map((c) => c.nom)).toEqual(['Jo Bricole', 'Ana']);
  });

  it('donne les périodes : première et dernière commande', async () => {
    const { service } = monter();
    const [jo] = await service.lister(ORG, MOI);
    expect(jo.premiereCommande).toBe('2026-08-01T12:00:00.000Z');
    expect(jo.derniereCommande).toBe('2026-09-15T12:00:00.000Z');
  });

  it('nomme les lieux fréquentés et le produit préféré', async () => {
    const { service } = monter();
    const [jo, ana] = await service.lister(ORG, MOI);
    expect(jo.lieux).toEqual(['Vélodrome']);
    // Quatre bières contre un burger : c'est la QUANTITÉ qui tranche, pas le
    // nombre de commandes où le produit apparaît.
    expect(jo.produitPrefere).toBe('Bière');
    expect(ana.produitPrefere).toBe('Frites');
  });

  it('ne compte que les commandes PAYÉES et non annulées', async () => {
    // Même convention que la comptabilité : deux règles différentes donneraient
    // deux totaux pour le même client, et on croirait la page cassée.
    const { service, groupBy } = monter();
    await service.lister(ORG, MOI);

    const where = groupBy.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.paymentStatus).toBe(PaymentStatus.SUCCEEDED);
    expect(where.status).toEqual({ not: OrderStatus.CANCELLED });
  });

  it('restreint à un lieu et à une période quand on le demande', async () => {
    const { service, groupBy } = monter();
    const du = new Date('2026-09-01T00:00:00Z');
    await service.lister(ORG, MOI, { venueId: LIEU, du });

    const where = groupBy.mock.calls[0][0].where;
    expect(where.venueId).toBe(LIEU);
    expect(where.createdAt).toEqual({ gte: du });
  });

  it('rend une liste vide sans interroger le reste', async () => {
    const { service, prisma } = monter();
    (prisma.order.groupBy as jest.Mock).mockResolvedValue([]);
    expect(await service.lister(ORG, MOI)).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('survit à un compte supprimé', async () => {
    // La commande reste en comptabilité même si le compte a disparu : la ligne
    // ne doit pas faire tomber l'export.
    const { service, prisma } = monter();
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    const [premier] = await service.lister(ORG, MOI);
    expect(premier.nom).toBe('Compte supprimé');
    expect(premier.email).toBe('');
  });

  describe('export CSV', () => {
    it('contient les mêmes lignes que l’écran, en-têtes compris', async () => {
      const { service } = monter();
      const { csv, lignes, nomFichier } = await service.exporterCsv(ORG, MOI);

      expect(lignes).toBe(2);
      expect(nomFichier).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(csv).toContain('Nom;E-mail;Téléphone');
      expect(csv).toContain('Jo Bricole;jo@exemple.fr;0600000000;3;30,00;10,00');
      expect(csv).toContain('Vélodrome');
      expect(csv).toContain('Bière');
    });

    it('laisse la case vide quand le téléphone est absent', async () => {
      // Aucun écran de l'app ne le demande aujourd'hui : la colonne sera vide
      // pour la quasi-totalité des clients, et ce vide doit rester propre.
      const { service } = monter();
      const { csv } = await service.exporterCsv(ORG, MOI);
      expect(csv).toContain('Ana;ana@exemple.fr;;1;7,00');
    });
  });
});
