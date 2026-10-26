import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateEventDto } from './dto/create-event.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { UpdateEventStatusDto } from './dto/update-event-status.dto';
import type { Event, EventSupplier, Supplier } from '@prisma/client';
import { verifierLienFlaix } from './lien-flaix';
import { nettoyerNomAdversaire, verifierLogoAdversaire } from './adversaire';

/**
 * CE QUE L'ENREGISTREMENT D'UNE LIGNE DE MATCH REND.
 *
 * Les champs ABSENTS sont ceux qu'on n'a pas touches : l'admin ne remplace
 * dans son etat local que ce qui a reellement change. Rendre `null` pour un
 * champ laisse en place lui ferait effacer a l'ecran ce qui est toujours en
 * base — et le club rechargerait la page pour comprendre.
 */
export interface LigneMatchFlaix {
  id: string;
  flaixOrderUrl?: string | null;
  opponentName?: string | null;
  opponentLogoUrl?: string | null;
}

export type EventWithSuppliers = Event & {
  eventSuppliers: (EventSupplier & { supplier: Supplier })[];
  // Present on single-event reads (findOne) so the admin UI can prefill the
  // "Accès & visibilité" group selector. Omitted on list reads.
  groups?: { groupId: string }[];
};

/**
 * EventsService owns all event lifecycle and supplier assignment logic.
 *
 * Key rules:
 * - An event belongs to one venue. Venue must belong to the same org.
 * - Status transitions are validated: cannot re-activate a CANCELLED event.
 * - Suppliers must belong to the same org before being attached.
 * - ENDED/CANCELLED events cannot be modified (guard in each write method).
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateEventDto,
  ): Promise<Event> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    // Verify the venue belongs to this org
    const venue = await this.prisma.venue.findFirst({
      where: { id: dto.venueId, organizationId },
    });
    if (!venue) {
      throw new NotFoundException('Venue not found in this organization');
    }

    // Business rule: endAt must be after startAt
    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }

    const event = await this.prisma.event.create({
      data: {
        organizationId,
        venueId: dto.venueId,
        name: dto.name,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        activeFeatureFlags: (dto.activeFeatureFlags ?? {}) as object,
      },
    });

    this.logger.log(`Event created: ${event.id} ("${event.name}") in org ${organizationId}`);
    return event;
  }

  /**
   * Événements d'une organisation.
   *
   * Le contenant d'un lieu permanent est écarté par défaut : ce n'est pas un
   * événement, personne ne l'a créé, et l'exposer dans les écrans de gestion
   * ferait apparaître un « Service continu » que le club tenterait de modifier
   * ou de supprimer — cassant ses commandes en cours.
   *
   * `includePermanent` le réintègre pour les écrans qui doivent TRAVAILLER
   * dessus plutôt que le configurer : le poste opérateur, notamment, n'aurait
   * sinon aucun tableau à ouvrir sur un restaurant. La distinction est entre
   * régler un événement et servir des commandes, pas entre deux niveaux de
   * droits — l'accès à l'organisation reste seul juge.
   */
  async findAllByOrg(
    organizationId: string,
    userId: string,
    options: { includePermanent?: boolean } = {},
  ): Promise<EventWithSuppliers[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.event.findMany({
      where: {
        organizationId,
        ...(options.includePermanent ? {} : { isPermanentContainer: false }),
      },
      include: { eventSuppliers: { include: { supplier: true } } },
      orderBy: { startAt: 'desc' },
    });
  }

  async findOne(
    organizationId: string,
    eventId: string,
    userId: string,
  ): Promise<EventWithSuppliers> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
      include: {
        eventSuppliers: { include: { supplier: true } },
        groups: { select: { groupId: true } },
      },
    });

    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(
    organizationId: string,
    eventId: string,
    userId: string,
    dto: UpdateEventDto,
  ): Promise<Event> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!existing) throw new NotFoundException('Event not found');

    this.guardPermanentContainer(existing);
    this.guardFinalized(existing);

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be after startAt');
    }

    // Phase 14.7 — when groupIds are provided, every group must belong to this
    // org. Validated up-front so we never partially apply a cross-tenant set.
    const uniqueGroupIds =
      dto.groupIds !== undefined ? [...new Set(dto.groupIds)] : undefined;
    if (uniqueGroupIds !== undefined && uniqueGroupIds.length > 0) {
      const owned = await this.prisma.group.count({
        where: { id: { in: uniqueGroupIds }, organizationId },
      });
      if (owned !== uniqueGroupIds.length) {
        throw new BadRequestException(
          'One or more groups do not belong to this organization',
        );
      }
    }

    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
      ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
      ...(dto.activeFeatureFlags !== undefined && {
        activeFeatureFlags: dto.activeFeatureFlags as object,
      }),
      // Phase 14.7 — access & visibility
      ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      // Phase 12.8 — branding fields
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
    };

    // When groupIds are supplied we REPLACE the event's group links atomically:
    // update the scalar fields, wipe existing EventGroup rows, recreate the set.
    let updated: Event;
    if (uniqueGroupIds !== undefined) {
      updated = await this.prisma.$transaction(async (tx) => {
        const ev = await tx.event.update({ where: { id: eventId }, data });
        await tx.eventGroup.deleteMany({ where: { eventId } });
        if (uniqueGroupIds.length > 0) {
          await tx.eventGroup.createMany({
            data: uniqueGroupIds.map((groupId) => ({ eventId, groupId })),
            skipDuplicates: true,
          });
        }
        return ev;
      });
    } else {
      updated = await this.prisma.event.update({ where: { id: eventId }, data });
    }

    this.logger.log(`Event updated: ${eventId} in org ${organizationId}`);
    return updated;
  }

  /**
   * Changes the lifecycle status of an event.
   * Allowed transitions:
   *   DRAFT     → ACTIVE | CANCELLED
   *   ACTIVE    → PAUSED | ENDED | CANCELLED
   *   PAUSED    → ACTIVE | ENDED | CANCELLED
   *   ENDED     → (none — terminal)
   *   CANCELLED → (none — terminal)
   */
  async updateStatus(
    organizationId: string,
    eventId: string,
    userId: string,
    dto: UpdateEventStatusDto,
  ): Promise<Event> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!existing) throw new NotFoundException('Event not found');

    this.guardPermanentContainer(existing);
    this.guardFinalized(existing);
    this.validateTransition(existing.status, dto.status);

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: dto.status },
    });

    this.logger.log(
      `Event status: ${eventId} ${existing.status} → ${dto.status} (by user ${userId})`,
    );
    return updated;
  }

  /**
   * Attaches a supplier to an event (creates EventSupplier row).
   * Supplier must belong to the same org.
   */
  async attachSupplier(
    organizationId: string,
    eventId: string,
    supplierId: string,
    userId: string,
  ): Promise<EventSupplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) throw new NotFoundException('Event not found');
    this.guardFinalized(event);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found in this organization');

    const existing = await this.prisma.eventSupplier.findUnique({
      where: { eventId_supplierId: { eventId, supplierId } },
    });
    if (existing) {
      throw new ConflictException('Supplier is already attached to this event');
    }

    const es = await this.prisma.eventSupplier.create({
      data: { eventId, supplierId },
    });

    this.logger.log(`Supplier ${supplierId} attached to event ${eventId}`);
    return es;
  }

  /**
   * Detaches a supplier from an event.
   */
  async detachSupplier(
    organizationId: string,
    eventId: string,
    supplierId: string,
    userId: string,
  ): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!event) throw new NotFoundException('Event not found');
    this.guardFinalized(event);

    const es = await this.prisma.eventSupplier.findUnique({
      where: { eventId_supplierId: { eventId, supplierId } },
    });
    if (!es) throw new NotFoundException('Supplier is not attached to this event');

    await this.prisma.eventSupplier.delete({
      where: { eventId_supplierId: { eventId, supplierId } },
    });

    this.logger.log(`Supplier ${supplierId} detached from event ${eventId}`);
  }

  /**
   * Pose (ou retire) les liens de COMMANDE Flaix de plusieurs événements.
   *
   * Le geste qu'on remplace : avant chaque match, aller changer LE lien unique
   * du lieu. Ici le club colle d'un coup les adresses de sa saison, chacune sur
   * son match — et c'est la DATE qui décide laquelle s'ouvre
   * (`common/helpers/fenetre-commande.ts`).
   *
   * TOUT OU RIEN. Un seul lien mal collé, et rien n'est enregistré : à dix
   * lignes saisies ensemble, un enregistrement partiel laisserait le club
   * croire que tout est passé, et c'est le match dont le lien a été rejeté qui
   * s'ouvrirait sur le parcours Break Eat, un samedi soir.
   *
   * Accepté sur un événement TERMINÉ, comme le rapport : corriger après coup ne
   * doit pas être bloqué par le cycle de vie.
   */
  async definirLiensCommandeFlaix(
    organizationId: string,
    userId: string,
    liens: {
      eventId: string;
      url?: string | null;
      opponentName?: string | null;
      opponentLogoUrl?: string | null;
    }[],
  ): Promise<LigneMatchFlaix[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    // Un même événement cité deux fois, avec deux liens : laquelle des deux
    // lignes fait foi ? Aucune réponse n'est évidente, donc on refuse.
    const vus = new Set<string>();
    for (const l of liens) {
      if (vus.has(l.eventId)) {
        throw new BadRequestException('Le même événement apparaît deux fois dans la liste.');
      }
      vus.add(l.eventId);
    }

    const evenements = await this.prisma.event.findMany({
      where: { id: { in: liens.map((l) => l.eventId) }, organizationId },
      select: { id: true, name: true, isPermanentContainer: true },
    });
    const parId = new Map(evenements.map((e) => [e.id, e]));

    // On valide TOUT avant d'écrire quoi que ce soit.
    //
    // CHAMP ABSENT = ON NE TOUCHE PAS ; `null` ou vide = on efface. C'est ce
    // qui permet de corriger un blason sans réenvoyer le lien, et surtout
    // d'éviter l'effacement silencieux : une ligne qui omettait `url` vidait
    // le lien du match sans que personne ne l'ait demandé.
    const aEcrire: {
      id: string;
      data: Prisma.EventUpdateInput;
      retour: LigneMatchFlaix;
    }[] = [];
    for (const l of liens) {
      const ev = parId.get(l.eventId);
      // Un événement d'une AUTRE organisation est traité comme inexistant :
      // repondre « pas a vous » confirmerait son existence a qui devine un UUID.
      if (!ev) throw new NotFoundException(`Événement introuvable : ${l.eventId}`);

      const data: Prisma.EventUpdateInput = {};
      const retour: LigneMatchFlaix = { id: ev.id };

      if (l.url !== undefined) {
        const saisie = l.url?.trim();
        if (!saisie) {
          data.flaixOrderUrl = null;
          retour.flaixOrderUrl = null;
        } else {
          const verdict = verifierLienFlaix(saisie);
          // Le nom de l'événement dans le message : à dix lignes, « ce n'est pas
          // un lien Flaix » sans dire LEQUEL oblige à tout relire.
          if (!verdict.valide) throw new BadRequestException(`${ev.name} — ${verdict.raison}`);
          data.flaixOrderUrl = verdict.url;
          retour.flaixOrderUrl = verdict.url;
        }
      }

      if (l.opponentName !== undefined) {
        const nom = nettoyerNomAdversaire(l.opponentName);
        data.opponentName = nom;
        retour.opponentName = nom;
      }

      if (l.opponentLogoUrl !== undefined) {
        const saisie = l.opponentLogoUrl?.trim();
        if (!saisie) {
          data.opponentLogoUrl = null;
          retour.opponentLogoUrl = null;
        } else {
          const verdict = verifierLogoAdversaire(saisie);
          if (!verdict.valide) throw new BadRequestException(`${ev.name} — ${verdict.raison}`);
          data.opponentLogoUrl = verdict.url;
          retour.opponentLogoUrl = verdict.url;
        }
      }

      // Une ligne qui ne demande rien n'a rien à faire dans la transaction :
      // `update` avec un `data` vide touche `updatedAt` pour rien.
      if (Object.keys(data).length > 0) aEcrire.push({ id: ev.id, data, retour });
    }

    if (aEcrire.length === 0) return [];

    await this.prisma.$transaction(
      aEcrire.map((e) => this.prisma.event.update({ where: { id: e.id }, data: e.data })),
    );

    const poses = aEcrire.filter((e) => e.data.flaixOrderUrl).length;
    const blasons = aEcrire.filter((e) => e.data.opponentLogoUrl).length;
    this.logger.log(
      `Liens de commande Flaix : ${poses} posé(s), ${blasons} blason(s) ` +
        `sur ${aEcrire.length} événement(s) (org ${organizationId}) par ${userId}`,
    );

    return aEcrire.map((e) => e.retour);
  }

  // ─── Private guards ───────────────────────────────────────────

  /** Throws if the event is in a terminal state (ENDED or CANCELLED). */
  /**
   * Pose (ou retire) le lien du rapport Flaix d'un événement.
   *
   * Une route À PART de `update`, et c'est voulu : `update` refuse un événement
   * terminé — or le rapport Flaix arrive justement APRÈS le match. Ce lien
   * accompagne l'événement, il n'en change pas la configuration.
   */
  async definirRapportFlaix(
    organizationId: string,
    eventId: string,
    userId: string,
    saisie: string | null | undefined,
  ): Promise<{ id: string; flaixReportUrl: string | null }> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!existing) throw new NotFoundException('Event not found');
    this.guardPermanentContainer(existing);

    let url: string | null = null;
    if (saisie && saisie.trim()) {
      const verdict = verifierLienFlaix(saisie);
      if (!verdict.valide) throw new BadRequestException(verdict.raison);
      url = verdict.url;
    }

    const maj = await this.prisma.event.update({
      where: { id: eventId },
      data: { flaixReportUrl: url },
      select: { id: true, flaixReportUrl: true },
    });
    this.logger.log(
      `Rapport Flaix ${url ? 'posé' : 'retiré'} pour l'événement ${eventId} (org ${organizationId}) par ${userId}`,
    );
    return maj;
  }

  private guardFinalized(event: Event): void {
    if (event.status === EventStatus.ENDED || event.status === EventStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot modify an event with status ${event.status}`,
      );
    }
  }

  /**
   * Supprime un événement.
   *
   * REFUSÉ dès qu'une commande y est rattachée. Archiver et supprimer répondent
   * à deux besoins qu'il ne faut pas confondre :
   *
   *  - ARCHIVER (statut ENDED) sort l'événement de la circulation en CONSERVANT
   *    tout : commandes, chiffre d'affaires, historique client. C'est le geste
   *    normal après un match.
   *  - SUPPRIMER efface la ligne. Ça n'a de sens que pour un événement créé par
   *    erreur, qui n'a jamais rien vendu.
   *
   * Sans cette borne, effacer un événement passé rendrait le chiffre d'affaires
   * de la saison faux sans que personne ne s'en aperçoive.
   */
  async remove(organizationId: string, eventId: string, userId: string): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!existing) throw new NotFoundException('Event not found');

    this.guardPermanentContainer(existing);

    const ordersCount = await this.prisma.order.count({ where: { eventId } });
    if (ordersCount > 0) {
      throw new BadRequestException(
        `« ${existing.name} » porte ${ordersCount} commande${ordersCount > 1 ? 's' : ''} : ` +
          'le supprimer effacerait ce chiffre d’affaires. Archivez-le plutôt — ' +
          'il sort de la circulation et toutes les données sont conservées.',
      );
    }

    await this.prisma.event.delete({ where: { id: eventId } });
    this.logger.log(`Event deleted: ${eventId} ("${existing.name}") by ${userId}`);
  }

  /**
   * PHASE 22 — le contenant d'un lieu permanent n'est pas modifiable.
   *
   * Il est déjà écarté des listes, donc personne ne le voit ; ce garde-fou
   * couvre l'appel direct à l'API. Le clore ou le renommer priverait le lieu de
   * son seul point d'ancrage : plus aucune commande ne pourrait être passée, et
   * la panne serait incompréhensible côté club.
   *
   * Le rythme d'exploitation se change sur le LIEU, pas ici.
   */
  private guardPermanentContainer(event: Event): void {
    if (event.isPermanentContainer) {
      throw new BadRequestException(
        'Ce lieu est ouvert en continu : il n’a pas d’événement à configurer. ' +
          'Le rythme d’exploitation se règle sur le lieu.',
      );
    }
  }

  /** Validates the requested status transition. */
  private validateTransition(from: EventStatus, to: EventStatus): void {
    const allowed: Record<EventStatus, EventStatus[]> = {
      [EventStatus.DRAFT]:     [EventStatus.ACTIVE, EventStatus.CANCELLED],
      [EventStatus.ACTIVE]:    [EventStatus.PAUSED, EventStatus.ENDED, EventStatus.CANCELLED],
      [EventStatus.PAUSED]:    [EventStatus.ACTIVE, EventStatus.ENDED, EventStatus.CANCELLED],
      [EventStatus.ENDED]:     [],
      [EventStatus.CANCELLED]: [],
    };

    if (!allowed[from].includes(to)) {
      throw new BadRequestException(
        `Invalid transition: ${from} → ${to}. Allowed: ${allowed[from].join(', ') || 'none'}`,
      );
    }
  }
}
