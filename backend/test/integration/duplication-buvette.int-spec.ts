/**
 * Dupliquer une buvette avec sa carte.
 *
 * Ce qui se vérifie ici ne se vérifie qu'en base : la copie touche trois tables
 * dans une transaction, et surtout elle doit produire une buvette RÉELLEMENT
 * indépendante. Une doublure dirait ce qu'on lui souffle ; seule une vraie base
 * montre que modifier la copie ne touche pas l'original.
 */
import { ProductStatus, SupplierStatus } from '@prisma/client';
import { SuppliersService } from '../../src/modules/suppliers/suppliers.service';
import { ProductsService } from '../../src/modules/products/products.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('duplication d’une buvette (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const buvettes = url ? new SuppliersService(s.prisma) : (null as never);
  const produits = url ? new ProductsService(s.prisma) : (null as never);

  let sa: string;
  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: `${unique('sa')}@test.fr`,
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

  it('recopie la carte : catégories, produits, prix et TVA', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    // Un second produit, à un autre taux : c'est justement ce qu'on ne veut
    // pas ressaisir quatre fois, et c'est là qu'une erreur coûte cher.
    const categorie = await s.prisma.category.findFirst({ where: { supplierId: o.supplier.id } });
    await s.prisma.product.create({
      data: {
        supplierId: o.supplier.id,
        categoryId: categorie!.id,
        name: 'Sandwich',
        price: 550,
        vatRateBps: 1000,
      },
    });

    const copie = await buvettes.dupliquer(o.org.id, sa, o.supplier.id, 'Buvette Sud');

    expect(copie.name).toBe('Buvette Sud');
    const carte = await s.prisma.product.findMany({
      where: { supplierId: copie.id },
      orderBy: { name: 'asc' },
    });
    expect(carte.map((p) => p.name)).toEqual(['Bière', 'Sandwich']);
    expect(carte.map((p) => p.price)).toEqual([700, 550]);
    expect(carte.every((p) => p.vatRateBps === 1000)).toBe(true);

    // Les catégories aussi : sans elles, les produits n'auraient nulle part où
    // se ranger sur la carte du client.
    const categories = await s.prisma.category.findMany({ where: { supplierId: copie.id } });
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe('Boissons');
  });

  it('produit une buvette INDÉPENDANTE : la rupture ne se propage pas', async () => {
    // C'est la propriété qui compte. Si les deux buvettes partageaient leurs
    // produits, mettre un fût vide au Nord fermerait le Sud.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const copie = await buvettes.dupliquer(o.org.id, sa, o.supplier.id, 'Buvette Sud');

    const surLaCopie = await s.prisma.product.findFirst({ where: { supplierId: copie.id } });
    await produits.changerDisponibilite(o.org.id, copie.id, surLaCopie!.id, sa, false);

    const apres = await s.prisma.product.findUnique({ where: { id: surLaCopie!.id } });
    const original = await s.prisma.product.findUnique({ where: { id: o.product.id } });
    expect(apres?.status).toBe(ProductStatus.OUT_OF_STOCK);
    expect(original?.status).toBe(ProductStatus.ACTIVE);
  });

  it('ne recopie PAS le stock', async () => {
    // Les quantités décrivent un comptoir physique. Les recopier annoncerait
    // des bouteilles qui n'existent pas.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await s.prisma.stock.create({
      data: { productId: o.product.id, supplierId: o.supplier.id, quantity: 48 },
    });

    const copie = await buvettes.dupliquer(o.org.id, sa, o.supplier.id, 'Buvette Sud');
    expect(await s.prisma.stock.count({ where: { supplierId: copie.id } })).toBe(0);
  });

  it('ne la rattache à AUCUN événement, et la laisse fermée', async () => {
    // Une buvette dupliquée en plein match apparaîtrait aussitôt chez les
    // clients, sans personne derrière le comptoir.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const copie = await buvettes.dupliquer(o.org.id, sa, o.supplier.id, 'Buvette Sud');

    expect(await s.prisma.eventSupplier.count({ where: { supplierId: copie.id } })).toBe(0);
    expect(copie.status).toBe(SupplierStatus.CLOSED);
  });

  it('repart en vente, même si l’original est en rupture', async () => {
    // La rupture décrit le stock d'un comptoir, pas le produit : une buvette
    // neuve n'a aucune raison de naître avec les manques d'une autre.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await produits.changerDisponibilite(o.org.id, o.supplier.id, o.product.id, sa, false);

    const copie = await buvettes.dupliquer(o.org.id, sa, o.supplier.id, 'Buvette Sud');
    const carte = await s.prisma.product.findMany({ where: { supplierId: copie.id } });
    expect(carte.every((p) => p.status === ProductStatus.ACTIVE)).toBe(true);
  });

  it('refuse la buvette d’un AUTRE club', async () => {
    const mien = await creerOrganisationComplete(s.prisma, unique('mien'), sa);
    const autre = await creerOrganisationComplete(s.prisma, unique('autre'), sa);

    await expect(
      buvettes.dupliquer(mien.org.id, sa, autre.supplier.id, 'Vol'),
    ).rejects.toThrow(/introuvable/i);
  });

  it('refuse un nom vide', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await expect(buvettes.dupliquer(o.org.id, sa, o.supplier.id, '   ')).rejects.toThrow(/nom/i);
  });
});
