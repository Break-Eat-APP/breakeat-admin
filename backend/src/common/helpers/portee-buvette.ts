import { ForbiddenException } from '@nestjs/common';
import { GlobalRole } from '../enums/role.enum';
import type { PrismaService } from '../../database/prisma.service';

/**
 * UN POSTE ÉPINGLÉ À UNE BUVETTE N'AGIT QUE SUR LA SIENNE.
 *
 * `requireOrgAccess` vérifie l'appartenance au CLUB et le rôle. Il ne regarde
 * pas `OrganizationMember.supplierId` — le comptoir auquel un opérateur est
 * rattaché. Sans ce second contrôle, l'opératrice de la buvette Nord pouvait
 * fermer les créneaux de la buvette Sud ou retirer ses produits de la carte :
 * elle est bien membre du club, et son rôle l'autorise.
 *
 * Ce n'est pas une faille d'intrusion — il faut déjà un compte du club — mais un
 * défaut de cloisonnement qui casse le service d'une autre équipe, en pleine
 * mi-temps, sans que personne comprenne pourquoi.
 *
 * La règle vaut déjà pour le TEMPS RÉEL (`realtime.gateway.ts`, salons
 * `supplier:*`). Les deux chemins doivent répondre la même chose, sinon l'un
 * devient une porte dérobée vers ce que l'autre refuse.
 *
 * @param supplierId Buvette visée par l'action. `null` = ressource PARTAGÉE par
 *   toutes les buvettes de l'événement (un créneau commun, par exemple) : un
 *   poste épinglé n'y touche pas non plus, puisqu'il déciderait pour les autres.
 */
export async function requirePorteeBuvette(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
  supplierId: string | null,
  message = 'Cette action concerne une autre buvette que la tienne.',
): Promise<void> {
  // Même exemption que `requireOrgAccess`, et lue en base pour la même raison :
  // un rôle retiré prend effet tout de suite, sans attendre l'expiration du jeton.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRole: true },
  });
  if (user?.globalRole === GlobalRole.SUPER_ADMIN) return;

  const membre = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { supplierId: true },
  });

  // Pas de comptoir attitré : manager, administrateur, ou opérateur qui couvre
  // tout le lieu. Rien à restreindre — l'appartenance au club a déjà été
  // vérifiée par l'appelant.
  if (!membre?.supplierId) return;

  if (membre.supplierId !== supplierId) {
    throw new ForbiddenException(message);
  }
}
