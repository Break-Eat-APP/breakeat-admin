import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventStatus, SupplierStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { heureDOuverture } from '../../common/helpers/fenetre-commande';

/**
 * L'OUVERTURE ET LA FERMETURE AUTOMATIQUES (règle de Rémi, 16/11/2026).
 *
 * Avant : sur un lieu BreakEat, la commande n'ouvrait que si le club passait
 * À LA MAIN l'événement en « Actif » ET la buvette en « Ouverte ». Le concert du
 * Dôme programmé à 14 h ne s'est pas ouvert tout seul.
 *
 * Désormais, chaque minute :
 *
 *  1. OUVERTURE — un événement en BROUILLON, avec au moins un point de
 *     retrait, passe en ACTIF à l'heure d'ouverture de la commande du lieu
 *     (`Venue.ordersOpenAt`, 08:00 par défaut, le jour de l'événement ; dès son
 *     début s'il commence plus tôt — même règle que l'app, `heureDOuverture`).
 *     Ses points de retrait FERMÉS s'ouvrent avec lui.
 *
 *  2. FERMETURE — à l'heure de FIN, un événement ACTIF ou EN PAUSE passe en
 *     TERMINÉ. Ses points de retrait OUVERTS se ferment, sauf s'ils servent
 *     encore un autre événement en cours (ou un service continu).
 *
 * CE QUI N'EST JAMAIS TOUCHÉ :
 *  - un point de retrait EN PAUSE ou HORS LIGNE : c'est un choix du comptoir ;
 *    le bouton « fermer » du poste opérateur reste maître en cas d'incident ;
 *  - un événement EN PAUSE n'est pas rouvert ; ANNULÉ ou TERMINÉ, rien ;
 *  - les lieux FLAIX (Flaix décide, et leur commande ouvre déjà à l'heure) et
 *    le contenant d'un lieu ouvert en continu.
 *
 * AUCUNE COMMANDE N'EST PERDUE : « Terminé » n'empêche que d'en ouvrir de
 * nouvelles (la création d'un panier exige « Actif »). Le poste opérateur
 * liste les événements quel que soit leur statut, et les commandes déjà payées
 * restent à préparer et à remettre.
 *
 * Chaque bascule est CONDITIONNELLE (`updateMany` sur le statut attendu) :
 * plusieurs serveurs qui tournent la même minute ne font la transition qu'une
 * fois, et un club qui a changé le statut entre-temps n'est pas écrasé.
 *
 * L'ÉVÉNEMENT ET SES POINTS DE RETRAIT BASCULENT ENSEMBLE (audit Codex du
 * 17/11/2026). Ils s'écrivaient en deux temps : une coupure de la base entre
 * les deux laissait un événement « Actif » aux points de retrait fermés —
 * affiché ouvert, impossible à commander — et la minute suivante ne le
 * reprenait plus (il n'était plus en brouillon). Les deux écritures sont
 * désormais dans UNE transaction : tout passe, ou rien, et la minute suivante
 * recommence. Une erreur sur un événement n'arrête plus les autres.
 */
@Injectable()
export class OuvertureAutomatiqueService {
  private readonly logger = new Logger(OuvertureAutomatiqueService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tic(): Promise<void> {
    try {
      await this.ouvrir(new Date());
      await this.fermer(new Date());
    } catch (e: unknown) {
      // Une minute ratée se rattrape à la suivante : on journalise, on ne casse rien.
      this.logger.error(`Ouverture automatique : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Les événements dont la commande doit ouvrir maintenant. Rend leur nombre. */
  async ouvrir(maintenant: Date): Promise<number> {
    // L'heure d'ouverture tombe le jour de l'événement, jamais avant minuit
    // la veille : on ne lit que ceux qui commencent dans les 36 h.
    const candidats = await this.prisma.event.findMany({
      where: {
        status: EventStatus.DRAFT,
        isPermanentContainer: false,
        endAt: { gt: maintenant },
        startAt: { lte: new Date(maintenant.getTime() + 36 * 3600_000) },
        venue: { flaixEnabled: false },
        eventSuppliers: { some: {} },
      },
      select: {
        id: true,
        name: true,
        startAt: true,
        venue: { select: { ordersOpenAt: true, timezone: true } },
        eventSuppliers: { select: { supplierId: true } },
      },
    });

    let ouverts = 0;
    for (const ev of candidats) {
      const ouverture = heureDOuverture(
        { id: ev.id, name: ev.name, startAt: ev.startAt, endAt: ev.startAt, status: EventStatus.DRAFT, flaixOrderUrl: null },
        { heure: ev.venue.ordersOpenAt, timezone: ev.venue.timezone || 'Europe/Paris' },
      );
      if (maintenant.getTime() < ouverture.getTime()) continue;

      try {
        const buvettes = await this.prisma.$transaction(async (tx) => {
          const bascule = await tx.event.updateMany({
            where: { id: ev.id, status: EventStatus.DRAFT },
            data: { status: EventStatus.ACTIVE },
          });
          if (bascule.count === 0) return null; // déjà basculé, par un autre ou par le club
          return tx.supplier.updateMany({
            where: { id: { in: ev.eventSuppliers.map((s) => s.supplierId) }, status: SupplierStatus.CLOSED },
            data: { status: SupplierStatus.OPEN },
          });
        });
        if (!buvettes) continue;
        ouverts += 1;
        this.logger.log(
          `Ouverture automatique : « ${ev.name} » (${ev.id}) actif, ${buvettes.count} point(s) de retrait ouvert(s)`,
        );
      } catch (e: unknown) {
        // Rien n'a été écrit pour CET événement : il reste en brouillon et
        // sera repris à la minute suivante. Les autres continuent.
        this.logger.error(
          `Ouverture automatique de « ${ev.name} » (${ev.id}) reportée : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return ouverts;
  }

  /** Les événements arrivés à leur fin. Rend leur nombre. */
  async fermer(maintenant: Date): Promise<number> {
    const finis = await this.prisma.event.findMany({
      where: {
        status: { in: [EventStatus.ACTIVE, EventStatus.PAUSED] },
        isPermanentContainer: false,
        endAt: { lte: maintenant },
        venue: { flaixEnabled: false },
      },
      select: { id: true, name: true, status: true, eventSuppliers: { select: { supplierId: true } } },
    });

    let fermes = 0;
    for (const ev of finis) {
      try {
        const buvettes = await this.prisma.$transaction(async (tx) => {
          const bascule = await tx.event.updateMany({
            where: { id: ev.id, status: ev.status },
            data: { status: EventStatus.ENDED },
          });
          if (bascule.count === 0) return null;

          const ids = ev.eventSuppliers.map((s) => s.supplierId);
          if (ids.length === 0) return { count: 0 };
          // Les points de retrait qui servent ENCORE autre chose restent ouverts :
          // un autre événement en cours, ou le service continu d'un lieu.
          const encoreUtiles = await tx.eventSupplier.findMany({
            where: {
              supplierId: { in: ids },
              eventId: { not: ev.id },
              event: {
                status: EventStatus.ACTIVE,
                OR: [{ isPermanentContainer: true }, { endAt: { gt: maintenant } }],
              },
            },
            select: { supplierId: true },
          });
          const garder = new Set(encoreUtiles.map((e) => e.supplierId));
          const aFermer = ids.filter((id) => !garder.has(id));
          return aFermer.length
            ? tx.supplier.updateMany({
                where: { id: { in: aFermer }, status: SupplierStatus.OPEN },
                data: { status: SupplierStatus.CLOSED },
              })
            : { count: 0 };
        });
        if (!buvettes) continue;
        fermes += 1;
        this.logger.log(
          `Fermeture automatique : « ${ev.name} » (${ev.id}) terminé, ${buvettes.count} point(s) de retrait fermé(s)`,
        );
      } catch (e: unknown) {
        // Rien n'a été écrit pour CET événement : repris à la minute suivante.
        this.logger.error(
          `Fermeture automatique de « ${ev.name} » (${ev.id}) reportée : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return fermes;
  }
}
