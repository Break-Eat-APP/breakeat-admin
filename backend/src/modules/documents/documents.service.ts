import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess, MANAGE_ROLES } from '../../common/helpers/require-org-access';

/**
 * Le fichier reçu, tel qu'on s'en sert — et rien de plus.
 *
 * Déclaré ici plutôt que d'ajouter `@types/multer` : nous n'utilisons que
 * quatre champs, et une dépendance de types pour quatre champs est une
 * dépendance de plus à faire vivre.
 */
export interface FichierRecu {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Les documents d'un club : contrat signé, attestation, ce qu'il veut garder
 * sous la main.
 *
 * Réservé aux rôles de DIRECTION du club (et au super-admin). Un contrat entre
 * la plateforme et le club ne regarde ni le comptoir ni l'équipe marketing :
 * c'est un document contractuel, pas un outil de travail.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  /**
   * Dix méga-octets. Un contrat signé et scanné dépasse rarement trois ; au-delà,
   * c'est une erreur de manipulation. La base pose la même borne de son côté :
   * le jour où une route oublierait de vérifier, elle refuserait quand même.
   */
  static readonly TAILLE_MAX = 10 * 1024 * 1024;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le type est vérifié sur le CONTENU, pas sur ce que le navigateur annonce.
   *
   * L'en-tête de type est fourni par l'appelant : il se change en une ligne.
   * Un vrai PDF, lui, commence toujours par `%PDF-`. C'est la seule vérification
   * qui tienne face à quelqu'un qui renomme un fichier.
   */
  private estUnPdf(contenu: Buffer): boolean {
    return contenu.subarray(0, 5).toString('latin1') === '%PDF-';
  }

  /** Dépose un document. Le contenu ne ressort jamais de cette méthode. */
  async deposer(
    orgId: string,
    userId: string,
    fichier: FichierRecu,
  ) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);

    if (!fichier?.buffer?.length) {
      throw new BadRequestException('Fichier vide.');
    }
    if (fichier.size > DocumentsService.TAILLE_MAX) {
      throw new BadRequestException(
        `Fichier trop lourd (${Math.round(fichier.size / 1024 / 1024)} Mo). Maximum : 10 Mo.`,
      );
    }
    if (!this.estUnPdf(fichier.buffer)) {
      throw new BadRequestException(
        'Seuls les fichiers PDF sont acceptés. (Le contenu du fichier n’est pas un PDF.)',
      );
    }

    // Le nom vient de l'utilisateur : on garde ce qui se lit, on retire ce qui
    // sert à tromper — chemins, caractères de contrôle. Il sera réaffiché, et
    // proposé comme nom de fichier au téléchargement.
    const nom =
      fichier.originalname
        .replace(/[\\/]/g, ' ')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 120) || 'document.pdf';

    const document = await this.prisma.document.create({
      data: {
        organizationId: orgId,
        name: nom,
        mimeType: 'application/pdf',
        sizeBytes: fichier.size,
        // Prisma attend un `Uint8Array` : un `Buffer` en est un, mais son
        // type déclaré autorise une mémoire partagée que Prisma refuse.
        content: new Uint8Array(fichier.buffer),
        uploadedBy: userId,
      },
      select: { id: true, name: true, sizeBytes: true, createdAt: true },
    });

    this.logger.log(`Document « ${nom} » déposé pour l'org ${orgId} par ${userId}`);
    return document;
  }

  /**
   * La liste — SANS le contenu.
   *
   * Un `select` explicite, et non l'objet entier : renvoyer les octets de tous
   * les documents pour afficher une liste de trois lignes ferait transiter des
   * méga-octets à chaque ouverture de page.
   */
  async lister(orgId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);

    const documents = await this.prisma.document.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, sizeBytes: true, createdAt: true, uploadedBy: true },
    });

    const auteurs = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(documents.map((d) => d.uploadedBy).filter((x): x is string => !!x))] } },
          select: { id: true, displayName: true },
        })
      ).map((u) => [u.id, u.displayName]),
    );

    return documents.map((d) => ({
      id: d.id,
      name: d.name,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
      // « Compte supprimé » plutôt qu'un vide : un contrat déposé par quelqu'un
      // qui a quitté le club reste un contrat déposé.
      deposePar: d.uploadedBy ? (auteurs.get(d.uploadedBy) ?? 'Compte supprimé') : null,
    }));
  }

  /** Le contenu d'un document, pour l'afficher. */
  async contenu(orgId: string, userId: string, documentId: string) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);

    // `findFirst` avec l'organisation dans le filtre, et non `findUnique` sur
    // l'identifiant seul : sans cela, connaître un identifiant suffirait à lire
    // le contrat d'un autre club.
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId: orgId },
      select: { name: true, mimeType: true, content: true },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    return document;
  }

  async supprimer(orgId: string, userId: string, documentId: string) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);

    const { count } = await this.prisma.document.deleteMany({
      where: { id: documentId, organizationId: orgId },
    });
    if (count === 0) throw new NotFoundException('Document introuvable');

    this.logger.log(`Document ${documentId} supprimé de l'org ${orgId} par ${userId}`);
    return { supprime: true as const };
  }
}
