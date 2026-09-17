import { ConflictException } from '@nestjs/common';
import { OrgStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Ce qu'un compte ou une organisation ARCHIVÉ rend en partant.
 *
 * Un compte archivé gardait son adresse, et une organisation suspendue son
 * slug : la même personne ne pouvait plus s'inscrire, ni par e-mail ni par
 * Apple, et le même club ne pouvait plus être recréé. Archiver fermait la porte
 * pour toujours.
 *
 * Désormais, se réinscrire crée un compte NEUF. L'ancien garde tout son
 * historique — ses commandes restent dans la comptabilité — mais rend son
 * identifiant, remplacé par un identifiant-témoin ; l'original est conservé
 * (`archivedEmail`, `archivedSlug`) pour le back-office et une éventuelle
 * réactivation.
 *
 * Pourquoi un compte neuf plutôt que la réactivation de l'ancien : l'app ne
 * vérifie pas les adresses. Réactiver sur simple inscription donnerait
 * l'historique, les points et les reçus d'un client à quiconque tape son
 * adresse — et un opérateur archivé retrouverait le poste de son ancien club.
 *
 * Conséquence assumée : archiver n'est pas bannir.
 */

/**
 * L'adresse-témoin d'un compte libéré.
 *
 * Unique par compte, et inutilisable par construction : le domaine `.invalid`
 * est réservé (RFC 2606) et ne recevra jamais de courrier.
 */
export const adresseTemoin = (userId: string): string => `archive+${userId}@archive.invalid`;

/** Le slug-témoin d'une organisation libérée — mêmes caractères qu'un slug saisi. */
export const slugTemoin = (orgId: string, slug: string): string =>
  `${slug}--archive-${orgId.slice(0, 8)}`;

/**
 * Libère un compte ARCHIVÉ : son adresse, ses identités Apple/Google, ses
 * sessions et ses jetons push. Ne touche jamais un compte actif.
 *
 * Les identités partent avec l'adresse : sans cela, « Continuer avec Apple »
 * retrouverait l'ancien compte par son sujet et se heurterait à l'archivage.
 * Les jetons push aussi : l'appareil ne doit plus recevoir les annonces d'un
 * compte fermé.
 *
 * Rend l'identifiant du compte libéré, ou `null` s'il n'y avait rien à faire.
 */
export async function libererCompteArchive(
  prisma: PrismaService,
  cible: { id: string } | { email: string },
): Promise<string | null> {
  const ancien = await prisma.user.findUnique({
    where: 'id' in cible ? { id: cible.id } : { email: cible.email.toLowerCase() },
    select: { id: true, email: true, isActive: true, archivedEmail: true },
  });
  if (!ancien || ancien.isActive) return null;

  // Déjà libéré : son adresse est un témoin, il n'a plus rien à rendre.
  if (ancien.email === adresseTemoin(ancien.id)) return null;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: ancien.id },
      data: { email: adresseTemoin(ancien.id), archivedEmail: ancien.email },
    }),
    prisma.userIdentity.deleteMany({ where: { userId: ancien.id } }),
    prisma.refreshToken.deleteMany({ where: { userId: ancien.id } }),
    prisma.pushToken.deleteMany({ where: { userId: ancien.id } }),
  ]);
  return ancien.id;
}

/**
 * Libère le slug d'une organisation INACTIVE avant d'en créer (ou d'en
 * renommer) une autre sous ce slug.
 *
 * Une organisation ACTIVE, elle, le garde : deux clubs en service ne peuvent
 * pas partager un identifiant, et le dire vaut mieux qu'une erreur de
 * contrainte.
 */
export async function libererSlugInactif(prisma: PrismaService, slug: string): Promise<void> {
  const ancienne = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, status: true },
  });
  if (!ancienne) return;

  if (ancienne.status === OrgStatus.ACTIVE) {
    throw new ConflictException(
      `Le slug « ${slug} » est déjà celui de l'organisation active « ${ancienne.name} ».`,
    );
  }

  await prisma.organization.update({
    where: { id: ancienne.id },
    data: { slug: slugTemoin(ancienne.id, slug), archivedSlug: slug },
  });
}
