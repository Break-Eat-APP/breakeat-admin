import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * LES LIEUX FAVORIS D'UN CLIENT CONNECTÉ — une copie, pas l'original.
 *
 * Le favori vit sur le téléphone : on parcourt les lieux sans compte, et un
 * favori qui exigerait de s'inscrire ne serait plus un raccourci. Le téléphone
 * envoie ici sa liste dès que le client est connecté, pour UNE raison : qu'une
 * campagne d'un lieu atteigne ceux qui le suivent (`ScheduledPushService`,
 * `destinataires`). Un lieu piloté par Flaix n'a aucune commande BreakEat ;
 * sans cette copie, ses campagnes partaient vers zéro appareil.
 *
 * ── POURQUOI REMPLACER LA LISTE, ET PAS AJOUTER / RETIRER ────────────
 *
 * Le téléphone fait foi. Lui envoyer « voici ma liste » est rejouable : la même
 * demande deux fois donne le même état, un envoi perdu est rattrapé par le
 * suivant, et un cœur touché hors connexion arrive au prochain envoi. Des
 * ajouts et retraits un par un, eux, divergent au premier échec réseau.
 *
 * Limite assumée : un client sur DEUX téléphones voit la liste du dernier qui
 * a écrit. Le cas est rare, et il ne fait perdre qu'une partie du ciblage.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remplace les favoris du client par `venueIds`.
   *
   * Un identifiant inconnu est ÉCARTÉ, pas refusé : le téléphone peut garder
   * un lieu supprimé depuis, et le reste de la liste ne doit pas tomber pour
   * autant. Rend les identifiants réellement retenus.
   */
  async remplacer(userId: string, venueIds: readonly string[]): Promise<{ venueIds: string[] }> {
    const demandes = [...new Set(venueIds)];
    const existants =
      demandes.length === 0
        ? []
        : await this.prisma.venue.findMany({
            where: { id: { in: demandes } },
            select: { id: true },
          });
    const connus = new Set(existants.map((v) => v.id));
    // L'ordre du téléphone est gardé dans la réponse : il est le seul à en avoir un.
    const retenus = demandes.filter((id) => connus.has(id));

    // Dans UNE transaction : une campagne qui lirait entre l'effacement et la
    // réécriture verrait le client sans aucun favori.
    await this.prisma.$transaction([
      this.prisma.venueFavorite.deleteMany({
        where: { userId, venueId: { notIn: retenus } },
      }),
      this.prisma.venueFavorite.createMany({
        data: retenus.map((venueId) => ({ userId, venueId })),
        skipDuplicates: true,
      }),
    ]);

    return { venueIds: retenus };
  }
}
