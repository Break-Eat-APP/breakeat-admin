import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { ventilerSurTotal, type VentilationTva } from './tva';

/**
 * La ventilation TVA d'un ensemble de commandes, lue en base.
 *
 * Partagée par le tableau de bord manager (StatsService) et le back-office
 * (BackofficeService) : les deux doivent afficher les MÊMES chiffres pour le
 * même périmètre. Deux calculs parallèles finiraient par diverger, et l'écart
 * entre « ce que voit le club » et « ce que voit la plateforme » ne se
 * découvrirait qu'au moment d'une facture contestée.
 *
 * `ttcReelCents` est le total encaissé, déjà agrégé par l'appelant : il fait
 * foi. Les lignes ne servent qu'à répartir ce total entre les taux.
 */
export async function ventilationCommandes(
  prisma: PrismaService,
  where: Prisma.OrderWhereInput,
  ttcReelCents: number,
): Promise<VentilationTva> {
  if (ttcReelCents === 0) {
    return { tranches: [], ttcCents: 0, htCents: 0, tvaCents: 0 };
  }
  const parTaux = await prisma.orderItem.groupBy({
    by: ['vatRateBps'],
    where: { order: where },
    _sum: { lineTotalCents: true },
  });
  return ventilerSurTotal(
    parTaux.map((r) => ({ vatRateBps: r.vatRateBps, ttcCents: r._sum.lineTotalCents ?? 0 })),
    ttcReelCents,
  );
}
