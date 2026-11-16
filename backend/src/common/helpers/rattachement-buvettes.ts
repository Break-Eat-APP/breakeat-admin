import { EventStatus, PickupPointStatus, SupplierStatus } from '@prisma/client';
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
  await assurerLesComptoirs(prisma, [eventId], buvettes.map((b) => b.id));
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
  await assurerLesComptoirs(prisma, evenements.map((e) => e.id), [supplierId]);
  return r.count;
}

/**
 * UN COMPTOIR PAR DÉFAUT, AU NOM DU POINT DE RETRAIT (Rémi, 16/11/2026).
 *
 * Une commande ne se paie pas sans comptoir de retrait, et les comptoirs se
 * créaient à la main, événement par événement : un événement ouvert
 * automatiquement aurait pu n'avoir rien où encaisser. Chaque point de retrait
 * rattaché reçoit donc, s'il n'en a aucun sur cet événement, un comptoir qui
 * porte SON nom — « Buvette Nord » reste « Buvette Nord » pour le client, sans
 * second nom qui le perdrait. La section « Comptoirs de retrait » ne sert plus
 * qu'à en ajouter (jusqu'à 4) pour une grande buvette.
 *
 * Rend le nombre de comptoirs créés.
 */
export async function assurerLesComptoirs(
  prisma: PrismaService,
  eventIds: string[],
  supplierIds: string[],
): Promise<number> {
  if (eventIds.length === 0 || supplierIds.length === 0) return 0;
  const [evenements, buvettes, existants] = await Promise.all([
    prisma.event.findMany({
      where: { id: { in: eventIds }, isPermanentContainer: false },
      select: { id: true, organizationId: true, venueId: true },
    }),
    prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    }),
    prisma.pickupPoint.findMany({
      where: {
        eventId: { in: eventIds },
        supplierId: { in: supplierIds },
        status: PickupPointStatus.ACTIVE,
      },
      select: { eventId: true, supplierId: true },
    }),
  ]);
  const deja = new Set(existants.map((p) => `${p.eventId}|${p.supplierId}`));
  const aCreer = evenements.flatMap((e) =>
    buvettes
      .filter((b) => !deja.has(`${e.id}|${b.id}`))
      .map((b) => ({
        organizationId: e.organizationId,
        venueId: e.venueId,
        eventId: e.id,
        supplierId: b.id,
        name: b.name,
      })),
  );
  if (aCreer.length === 0) return 0;
  const r = await prisma.pickupPoint.createMany({ data: aCreer });
  return r.count;
}
