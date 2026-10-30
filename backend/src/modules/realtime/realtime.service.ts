import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RealtimeGateway } from './realtime.gateway';
import { OutboxService } from './outbox.service';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// ─── Payload types (from REALTIME_CONTRACTS.md) ─────────────────

export interface NewOrderPayload {
  orderId: string;
  publicOrderNumber: string;
  organizationId: string;
  venueId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string;
}

export interface OrderUpdatedPayload {
  orderId: string;
  organizationId: string;
  eventId: string;
  /** Buvette concernee : c'est le salon qu'ecoute un poste operateur. */
  supplierId: string;
  previousStatus: string;
  nextStatus: string;
  actorType: string;
  reason?: string | null;
}

export interface OrderReadyPayload {
  orderId: string;
  publicOrderNumber: string;
  organizationId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string;
}

/** PHASE 19 — le client signale sa présence au point de retrait. */
export interface CustomerArrivedPayload {
  orderId: string;
  publicOrderNumber: string;
  organizationId: string;
  eventId: string;
  supplierId: string;
  pickupPointId: string;
  arrivedAt: string;
}

/**
 * RealtimeService — business-level emit helper.
 *
 * Wraps RealtimeGateway.server and targets the correct rooms per event type.
 * MUST only be called AFTER the DB transaction has committed (outbox rule).
 *
 * Room targeting (from REALTIME_CONTRACTS.md):
 *   new_order     → organization + event + supplier rooms
 *   order_updated → order + organization + event rooms
 *   order_ready   → order + pickup-point + organization + event rooms
 */
/** Une annonce prête à partir : son enveloppe, et les salons qu'elle vise. */
export interface EmissionPreparee {
  eventId: string;
  eventName: string;
  rooms: string[];
  payload: unknown;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly outbox: OutboxService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * UNE ÉMISSION PRÉPARÉE, avant tout envoi et avant toute écriture.
   *
   * C'est ce qui permet de DÉPOSER la ligne dans la transaction métier, puis
   * de publier une fois le commit passé. Sans cette séparation, le dépôt a
   * lieu après le commit — et il reste une fenêtre, étroite mais réelle, où
   * la commande existe et l'annonce n'existe pas.
   */
  preparer(salons: string[], nom: string, enveloppe: { eventId: string }): EmissionPreparee {
    return { eventId: enveloppe.eventId, eventName: nom, rooms: salons, payload: enveloppe };
  }

  /**
   * Dépose l'annonce DANS la transaction de l'appelant.
   *
   * Elle tombe ou passe avec la commande : il devient impossible d'avoir une
   * commande sans annonce rejouable. C'est la seule façon de tenir la
   * promesse « rien ne se perd pour l'opérateur ».
   */
  deposer(tx: Prisma.TransactionClient, annonce: EmissionPreparee): Promise<unknown> {
    return this.outbox.deposer(tx, annonce);
  }

  /**
   * Publie une annonce DÉJÀ déposée — après le commit.
   *
   * Ne dépose rien : la ligne existe. N'attend rien non plus, et ne lève
   * jamais : l'appelant vient d'encaisser, et l'ouvrier rattrapera.
   */
  publier(annonce: EmissionPreparee): void {
    void this.emettrePuisMarquer(annonce);
  }

  private async emettrePuisMarquer(annonce: EmissionPreparee): Promise<void> {
    try {
      const { server } = this.gateway;
      if (!server) {
        this.logger.warn(
          `${annonce.eventName} non diffuse : passerelle pas encore prete. ` +
            `Deja depose — rejoue dans la minute.`,
        );
        return;
      }
      for (const salon of annonce.rooms) {
        server.to(salon).emit(annonce.eventName, annonce.payload);
      }
    } catch (e) {
      this.logger.error(
        `${annonce.eventName} non diffuse : ${e instanceof Error ? e.message : String(e)}. ` +
          `Deja depose — rejoue dans la minute.`,
      );
      return;
    }
    // Marquer APRÈS, jamais avant : marquer puis rater perdrait l'annonce.
    await this.outbox.marquerLivre(annonce.eventId);
  }
  /**
   * DIFFUSER NE DOIT JAMAIS CASSER CE QUI VIENT D'ETRE FAIT.
   *
   * Toutes ces emissions ont lieu APRES le commit : la commande existe, elle
   * est payee, l'argent est encaisse. Prevenir les ecrans est une
   * COURTOISIE — pas une etape de l'operation.
   *
   * Or `this.gateway.server` peut ne pas etre pret (passerelle pas encore
   * initialisee) et `server.to(...)` lever un TypeError. Cette erreur
   * remontait jusqu'au webhook Stripe, qui repondait en echec — et Stripe
   * rejouait, sur une commande deja creee.
   *
   * On journalise donc, et on laisse passer. Une commande reussie ne doit
   * pas devenir un echec parce qu'un ecran n'a pas ete prevenu.
   *
   * CE QUI RATTRAPE UN EVENEMENT PERDU — et ce n'est plus seulement la
   * reconciliation REST du tableau de bord.
   *
   * Elle existe toujours (`apps/operator/src/hooks/useDashboard.ts` recharge
   * son instantane regulierement, socket connecte ou non), mais elle ne
   * suffisait pas : il faut que quelqu'un regarde l'ecran au bon moment, et
   * rien ne rattrapait les autres consommateurs.
   *
   * Chaque emission depose desormais une ligne dans `realtime_outbox` AVANT
   * de partir, et `OutboxService` rejoue tout ce qui n'est pas marque livre.
   * Un ecran de comptoir ne depend plus de la presence d'une socket a la
   * seconde pres.
   */
  private diffuser(salons: string[], nom: string, enveloppe: { eventId: string }): void {
    this.diffuserAnnonce(this.preparer(salons, nom, enveloppe));
  }

  private diffuserAnnonce(annonce: EmissionPreparee): void {
    // Fire-and-forget ASSUME : l'appelant vient d'encaisser, il n'attend
    // pas que l'ecran soit prevenu pour lui rendre la main. Tout est
    // rattrape a l'interieur — rien ne remonte, et l'outbox garantit que
    // l'evenement finira par arriver meme si tout echoue ici.
    void this.deposerPuisDiffuser(annonce);
  }

  private async deposerPuisDiffuser(annonce: EmissionPreparee): Promise<void> {
    const { rooms: salons, eventName: nom, payload: enveloppe } = annonce;
    // 1. DEPOSER D'ABORD. C'est cette ligne qui transforme une emission
    //    perdue en emission differee. Si elle echoue, on tente quand meme
    //    l'emission immediate : sans filet, mais pas sans rien.
    let depose = false;
    try {
      await this.outbox.deposer(this.prisma, annonce);
      depose = true;
    } catch (e) {
      this.logger.error(
        `${nom} non depose dans l'outbox : ${e instanceof Error ? e.message : String(e)}. ` +
          `L'emission immediate reste tentee, mais sans rattrapage possible.`,
      );
    }

    // 2. EMETTRE TOUT DE SUITE. L'ouvrier passe a la minute ; un comptoir
    //    ne doit pas attendre une minute pour voir arriver une commande.
    try {
      const { server } = this.gateway;
      if (!server) {
        this.logger.warn(
          `${nom} non diffuse : passerelle temps reel pas encore prete. ` +
            (depose ? `Rejoue dans la minute.` : `ET non depose — perdu.`),
        );
        return;
      }
      for (const salon of salons) server.to(salon).emit(nom, enveloppe);
      this.logger.debug(`Emitted ${nom} to ${salons.length} rooms`);
    } catch (e) {
      this.logger.error(
        `${nom} non diffuse : ${e instanceof Error ? e.message : String(e)}. ` +
          (depose ? `Rejoue dans la minute.` : `ET non depose — perdu.`),
      );
      return;
    }

    // 3. MARQUER LIVRE, et seulement maintenant. Si ce marquage echoue,
    //    l'ouvrier rejouera : un doublon, que l'`eventId` rend
    //    reconnaissable. L'inverse — marquer avant d'emettre — perdrait
    //    l'evenement en silence.
    if (depose) await this.outbox.marquerLivre(annonce.eventId);
  }

  /** Emitted once after Order is created from a successful PaymentIntent. */
  preparerNewOrder(payload: NewOrderPayload): EmissionPreparee {
    const envelope = {
      eventName: 'new_order',
      eventId: randomUUID(), // realtime dedup UUID — not the concert event id
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      publicOrderNumber: payload.publicOrderNumber,
      organizationId: payload.organizationId,
      venueId: payload.venueId,
      supplierIds: [payload.supplierId],
      pickupPointId: payload.pickupPointId,
      status: 'PAID',
    };

    return this.preparer(
      [
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        `supplier:${payload.supplierId}`,
      ],
      'new_order',
      envelope,
    );
  }

  /** Emitted after every successful state transition. */
  preparerOrderUpdated(payload: OrderUpdatedPayload): EmissionPreparee {
    const envelope = {
      eventName: 'order_updated',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      previousStatus: payload.previousStatus,
      nextStatus: payload.nextStatus,
      actorType: payload.actorType,
      reason: payload.reason ?? null,
    };

    return this.preparer(
      [
        `order:${payload.orderId}`,
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        // Salon de la BUVETTE : c'est celui qu'un poste ecoute. Sans lui, un
        // comptoir abonne a sa seule buvette ne verrait jamais avancer ses
        // propres commandes — il resterait fige jusqu'au prochain
        // rafraichissement complet.
        `supplier:${payload.supplierId}`,
      ],
      'order_updated',
      envelope,
    );
  }

  /**
   * LES ÉMETTEURS POST-COMMIT — le chemin historique.
   *
   * Ils préparent, déposent et publient d'un seul geste. Le dépôt a donc
   * lieu JUSTE APRÈS le commit de l'appelant, pas dedans : il reste une
   * fenêtre de quelques millisecondes où un arrêt brutal perdrait l'annonce.
   *
   * Les chemins qui comptent pour le comptoir — création de commande et
   * changement de statut — n'utilisent plus ces méthodes : ils appellent
   * `preparer…` puis `deposer(tx, …)` DANS leur transaction, et `publier`
   * après. Ces émetteurs restent pour ce qui n'a pas de transaction sous la
   * main, et pour que rien ne casse ailleurs.
   */
  emitNewOrder(payload: NewOrderPayload): void {
    this.diffuserAnnonce(this.preparerNewOrder(payload));
  }

  emitOrderUpdated(payload: OrderUpdatedPayload): void {
    this.diffuserAnnonce(this.preparerOrderUpdated(payload));
  }

  emitOrderReady(payload: OrderReadyPayload): void {
    this.diffuserAnnonce(this.preparerOrderReady(payload));
  }
  /**
   * PHASE 19 — le client a appuyé sur « Je suis arrivé ».
   *
   * Événement DÉDIÉ (et non `order_updated`) car le statut de la commande ne
   * change pas : le board opérateur applique une mise à jour optimiste basée sur
   * `nextStatus` et ignorerait donc un `order_updated` sans transition.
   * Ciblage identique à `new_order` : la buvette concernée doit voir l'appel.
   */
  emitCustomerArrived(payload: CustomerArrivedPayload): void {
    const envelope = {
      eventName: 'customer_arrived',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      publicOrderNumber: payload.publicOrderNumber,
      pickupPointId: payload.pickupPointId,
      arrivedAt: payload.arrivedAt,
    };

    this.diffuser(
      [
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        `supplier:${payload.supplierId}`,
      ],
      'customer_arrived',
      envelope,
    );

    this.logger.debug(`Emitted customer_arrived [${payload.orderId}] to 3 rooms`);
  }

  /**
   * Emitted specifically when an order reaches READY status.
   * Drives the "pickup notification" on the customer app.
   */
  preparerOrderReady(payload: OrderReadyPayload): EmissionPreparee {
    const envelope = {
      eventName: 'order_ready',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      orderId: payload.orderId,
      publicOrderNumber: payload.publicOrderNumber,
      pickupPointId: payload.pickupPointId,
    };

    return this.preparer(
      [
        `order:${payload.orderId}`,
        `pickup-point:${payload.pickupPointId}`,
        `organization:${payload.organizationId}`,
        `event:${payload.eventId}`,
        `supplier:${payload.supplierId}`,
      ],
      'order_ready',
      envelope,
    );

    this.logger.debug(`Emitted order_ready [${payload.orderId}] → pickup-point ${payload.pickupPointId}`);
  }
}
