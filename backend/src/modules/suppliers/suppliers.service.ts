import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrgRole } from '../../common/enums/role.enum';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto';
import { ProductStatus, SupplierStatus, type Supplier } from '@prisma/client';

/** Projection publique renvoyée à un exploitant externe résolvant un code de parrainage. */
export interface ReferralLookupResult {
  id: string;
  name: string;
  isExternal: boolean;
  organization: { id: string; name: string };
}

/**
 * SuppliersService owns all supplier persistence logic.
 *
 * Access rules:
 * - Read: any org member
 * - Create / Update metadata: ORG_ADMIN or MANAGER
 * - Change status (OPEN/CLOSED/PAUSED): ORG_ADMIN, MANAGER or OPERATOR
 *
 * Note : une buvette n'a plus de compte Stripe propre. L'argent va au compte
 * du CLUB — voir `common/helpers/compte-stripe.ts`. Les colonnes `stripe*`
 * de `Supplier` sont inertes, conservees pour l'historique.
 * It is never set via this service.
 */
@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateSupplierDto,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId,
        name: dto.name,
        preparationZone: dto.preparationZone,
        planUrl: dto.planUrl || null,
        isExternal: dto.isExternal ?? false,
        // Un exploitant externe reçoit d'emblée un code de parrainage unique.
        referralCode: dto.isExternal ? await this.generateUniqueReferralCode() : null,
      },
    });

    this.logger.log(`Supplier created: ${supplier.id} ("${supplier.name}") in org ${organizationId}`);
    return supplier;
  }

  /**
   * Duplique une buvette AVEC sa carte.
   *
   * Quatre points de retrait qui vendent la même chose, c'est quatre fois la
   * même carte à ressaisir — et autant d'occasions de se tromper sur un prix ou
   * un taux de TVA. On copie, on renomme, c'est tout.
   *
   * CE QUI EST COPIÉ : les catégories, les produits, leurs prix, leur TVA,
   * leurs descriptions et leurs images. La carte de la nouvelle buvette est
   * identique à celle de l'ancienne, et parfaitement INDÉPENDANTE ensuite :
   * mettre un produit en rupture ici ne touche pas l'original.
   *
   * CE QUI NE L'EST PAS, et volontairement :
   *
   *  - le STOCK. Les quantités décrivent une réalité physique, celle d'un
   *    comptoir précis. Les recopier annoncerait des bouteilles qui n'existent
   *    pas. Sans ligne de stock, un produit est simplement « non suivi », donc
   *    commandable — c'est la règle déjà en place ;
   *  - le RATTACHEMENT AUX ÉVÉNEMENTS. Une buvette dupliquée pendant un match
   *    apparaîtrait aussitôt sur la carte des clients, sans point de retrait ni
   *    équipe derrière. Le club la rattache quand elle est prête ;
   *  - le CODE DE PARRAINAGE, unique par définition. Un exploitant externe
   *    dupliqué en reçoit un neuf.
   *
   * Tout se fait en UNE transaction : une carte à moitié copiée serait pire
   * qu'un échec franc — le club croirait avoir tout, et découvrirait les
   * manques un soir de service.
   */
  async dupliquer(
    organizationId: string,
    userId: string,
    supplierId: string,
    nouveauNom: string,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const nom = nouveauNom?.trim();
    if (!nom) throw new BadRequestException('Donnez un nom à la nouvelle buvette.');

    const source = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
      include: {
        categories: { include: { products: true } },
      },
    });
    if (!source) throw new NotFoundException('Buvette introuvable');

    const copie = await this.prisma.$transaction(async (tx) => {
      const buvette = await tx.supplier.create({
        data: {
          organizationId,
          name: nom,
          preparationZone: source.preparationZone,
          planUrl: source.planUrl,
          imageUrl: source.imageUrl,
          isExternal: source.isExternal,
          referralCode: source.isExternal ? await this.generateUniqueReferralCode() : null,
          // Fermée à la création : une buvette qui s'ouvrirait seule prendrait
          // des commandes que personne n'attend derrière le comptoir.
          status: SupplierStatus.CLOSED,
        },
      });

      for (const categorie of source.categories) {
        const categorieCopiee = await tx.category.create({
          data: {
            supplierId: buvette.id,
            name: categorie.name,
            sortOrder: categorie.sortOrder,
          },
        });

        for (const produit of categorie.products) {
          await tx.product.create({
            data: {
              supplierId: buvette.id,
              categoryId: categorieCopiee.id,
              name: produit.name,
              description: produit.description,
              price: produit.price,
              vatRateBps: produit.vatRateBps,
              imageUrl: produit.imageUrl,
              availableFrom: produit.availableFrom,
              availableUntil: produit.availableUntil,
              // Une copie repart EN VENTE, même si l'original est en rupture :
              // la rupture décrit le stock d'un comptoir, pas le produit.
              status: ProductStatus.ACTIVE,
            },
          });
        }
      }

      return buvette;
    });

    const combien = source.categories.reduce((n, c) => n + c.products.length, 0);
    this.logger.log(
      `Buvette ${supplierId} dupliquée en ${copie.id} (« ${nom} ») — ${combien} produit(s) copié(s)`,
    );
    return copie;
  }

  /** Génère un code de parrainage unique au format BE-XXXXXX (6 alphanum. sans ambiguïté). */
  private async generateUniqueReferralCode(): Promise<string> {
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I,O,0,1
    for (let attempt = 0; attempt < 10; attempt++) {
      let body = '';
      for (let i = 0; i < 6; i++) body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      const code = `BE-${body}`;
      const clash = await this.prisma.supplier.findUnique({ where: { referralCode: code } });
      if (!clash) return code;
    }
    throw new BadRequestException('Impossible de générer un code de parrainage, réessayez.');
  }

  /** (Re)génère le code de parrainage d'un exploitant — marque aussi la buvette comme externe. */
  async regenerateReferralCode(
    organizationId: string,
    supplierId: string,
    userId: string,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const code = await this.generateUniqueReferralCode();
    return this.prisma.supplier.update({
      where: { id: supplierId },
      data: { isExternal: true, referralCode: code },
    });
  }

  /**
   * Résout une buvette à partir de son code de parrainage.
   *
   * Le code est un SECRET partagé par le club à l'exploitant externe : le posséder
   * fait office d'autorisation (modèle « lien d'invitation »). On n'exige donc PAS
   * que l'appelant soit déjà membre de l'org — sinon l'exploitant externe, par
   * définition non-membre, ne pourrait jamais s'en servir (Codex P2). Le contrôleur
   * impose tout de même une session (JwtAuthGuard). On ne renvoie qu'une projection
   * minimale, sans données sensibles (Stripe, statut, etc.).
   */
  async findByReferralCode(code: string, userId: string): Promise<ReferralLookupResult> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { referralCode: code },
      select: {
        id: true,
        name: true,
        isExternal: true,
        organization: { select: { id: true, name: true } },
      },
    });
    // Réponse identique pour code inexistant ou buvette non marquée externe : pas de fuite.
    if (!supplier || !supplier.isExternal) {
      throw new NotFoundException('Code de parrainage invalide');
    }
    this.logger.log(`Referral code resolved to supplier ${supplier.id} by user ${userId}`);
    return {
      id: supplier.id,
      name: supplier.name,
      isExternal: supplier.isExternal,
      organization: supplier.organization,
    };
  }

  async findAllByOrg(organizationId: string, userId: string): Promise<Supplier[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, supplierId: string, userId: string): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });

    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.preparationZone !== undefined && { preparationZone: dto.preparationZone }),
        // Chaine vide ⇒ null : « je retire le plan de cette buvette », et le
        // client retombe sur le plan general du lieu.
        ...(dto.planUrl !== undefined && { planUrl: dto.planUrl || null }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
      },
    });

    this.logger.log(`Supplier updated: ${supplierId} in org ${organizationId}`);
    return updated;
  }

  /**
   * Updates only the operational status.
   * OPERATOR is allowed to change status (e.g. mark as OPEN when ready).
   */
  /**
   * Supprime un point de retrait.
   *
   * REFUSÉ dès qu'une commande y est rattachée. `Order.supplierId` porterait
   * alors dans le vide : le chiffre d'affaires passé deviendrait faux, et
   * l'historique d'un client illisible. Un point de vente qui a vendu ne
   * disparaît pas — il se ferme (statut CLOSED / OFFLINE).
   *
   * La suppression sert au cas réel : une erreur de saisie qu'on corrige avant
   * la première vente.
   */
  async remove(
    organizationId: string,
    supplierId: string,
    userId: string,
  ): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const ordersCount = await this.prisma.order.count({ where: { supplierId } });
    if (ordersCount > 0) {
      throw new BadRequestException(
        `« ${existing.name} » a déjà reçu ${ordersCount} commande${ordersCount > 1 ? 's' : ''} : ` +
          'le supprimer effacerait cet historique de ventes. Fermez-le plutôt (statut « Fermée »).',
      );
    }

    await this.prisma.supplier.delete({ where: { id: supplierId } });
    this.logger.log(`Supplier deleted: ${supplierId} ("${existing.name}") by ${userId}`);
  }

  async updateStatus(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: UpdateSupplierStatusDto,
  ): Promise<Supplier> {
    // ORG_ADMIN, MANAGER and OPERATOR can change supplier status
    await requireOrgAccess(this.prisma, userId, organizationId, [
      ...MANAGE_ROLES,
      OrgRole.OPERATOR,
    ]);

    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: { status: dto.status },
    });

    this.logger.log(
      `Supplier status changed: ${supplierId} → ${dto.status} (by user ${userId})`,
    );
    return updated;
  }

  // ─── Stripe Connect ──────────────────────────────────────────

}
