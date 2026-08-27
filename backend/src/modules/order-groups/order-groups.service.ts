import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * OrderGroupsService — commander à plusieurs, chacun payant sa part.
 *
 * Le groupe ne porte AUCUN argent : chaque convive passe une commande normale
 * et la paie lui-même. Le groupe se contente de les rattacher, pour que la
 * buvette les prépare et les remette ensemble.
 *
 * Ce choix est ce qui rend la fonction sûre. Un ami qui renonce, se trompe de
 * buvette ou n'a plus de batterie ne bloque personne : aucune commande n'attend
 * le paiement d'un autre, et il n'y a jamais de panier à moitié réglé à
 * rembourser au milieu du service.
 */

/**
 * Alphabet du code d'invitation : ni I, ni O, ni 0, ni 1.
 *
 * Le code se dit à voix haute dans un stade bruyant. « I » et « 1 » s'entendent
 * pareil, « O » et « 0 » se lisent pareil — les retirer coûte quatre caractères
 * sur trente-deux et supprime toute une classe d'erreurs de saisie.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGUEUR_CODE = 6;

/** Un groupe vaut pour un service : au-delà, le code ne joint plus rien. */
const DUREE_MS = 12 * 60 * 60 * 1000;

/** Nombre d'essais avant d'abandonner sur collision de code (32^6 ≈ 1 milliard). */
const ESSAIS_MAX = 5;

@Injectable()
export class OrderGroupsService {
  private readonly logger = new Logger(OrderGroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private genererCode(): string {
    let code = '';
    for (let i = 0; i < LONGUEUR_CODE; i++) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return code;
  }

  /**
   * Ouvre (ou retrouve) l'invitation d'un convive pour une buvette donnée.
   *
   * Idempotent à dessein : appuyer deux fois sur « Inviter un ami » ne doit pas
   * produire deux codes — le second invaliderait le premier déjà partagé.
   */
  async ouvrir(params: { userId: string; eventId: string; supplierId: string }) {
    const rattache = await this.prisma.eventSupplier.findFirst({
      where: { eventId: params.eventId, supplierId: params.supplierId },
    });
    if (!rattache) {
      throw new BadRequestException('Supplier is not attached to this event');
    }

    const existant = await this.prisma.orderGroup.findFirst({
      where: {
        createdBy: params.userId,
        eventId: params.eventId,
        supplierId: params.supplierId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existant) return this.decrire(existant);

    for (let essai = 0; essai < ESSAIS_MAX; essai++) {
      try {
        const groupe = await this.prisma.orderGroup.create({
          data: {
            code: this.genererCode(),
            eventId: params.eventId,
            supplierId: params.supplierId,
            createdBy: params.userId,
            expiresAt: new Date(Date.now() + DUREE_MS),
          },
        });
        this.logger.log(`Invitation ouverte : ${groupe.code} (buvette ${params.supplierId})`);
        return this.decrire(groupe);
      } catch (e: unknown) {
        // P2002 = code déjà pris. On retire, sans le dire à l'appelant : une
        // collision est un incident interne, pas une erreur de sa part.
        const collision =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!collision) throw e;
      }
    }
    throw new BadRequestException('Impossible de générer un code d’invitation');
  }

  /**
   * Résout un code partagé. Ne renvoie QUE de quoi rejoindre : où commander et
   * combien de convives ont déjà commandé. Aucune donnée personnelle, aucun
   * montant — le code circule par SMS, il peut atterrir n'importe où.
   */
  async rejoindre(code: string) {
    const groupe = await this.prisma.orderGroup.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!groupe) throw new NotFoundException('Invitation introuvable');
    if (groupe.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('Cette invitation a expiré');
    }
    return this.decrire(groupe);
  }

  /** Nombre de commandes déjà rattachées — sert à dire « vous êtes 3 ». */
  async compterCommandes(orderGroupId: string): Promise<number> {
    return this.prisma.order.count({ where: { orderGroupId } });
  }

  /**
   * Traduit un code en identifiant de groupe, pour le panier.
   * Renvoie null si le code est inconnu ou périmé : rejoindre une invitation
   * morte ne doit pas empêcher de commander seul.
   */
  async resoudrePourPanier(params: {
    code: string;
    eventId: string;
    supplierId: string;
  }): Promise<string | null> {
    const groupe = await this.prisma.orderGroup.findUnique({
      where: { code: params.code.trim().toUpperCase() },
    });
    if (!groupe) return null;
    if (groupe.expiresAt.getTime() <= Date.now()) return null;
    // Un code n'ouvre QUE la buvette pour laquelle il a été émis : sans cette
    // vérification, il rattacherait des commandes passées ailleurs, et la
    // buvette recevrait un groupe dont une partie n'est pas chez elle.
    if (groupe.eventId !== params.eventId || groupe.supplierId !== params.supplierId) {
      return null;
    }
    return groupe.id;
  }

  private async decrire(groupe: {
    id: string;
    code: string;
    eventId: string;
    supplierId: string;
    expiresAt: Date;
  }) {
    const [buvette, commandes] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: groupe.supplierId },
        select: { name: true },
      }),
      this.compterCommandes(groupe.id),
    ]);
    return {
      code: groupe.code,
      eventId: groupe.eventId,
      supplierId: groupe.supplierId,
      supplierName: buvette?.name ?? null,
      orderCount: commandes,
      expiresAt: groupe.expiresAt.toISOString(),
    };
  }
}
