import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess } from '../../common/helpers/require-org-access';
import { OrgRole } from '../../common/enums/role.enum';
import { dateCourte, euros, versCsv } from '../../common/helpers/csv';

/**
 * Le fichier client d'un club : qui commande chez lui, à quelle fréquence, pour
 * combien, et quoi.
 *
 * Tout se déduit des commandes déjà enregistrées — rien de nouveau n'est
 * collecté. C'est important : le club ne voit QUE les gens qui ont commandé
 * chez lui, jamais la base des autres clubs, et jamais un client qui ne l'a
 * jamais fréquenté.
 *
 * Le périmètre financier est exactement celui de la comptabilité
 * (`stats.service`) : paiement réussi, commande non annulée. Deux conventions
 * différentes donneraient deux totaux différents pour le même client, et c'est
 * la page qui afficherait le plus petit qu'on croirait cassée.
 */
@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  /**
   * Qui peut lire le fichier client.
   *
   * L'OPÉRATEUR en est exclu, volontairement : il tient un comptoir, il n'a
   * rien à faire avec les adresses e-mail de la clientèle. Le rôle MARKETING,
   * lui, existe précisément pour ce travail.
   */
  private static readonly ROLES = [OrgRole.ORG_ADMIN, OrgRole.MANAGER, OrgRole.MARKETING];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le périmètre commun à toutes les lectures de ce module.
   *
   * Écrit une seule fois : la liste, l'export et les totaux doivent compter les
   * mêmes commandes, sans quoi l'export ne correspondrait pas à l'écran qui l'a
   * produit.
   */
  private perimetre(orgId: string, filtre: FiltreClients): Prisma.OrderWhereInput {
    return {
      organizationId: orgId,
      paymentStatus: PaymentStatus.SUCCEEDED,
      status: { not: OrderStatus.CANCELLED },
      ...(filtre.venueId ? { venueId: filtre.venueId } : {}),
      ...(filtre.du || filtre.au
        ? {
            createdAt: {
              ...(filtre.du ? { gte: filtre.du } : {}),
              ...(filtre.au ? { lte: filtre.au } : {}),
            },
          }
        : {}),
    };
  }

  /** Les clients du club, du plus dépensier au moins dépensier. */
  async lister(orgId: string, userId: string, filtre: FiltreClients = {}): Promise<FicheClient[]> {
    await requireOrgAccess(this.prisma, userId, orgId, ClientsService.ROLES);
    const where = this.perimetre(orgId, filtre);

    const groupes = await this.prisma.order.groupBy({
      by: ['userId'],
      where,
      _count: { _all: true },
      _sum: { totalCents: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    if (groupes.length === 0) return [];

    const ids = groupes.map((g) => g.userId);
    const [comptes, lieux, preferes] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      }),
      this.lieuxFrequentes(where),
      this.produitsPreferes(where),
    ]);
    const parId = new Map(comptes.map((c) => [c.id, c]));

    return groupes
      .map((g) => {
        const compte = parId.get(g.userId);
        const commandes = g._count._all;
        const totalCents = g._sum.totalCents ?? 0;
        return {
          userId: g.userId,
          // Prénom et nom séparés depuis le 19/09. Vides pour les comptes
          // antérieurs et pour ceux créés par Apple, qui ne les fournit pas
          // toujours : le nom affiché reste alors la seule chose qu'on ait.
          prenom: compte?.firstName ?? null,
          nomDeFamille: compte?.lastName ?? null,
          nom: compte?.displayName ?? 'Compte supprimé',
          email: compte?.email ?? '',
          telephone: compte?.phone ?? null,
          commandes,
          totalCents,
          // Arrondi à l'entier : un panier moyen au centime près donnerait une
          // fausse précision sur des effectifs de quelques commandes.
          panierMoyenCents: commandes > 0 ? Math.round(totalCents / commandes) : 0,
          premiereCommande: (g._min.createdAt ?? new Date()).toISOString(),
          derniereCommande: (g._max.createdAt ?? new Date()).toISOString(),
          lieux: lieux.get(g.userId) ?? [],
          produitPrefere: preferes.get(g.userId) ?? null,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents);
  }

  /** Les lieux où ce client a commandé, par leur nom. */
  private async lieuxFrequentes(where: Prisma.OrderWhereInput): Promise<Map<string, string[]>> {
    const couples = await this.prisma.order.groupBy({ by: ['userId', 'venueId'], where });
    const noms = new Map(
      (
        await this.prisma.venue.findMany({
          where: { id: { in: [...new Set(couples.map((c) => c.venueId))] } },
          select: { id: true, name: true },
        })
      ).map((v) => [v.id, v.name]),
    );

    const parClient = new Map<string, string[]>();
    for (const c of couples) {
      const nom = noms.get(c.venueId);
      if (!nom) continue;
      parClient.set(c.userId, [...(parClient.get(c.userId) ?? []), nom]);
    }
    return parClient;
  }

  /**
   * Le produit le plus souvent pris par chaque client.
   *
   * Les lignes sont agrégées EN MÉMOIRE, à partir du même périmètre que le
   * reste — ce qui garantit que les deux chiffres racontent la même histoire.
   * Le jour où un club dépassera quelques dizaines de milliers de lignes de
   * commande sur la période lue, ce calcul devra passer en SQL ; d'ici là, une
   * requête ajoutée pour un gain théorique serait du travail perdu.
   */
  private async produitsPreferes(where: Prisma.OrderWhereInput): Promise<Map<string, string>> {
    const lignes = await this.prisma.orderItem.findMany({
      where: { order: where },
      select: {
        productNameSnapshot: true,
        quantity: true,
        order: { select: { userId: true } },
      },
    });

    const parClient = new Map<string, Map<string, number>>();
    for (const l of lignes) {
      const compte = parClient.get(l.order.userId) ?? new Map<string, number>();
      compte.set(l.productNameSnapshot, (compte.get(l.productNameSnapshot) ?? 0) + l.quantity);
      parClient.set(l.order.userId, compte);
    }

    const preferes = new Map<string, string>();
    for (const [client, compte] of parClient) {
      const meilleur = [...compte.entries()].sort((a, b) => b[1] - a[1])[0];
      if (meilleur) preferes.set(client, meilleur[0]);
    }
    return preferes;
  }

  /**
   * La fiche d'UN client : ses agrégats, et le détail de ses commandes.
   *
   * Strictement limitée au périmètre du club : il voit les commandes passées
   * CHEZ LUI, jamais celles que cette personne a passées ailleurs. Un fichier
   * client ne doit pas devenir une fenêtre sur la concurrence.
   */
  async fiche(
    orgId: string,
    userId: string,
    clientId: string,
    filtre: FiltreClients = {},
  ): Promise<FicheDetaillee> {
    await requireOrgAccess(this.prisma, userId, orgId, ClientsService.ROLES);

    const commandes = await this.prisma.order.findMany({
      where: { ...this.perimetre(orgId, filtre), userId: clientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        publicOrderNumber: true,
        dailyNumber: true,
        createdAt: true,
        totalCents: true,
        status: true,
        venueId: true,
        items: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { productNameSnapshot: true, quantity: true, lineTotalCents: true },
        },
      },
    });

    const noms = new Map(
      (
        await this.prisma.venue.findMany({
          where: { id: { in: [...new Set(commandes.map((c) => c.venueId))] } },
          select: { id: true, name: true },
        })
      ).map((v) => [v.id, v.name]),
    );

    // Le client lui-même, relu depuis la liste : les agrégats restent calculés
    // à UN seul endroit, donc la fiche ne peut pas afficher un total différent
    // de celui du tableau qui l'a ouverte.
    const liste = await this.lister(orgId, userId, filtre);
    const client = liste.find((c) => c.userId === clientId) ?? null;

    return {
      client,
      commandes: commandes.map((c) => ({
        id: c.id,
        numero: c.dailyNumber != null ? `N° ${c.dailyNumber}` : c.publicOrderNumber,
        reference: c.publicOrderNumber,
        quand: c.createdAt.toISOString(),
        lieu: noms.get(c.venueId) ?? 'Lieu supprimé',
        totalCents: c.totalCents,
        statut: c.status,
        articles: c.items.map((a) => ({
          nom: a.productNameSnapshot,
          quantite: a.quantity,
          totalCents: a.lineTotalCents,
        })),
      })),
    };
  }

  /**
   * Le même fichier, en CSV.
   *
   * Passe par `lister` plutôt que de refaire ses requêtes : l'export doit être
   * le contenu de l'écran, à la ligne près. Un export qui diverge de ce qui est
   * affiché fait douter des deux.
   */
  async exporterCsv(
    orgId: string,
    userId: string,
    filtre: FiltreClients = {},
  ): Promise<{ csv: string; nomFichier: string; lignes: number }> {
    const clients = await this.lister(orgId, userId, filtre);

    const csv = versCsv(
      [
        'Prénom',
        'Nom',
        'Nom affiché',
        'E-mail',
        'Téléphone',
        'Commandes',
        'Total dépensé (€)',
        'Panier moyen (€)',
        'Première commande',
        'Dernière commande',
        'Lieux fréquentés',
        'Produit préféré',
      ],
      clients.map((c) => [
        c.prenom,
        c.nomDeFamille,
        c.nom,
        c.email,
        c.telephone,
        c.commandes,
        euros(c.totalCents),
        euros(c.panierMoyenCents),
        dateCourte(new Date(c.premiereCommande)),
        dateCourte(new Date(c.derniereCommande)),
        c.lieux.join(' · '),
        c.produitPrefere,
      ]),
    );

    // Tracé dans le journal : ces lignes portent des noms et des adresses, et
    // savoir QUI a sorti le fichier, QUAND et pour quel club est la moindre des
    // choses le jour où un client demande des comptes. Une trace en base
    // demanderait une table ; le journal suffit à répondre.
    this.logger.log(
      `Export du fichier client — org ${orgId}, par ${userId}, ` +
        `${clients.length} ligne(s)${filtre.venueId ? `, lieu ${filtre.venueId}` : ''}`,
    );

    const jour = new Date().toISOString().slice(0, 10);
    return { csv, nomFichier: `clients-${jour}.csv`, lignes: clients.length };
  }
}

/** Ce qui restreint la lecture : un lieu, une période, ou rien. */
export interface FiltreClients {
  venueId?: string;
  du?: Date;
  au?: Date;
}

/** Une ligne du fichier client. */
export interface FicheClient {
  userId: string;
  /** Renseignés depuis le 19/09 ; nuls pour les comptes antérieurs. */
  prenom: string | null;
  nomDeFamille: string | null;
  /** Ce qu'on affiche : prénom + nom quand on les a, sinon ce qui a été saisi. */
  nom: string;
  email: string;
  telephone: string | null;
  commandes: number;
  totalCents: number;
  panierMoyenCents: number;
  premiereCommande: string;
  derniereCommande: string;
  lieux: string[];
  produitPrefere: string | null;
}

/** Une commande, telle qu'elle apparaît dans la fiche d'un client. */
export interface CommandeDeLaFiche {
  id: string;
  /** Le numéro du jour quand il existe, sinon la référence longue. */
  numero: string;
  reference: string;
  quand: string;
  lieu: string;
  totalCents: number;
  statut: string;
  articles: { nom: string; quantite: number; totalCents: number }[];
}

/** La fiche complète d'un client, dans le périmètre d'UN club. */
export interface FicheDetaillee {
  /** Nul si ce client n'a aucune commande dans le périmètre lu. */
  client: FicheClient | null;
  commandes: CommandeDeLaFiche[];
}
