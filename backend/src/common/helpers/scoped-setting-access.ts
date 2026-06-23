import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FlagScope } from '@prisma/client';
import { GlobalRole, OrgRole } from '../enums/role.enum';
import { requireOrgAccess, MANAGE_ROLES, ALL_ORG_ROLES } from './require-org-access';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Contrôle d'accès pour les ressources « scopées » (app-settings, feature-flags),
 * dont la portée est GLOBAL / ORGANIZATION / EVENT.
 *
 * Règles :
 *   - GLOBAL        → réservé au SUPER_ADMIN.
 *   - ORGANIZATION  → membre de l'org (scopeId) ; write/delete = MANAGE_ROLES.
 *   - EVENT         → on résout l'org de l'événement, puis mêmes règles.
 */

async function isSuperAdmin(prisma: PrismaService, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { globalRole: true } });
  return user?.globalRole === GlobalRole.SUPER_ADMIN;
}

/** Org propriétaire pour un scope donné (null pour GLOBAL). */
async function orgIdForScope(
  prisma: PrismaService,
  scope: FlagScope,
  scopeId: string | null | undefined,
): Promise<string | null> {
  if (scope === FlagScope.GLOBAL) return null;
  if (!scopeId) {
    throw new BadRequestException('scopeId est requis pour une portée ORGANIZATION ou EVENT.');
  }
  if (scope === FlagScope.ORGANIZATION) return scopeId;
  // EVENT → on remonte à l'organisation.
  const event = await prisma.event.findUnique({ where: { id: scopeId }, select: { organizationId: true } });
  if (!event) throw new NotFoundException('Événement introuvable.');
  return event.organizationId;
}

/** Autorise une lecture/écriture/suppression sur une ressource scopée. */
export async function requireScopedAccess(
  prisma: PrismaService,
  userId: string,
  scope: FlagScope,
  scopeId: string | null | undefined,
  mode: 'read' | 'write',
): Promise<void> {
  if (scope === FlagScope.GLOBAL) {
    // Lecture GLOBAL autorisée à tout membre authentifié ; écriture = SUPER_ADMIN.
    if (mode === 'read') return;
    if (await isSuperAdmin(prisma, userId)) return;
    throw new ForbiddenException('Accès refusé : la configuration GLOBALE est réservée au SUPER_ADMIN.');
  }
  const orgId = await orgIdForScope(prisma, scope, scopeId);
  await requireOrgAccess(prisma, userId, orgId!, mode === 'write' ? MANAGE_ROLES : ALL_ORG_ROLES);
}

/**
 * Filtre une liste de lignes scopées selon les droits de l'utilisateur.
 * SUPER_ADMIN voit tout ; sinon : GLOBAL + ses orgs + événements de ses orgs.
 */
export async function filterScopedRows<T extends { scope: FlagScope; scopeId: string | null }>(
  prisma: PrismaService,
  userId: string,
  rows: T[],
): Promise<T[]> {
  if (await isSuperAdmin(prisma, userId)) return rows;

  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  const orgIds = new Set(memberships.map((m) => m.organizationId));

  // Événements appartenant aux orgs de l'utilisateur (pour les lignes EVENT).
  const events = orgIds.size
    ? await prisma.event.findMany({ where: { organizationId: { in: [...orgIds] } }, select: { id: true } })
    : [];
  const eventIds = new Set(events.map((e) => e.id));

  return rows.filter((r) => {
    if (r.scope === FlagScope.GLOBAL) return true;
    if (r.scope === FlagScope.ORGANIZATION) return r.scopeId != null && orgIds.has(r.scopeId);
    if (r.scope === FlagScope.EVENT) return r.scopeId != null && eventIds.has(r.scopeId);
    return false;
  });
}

export { OrgRole };
