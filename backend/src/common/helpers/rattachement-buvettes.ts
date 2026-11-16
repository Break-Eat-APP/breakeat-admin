import { EventStatus, SupplierStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * LE RATTACHEMENT AUTOMATIQUE DES POINTS DE RETRAIT (règle de Rémi, 16/11/2026).
 *
 * Avant : il fallait « attacher » chaque buvette à chaque événement, à la main,
 * depuis deux écrans différents. Un oubli, et un point de retrait restait vide
 * le soir du match.
 *
 * Désormais :
 *  - un ÉVÉNEMENT qui naît reçoit tous les points de retrait du club ;
 *  - un POINT DE RETRAIT qui naît rejoint tous les événements à venir du club ;
 *  - DÉSACTIVER un point de retrait pour un événement reste un geste manuel,
 *    sur la fiche de l'événement (c'est le détachement d'avant). Il n'est
 *    jamais défait par une automatisation : le rattachement ne joue qu'à la
 *    NAISSANCE de l'un ou de l'autre.
 *
 * Une buvette appartient au CLUB, pas à un lieu : pour un club à plusieurs
 * lieux, ceux de l'autre lieu se désactivent à la main.
 *
 * `skipDuplicates` : une paire déjà là n'est pas une erreur.
 */

/** Statuts d'un point de retrait qu'on ne rattache pas d'office : hors ligne. */
const ECARTES: SupplierStatus[] = [SupplierStatus.OFFLINE];

/** Un événement qui naît reçoit tous les points de retrait du club. */
export async function rattacherLesPointsDeRetrait(
  prisma: PrismaService,
  eventId: string,
  organizationId: string,
): Promise<number> {
  const buvettes = await prisma.supplier.findMany({
    where: { organizationId, status: { notIn: ECARTES } },
    select: { id: true },
  });
  if (buvettes.length === 0) return 0;
  const r = await prisma.eventSupplier.createMany({
    data: buvettes.map((b) => ({ eventId, supplierId: b.id })),
    skipDuplicates: true,
  });
  return r.count;
}

/** Un point de retrait qui naît rejoint tous les événements à venir du club. */
export async function rattacherAuxEvenements(
  prisma: PrismaService,
  supplierId: string,
  organizationId: string,
  maintenant: Date = new Date(),
): Promise<number> {
  const evenements = await prisma.event.findMany({
    where: {
      organizationId,
      status: { notIn: [EventStatus.ENDED, EventStatus.CANCELLED] },
      OR: [{ isPermanentContainer: true }, { endAt: { gt: maintenant } }],
    },
    select: { id: true },
  });
  if (evenements.length === 0) return 0;
  const r = await prisma.eventSupplier.createMany({
    data: evenements.map((e) => ({ eventId: e.id, supplierId })),
    skipDuplicates: true,
  });
  return r.count;
}
