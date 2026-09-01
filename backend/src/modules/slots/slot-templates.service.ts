import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SlotSource, SlotStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess } from '../../common/helpers/require-org-access';
import { OrgRole } from '../../common/enums/role.enum';
import type { CreateSlotTemplateDto } from './dto/create-slot-template.dto';
import type { UpdateSlotTemplateDto } from './dto/update-slot-template.dto';

/** Configurer les créneaux appartient au club, jamais à l'équipier du comptoir. */
const CONFIG_ROLES: OrgRole[] = [OrgRole.ORG_ADMIN, OrgRole.MANAGER];

const MINUTES_PAR_JOUR = 24 * 60;

/**
 * Plafond hors d'atteinte : les créneaux ne limitent PAS le nombre de commandes.
 *
 * La limite avait été proposée, puis retirée à la demande du client — elle
 * n'apportait rien à son exploitation et polluait l'interface (« 1000000
 * places » s'affichait au client).
 *
 * Le compteur du créneau repose sur un incrément conditionnel sûr en
 * concurrence (`currentLoad < capacity`) : retirer la colonne obligerait à
 * remanier ce code, ce qui ne se justifie pas. Un plafond que rien n'atteint
 * neutralise la contrainte sans y toucher.
 *
 * `currentLoad` continue de compter — l'information reste disponible le jour où
 * une limite redeviendrait utile.
 */
export const SANS_LIMITE = 1_000_000;

/**
 * SlotTemplatesService — créneaux de récupération RÉCURRENTS (phase 23).
 *
 * Un lieu ouvert en continu n'a pas d'événement à créer, mais il a des heures de
 * retrait : « Immédiat », « 17h15 », « À la mi-temps ». Les ressaisir chaque
 * matin serait absurde ; on décrit le motif une fois, et le créneau du jour est
 * matérialisé à la première demande.
 *
 * Pourquoi matérialiser plutôt que calculer à la volée : une commande référence
 * un `Slot` réel (`Order.slotId`), et un créneau porte une charge (`currentLoad`)
 * qui n'a de sens que pour une journée donnée. Le motif décrit, le créneau
 * existe.
 */
@Injectable()
export class SlotTemplatesService {
  private readonly logger = new Logger(SlotTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Configuration (club) ───────────────────────────────────────────

  async findByVenue(venueId: string, callerId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { organizationId: true },
    });
    if (!venue) throw new NotFoundException('Lieu introuvable');
    await requireOrgAccess(this.prisma, callerId, venue.organizationId, [
      ...CONFIG_ROLES,
      // L'équipier LIT les créneaux de sa buvette pour les ouvrir ou les fermer.
      OrgRole.OPERATOR,
    ]);

    return this.prisma.slotTemplate.findMany({
      where: { venueId },
      orderBy: [{ supplierId: 'asc' }, { sortOrder: 'asc' }, { startMinutes: 'asc' }],
      include: { supplier: { select: { id: true, name: true } } },
    });
  }

  async create(venueId: string, dto: CreateSlotTemplateDto, callerId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { organizationId: true },
    });
    if (!venue) throw new NotFoundException('Lieu introuvable');
    await requireOrgAccess(this.prisma, callerId, venue.organizationId, CONFIG_ROLES);

    // La buvette doit appartenir au même club — sinon on offrirait un créneau
    // sur le comptoir d'une autre organisation.
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { organizationId: true },
    });
    if (!supplier || supplier.organizationId !== venue.organizationId) {
      throw new NotFoundException('Buvette introuvable dans ce club');
    }

    this.assertPlage(dto.startMinutes, dto.endMinutes);

    return this.prisma.slotTemplate.create({
      data: {
        venueId,
        supplierId: dto.supplierId,
        kind: dto.kind,
        label: dto.label.trim(),
        startMinutes: dto.startMinutes,
        endMinutes: dto.endMinutes,
        capacity: dto.capacity ?? 20,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async update(templateId: string, dto: UpdateSlotTemplateDto, callerId: string) {
    const existing = await this.prisma.slotTemplate.findUnique({
      where: { id: templateId },
      include: { venue: { select: { organizationId: true } } },
    });
    if (!existing) throw new NotFoundException('Créneau type introuvable');
    await requireOrgAccess(this.prisma, callerId, existing.venue.organizationId, CONFIG_ROLES);

    const debut = dto.startMinutes ?? existing.startMinutes;
    const fin = dto.endMinutes ?? existing.endMinutes;
    this.assertPlage(debut, fin);

    return this.prisma.slotTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.label !== undefined && { label: dto.label.trim() }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.startMinutes !== undefined && { startMinutes: dto.startMinutes }),
        ...(dto.endMinutes !== undefined && { endMinutes: dto.endMinutes }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  /**
   * Supprime un créneau type.
   *
   * Les créneaux DÉJÀ matérialisés survivent (`onDelete: SetNull`) : ils portent
   * peut-être des commandes, et effacer le motif ne doit pas effacer la journée
   * de travail qu'il a produite. Pour arrêter simplement d'en engendrer, il
   * suffit de le désactiver.
   */
  async remove(templateId: string, callerId: string): Promise<void> {
    const existing = await this.prisma.slotTemplate.findUnique({
      where: { id: templateId },
      include: { venue: { select: { organizationId: true } } },
    });
    if (!existing) throw new NotFoundException('Créneau type introuvable');
    await requireOrgAccess(this.prisma, callerId, existing.venue.organizationId, CONFIG_ROLES);

    // Effacer AUSSI les créneaux déjà engendrés que personne n'a réservés.
    //
    // La relation est en `SetNull` : supprimer le modèle laissait vivre le
    // créneau du jour, qui continuait de s'afficher au client. Le club
    // supprimait, rechargeait, et le voyait revenir — « la configuration
    // supprimée ne s'enregistre pas ».
    //
    // Un créneau qui porte des commandes (`currentLoad > 0`) SURVIT : quelqu'un
    // a réservé, et son retrait doit rester possible. Le lien vers le modèle
    // tombe alors à null, ce qui suffit : plus rien ne le régénérera.
    //
    // Les deux dans une transaction — un modèle supprimé sans ses créneaux
    // laisserait des orphelins impossibles à retrouver.
    const [supprimes] = await this.prisma.$transaction([
      this.prisma.slot.deleteMany({ where: { templateId, currentLoad: 0 } }),
      this.prisma.slotTemplate.delete({ where: { id: templateId } }),
    ]);

    this.logger.log(
      `Créneau type supprimé : ${templateId} (par ${callerId}) — ` +
        `${supprimes.count} créneau(x) sans commande effacé(s)`,
    );
  }

  // ─── Matérialisation quotidienne ────────────────────────────────────

  /**
   * Garantit que les créneaux du jour existent pour cet événement.
   *
   * Appelée à la LECTURE, pas par une tâche planifiée : c'est le motif déjà posé
   * en phase 22 par `ensurePermanentContainer`. Aucun ordonnanceur à surveiller,
   * et un lieu resté fermé trois semaines retrouve ses créneaux dès qu'un client
   * l'ouvre — le système se répare de lui-même.
   *
   * L'unicité `(templateId, serviceDate)` rend l'opération sûre sans verrou :
   * deux clients simultanés ne peuvent pas créer de doublon. Le second se heurte
   * à la contrainte, qu'on absorbe.
   */
  async ensureTodaySlots(eventId: string, venueId: string, quand: Date = new Date()) {
    const templates = await this.prisma.slotTemplate.findMany({
      where: { venueId, isActive: true },
    });
    if (templates.length === 0) return [];

    const journee = jourSeul(quand);

    // Ne tenter QUE les créneaux manquants.
    //
    // La contrainte d'unicité reste le vrai garde-fou en concurrence (deux
    // clients simultanés), mais s'y heurter volontairement à chaque lecture
    // faisait écrire à PostgreSQL une ERREUR par créneau et par consultation.
    // Sur une soirée à 5 000 commandes et quatre créneaux, ce sont des dizaines
    // de milliers de lignes d'erreur qui n'en sont pas — et le vrai incident
    // devient introuvable au milieu.
    const dejaLa = await this.prisma.slot.findMany({
      where: { templateId: { in: templates.map((t) => t.id) }, serviceDate: journee },
      select: { templateId: true },
    });
    const connus = new Set(dejaLa.map((s) => s.templateId));

    for (const t of templates) {
      if (connus.has(t.id)) continue;
      const startAt = new Date(journee);
      startAt.setUTCMinutes(t.startMinutes);
      const endAt = new Date(journee);
      endAt.setUTCMinutes(t.endMinutes);

      try {
        await this.prisma.slot.create({
          data: {
            eventId,
            supplierId: t.supplierId,
            templateId: t.id,
            serviceDate: journee,
            startAt,
            endAt,
            capacity: SANS_LIMITE,
            status: SlotStatus.OPEN,
            source: SlotSource.DEFAULT,
            kind: t.kind,
            label: t.label,
          },
        });
      } catch (e) {
        // P2002 = le créneau du jour existe déjà. C'est le cas NORMAL dès la
        // deuxième visite : on ne le traite pas comme une erreur.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') {
          throw e;
        }
      }
    }

    return this.prisma.slot.findMany({
      where: { eventId, serviceDate: journee },
      orderBy: { startAt: 'asc' },
    });
  }

  // ─── Garde-fous ─────────────────────────────────────────────────────

  /**
   * Une plage doit tenir dans la journée et finir après son début.
   *
   * Refuser explicitement plutôt que laisser créer un créneau que personne ne
   * pourra jamais choisir — un créneau vide ne produit aucune erreur visible,
   * seulement une liste où il manque une ligne.
   */
  private assertPlage(startMinutes: number, endMinutes: number): void {
    if (startMinutes < 0 || endMinutes > MINUTES_PAR_JOUR) {
      throw new BadRequestException('Les horaires doivent tenir dans la journée (00:00 – 24:00).');
    }
    if (endMinutes <= startMinutes) {
      throw new BadRequestException('La fin du créneau doit suivre son début.');
    }
  }
}

/** Minuit UTC de la journée considérée — la clé d'idempotence. */
function jourSeul(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
