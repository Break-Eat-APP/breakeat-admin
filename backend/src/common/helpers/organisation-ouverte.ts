import { BadRequestException } from '@nestjs/common';
import { OrgStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Un club suspendu ne reçoit plus de clients.
 *
 * « Désactiver » dans le back-office ne changeait qu'une étiquette : le statut
 * n'était lu nulle part. Un club suspendu restait visible dans l'application,
 * sa carte s'ouvrait, et ses commandes partaient — la suspension ne suspendait
 * rien.
 *
 * Ce qu'elle ferme : la DÉCOUVERTE (le lieu disparaît de la recherche), l'accès
 * à l'événement et à sa carte, la création de panier et le paiement.
 *
 * Ce qu'elle NE ferme PAS, volontairement : les écrans de l'équipe. Une
 * suspension ne doit pas laisser en plan les commandes déjà payées — le
 * comptoir doit pouvoir les préparer et les remettre, et le club garde l'accès
 * à sa comptabilité. Fermer les postes ferait perdre de l'argent à des clients
 * qui n'y sont pour rien.
 */

/** Filtre Prisma : ne montrer que ce qui appartient à un club en service. */
export const CLUB_EN_SERVICE = { organization: { status: OrgStatus.ACTIVE } } as const;

/** Le club accepte-t-il des clients en ce moment ? */
export async function organisationOuverte(
  prisma: PrismaService,
  organizationId: string,
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  return org?.status === OrgStatus.ACTIVE;
}

/**
 * Refuse une commande quand le club est suspendu.
 *
 * Le message s'adresse au CLIENT : il n'a pas à savoir qu'une plateforme a
 * suspendu un compte, seulement que ce comptoir ne prend pas de commande
 * aujourd'hui.
 */
export async function assertOrganisationOuverte(
  prisma: PrismaService,
  organizationId: string,
): Promise<void> {
  if (await organisationOuverte(prisma, organizationId)) return;
  throw new BadRequestException(
    'Ce lieu ne prend pas de commande pour le moment. Réessayez plus tard.',
  );
}
