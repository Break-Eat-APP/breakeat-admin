import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderActorType, OrderStatus, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LiveActivityService } from '../live-activity/live-activity.service';
import { ExpoPushService } from '../notifications/expo-push.service';
import { PushTokensService } from '../notifications/push-tokens.service';
import type { LigneManquanteDto } from './dto/signaler-manquants.dto';

/** Une commande close n'a plus rien à signaler : le client est reparti. */
const STATUTS_CLOS: OrderStatus[] = [
  OrderStatus.PICKED_UP,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

/**
 * Le comptoir signale qu'un produit manque dans une commande.
 *
 * Un produit affiché disponible peut ne plus l'être au comptoir — une erreur de
 * gestion, un fût vide. Sans signalement, le client le découvre en arrivant,
 * après avoir attendu. Ici, il l'apprend tout de suite, là où il regarde :
 *
 *  - sa Live Activity passe à « Produit manquant » et ALLUME l'écran — une
 *    mise à jour ordinaire change l'affichage en silence, ce qui ne suffit pas
 *    pour une nouvelle qui demande un geste ;
 *  - « Mes commandes » montre les lignes concernées ;
 *  - sans Live Activity active (Android, web, activité balayée), une
 *    notification prend le relais — jamais les deux, qui diraient la même
 *    chose à la seconde près.
 *
 * Le produit peut être retiré de la carte dans le même geste (HS) : s'il manque
 * pour ce client, il manquera pour le suivant.
 *
 * Le remboursement n'est PAS fait ici : il se règle au comptoir (remplacement
 * ou geste commercial), là où le client est invité à se présenter.
 */
@Injectable()
export class ProduitsManquantsService {
  private readonly logger = new Logger(ProduitsManquantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly liveActivity: LiveActivityService,
    private readonly expoPush: ExpoPushService,
    private readonly pushTokens: PushTokensService,
  ) {}

  async signaler(params: {
    orderId: string;
    actorId: string;
    lignes: LigneManquanteDto[];
    retirerDeLaCarte: boolean;
  }) {
    const commande = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      include: { items: true },
    });
    if (!commande) throw new NotFoundException('Commande introuvable');

    if (STATUTS_CLOS.includes(commande.status)) {
      throw new BadRequestException(
        'Cette commande est terminée : le client n’attend plus rien du comptoir.',
      );
    }

    // Chaque ligne doit appartenir à CETTE commande, et ne pas manquer plus
    // qu'elle n'a été commandée. La base le vérifie aussi (contrainte CHECK) ;
    // le dire ici donne un message lisible au lieu d'une erreur de contrainte.
    const parLigne = new Map(commande.items.map((l) => [l.id, l]));
    for (const l of params.lignes) {
      const ligne = parLigne.get(l.orderItemId);
      if (!ligne) {
        throw new BadRequestException('Une des lignes ne fait pas partie de cette commande.');
      }
      if (l.missingQuantity > ligne.quantity) {
        throw new BadRequestException(
          `« ${ligne.productNameSnapshot} » : ${l.missingQuantity} manquant(s) pour ` +
            `${ligne.quantity} commandé(s).`,
        );
      }
    }

    const nouvelles = new Map(params.lignes.map((l) => [l.orderItemId, l.missingQuantity]));
    const apres = commande.items.map((l) => ({
      ...l,
      missingQuantity: nouvelles.get(l.id) ?? l.missingQuantity,
    }));
    const manquantes = apres.filter((l) => l.missingQuantity > 0);
    const resume = manquantes.map((l) => `${l.missingQuantity}× ${l.productNameSnapshot}`);

    // Les produits à retirer de la carte : seulement ceux signalés dans CE
    // geste, et seulement ceux de la buvette de la commande — un comptoir ne
    // touche jamais la carte d'un autre.
    const aRetirer = params.retirerDeLaCarte
      ? [
          ...new Set(
            params.lignes
              .filter((l) => l.missingQuantity > 0)
              .map((l) => parLigne.get(l.orderItemId)?.productId)
              .filter((id): id is string => Boolean(id)),
          ),
        ]
      : [];

    const maintenant = new Date();
    const [, retires] = await this.prisma.$transaction([
      // Une écriture par ligne touchée : les quantités diffèrent d'une ligne à
      // l'autre, un `updateMany` ne saurait pas les porter.
      this.prisma.order.update({
        where: { id: commande.id },
        data: {
          // Chaque nouveau signalement est daté : c'est lui que le client doit
          // voir. Plus rien ne manque ⇒ le signalement disparaît.
          missingReportedAt: manquantes.length > 0 ? maintenant : null,
          items: {
            update: params.lignes.map((l) => ({
              where: { id: l.orderItemId },
              data: { missingQuantity: l.missingQuantity },
            })),
          },
        },
      }),
      this.prisma.product.updateMany({
        where: {
          id: { in: aRetirer },
          supplierId: commande.supplierId,
          // Un produit masqué ou archivé par le manager reste tel quel : HS
          // n'est qu'une indisponibilité passagère.
          status: ProductStatus.ACTIVE,
        },
        data: { status: ProductStatus.OUT_OF_STOCK },
      }),
      this.prisma.orderAuditTrail.create({
        data: {
          orderId: commande.id,
          actorType: OrderActorType.OPERATOR,
          actorId: params.actorId,
          previousState: commande.status,
          nextState: commande.status,
          reason:
            manquantes.length > 0
              ? `Produits manquants : ${resume.join(', ')}`
              : 'Signalement de produits manquants retiré',
          metadata: { produitsRetiresDeLaCarte: aRetirer },
        },
      }),
    ]);

    this.logger.log(
      `Commande ${commande.publicOrderNumber} : ` +
        (manquantes.length > 0
          ? `manquants signalés (${resume.join(', ')})`
          : 'signalement retiré') +
        (retires.count > 0 ? ` — ${retires.count} produit(s) passé(s) HS` : ''),
    );

    // Le poste se rafraîchit, l'app du client aussi : même événement que pour
    // une transition, le statut ne change simplement pas.
    this.realtime.emitOrderUpdated({
      orderId: commande.id,
      organizationId: commande.organizationId,
      eventId: commande.eventId,
      supplierId: commande.supplierId,
      previousStatus: commande.status,
      nextStatus: commande.status,
      actorType: OrderActorType.OPERATOR,
      reason: manquantes.length > 0 ? 'missing_items' : 'missing_items_cleared',
    });

    // Le client n'est prévenu que s'il manque quelque chose. Retirer un
    // signalement erroné met simplement l'affichage à jour, sans réveiller
    // le téléphone une seconde fois.
    if (manquantes.length > 0) {
      void this.prevenirClient(commande, resume).catch((e: unknown) =>
        this.logger.warn(
          `Client non prévenu pour ${commande.publicOrderNumber} (non bloquant) : ${
            e instanceof Error ? e.message : String(e)
          }`,
        ),
      );
    } else {
      void this.liveActivity.pushOrderUpdate(commande.id).catch(() => undefined);
    }

    return {
      id: commande.id,
      missingReportedAt: manquantes.length > 0 ? maintenant : null,
      lignes: apres.map((l) => ({ id: l.id, missingQuantity: l.missingQuantity })),
      produitsRetiresDeLaCarte: retires.count,
    };
  }

  /**
   * Live Activity d'abord — c'est là que le client regarde pendant l'attente.
   * Une notification seulement si aucune activité n'a été atteinte.
   */
  private async prevenirClient(
    commande: {
      id: string;
      userId: string;
      supplierId: string;
      publicOrderNumber: string;
      dailyNumber: number | null;
    },
    resume: string[],
  ): Promise<void> {
    const comptoir = await this.prisma.supplier.findUnique({
      where: { id: commande.supplierId },
      select: { name: true },
    });
    // Le numéro que le client connaît : court, celui qu'il voit dans l'app.
    const numero =
      commande.dailyNumber != null ? `N° ${commande.dailyNumber}` : commande.publicOrderNumber;
    const titre = 'Produit manquant';
    const corps =
      `Il manque ${resume.join(', ')} dans votre commande ${numero}. ` +
      `Rendez-vous au point de retrait${comptoir ? ` ${comptoir.name}` : ''}.`;

    const atteintes = await this.liveActivity.pushOrderUpdate(commande.id, undefined, {
      title: titre,
      body: corps,
    });
    if (atteintes > 0) return;

    const jetons = await this.pushTokens.tokensForUsers([commande.userId]);
    if (jetons.length === 0) return;
    await this.expoPush.send(
      jetons.map((to) => ({
        to,
        title: titre,
        body: corps,
        sound: 'default' as const,
        // L'app ouvre « Mes commandes » sur cette commande.
        data: { type: 'missing_items', orderId: commande.id },
      })),
    );
  }
}
