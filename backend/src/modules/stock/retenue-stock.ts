import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * RETENIR LE STOCK AVANT LE PAIEMENT — ce qui ne se faisait pas.
 *
 * Le paiement relisait le stock avant d'appeler Stripe. Une LECTURE n'empêche
 * aucun autre panier de lire la même quantité : deux clients sur la dernière
 * bière lisaient tous les deux « il en reste une », passaient tous les deux le
 * contrôle, et payaient tous les deux.
 *
 * Passé le débit, `decrementerStock` ne pouvait plus rien refuser — son
 * commentaire le dit en toutes lettres : « il CONSTATE ». Il mettait l'étagère
 * à zéro, retirait le produit de la carte, et créait la commande quand même.
 * Le comptoir devait substituer ou rembourser, devant le client.
 *
 * ── DISPONIBLE = quantity - reserved ───────────────────────────
 *
 * `quantity` est ce qui est SUR L'ÉTAGÈRE ; `reserved` ce qui est déjà promis
 * à un paiement en cours. La différence est ce qui se vend.
 *
 * La retenue est ATOMIQUE — `UPDATE … WHERE quantity - reserved >= n` — donc
 * c'est PostgreSQL qui arbitre la dernière unité, pas l'ordre d'arrivée dans
 * Node. Aucune lecture préalable ne peut tenir cette promesse.
 *
 * ── TOUT OU RIEN ───────────────────────────────────────────────
 *
 * Un panier de trois articles dont le deuxième manque ne doit pas partir au
 * paiement avec le premier retenu et le troisième non : le client paierait un
 * contenu que personne n'a voulu. L'appelant passe donc un client
 * TRANSACTIONNEL, et une ligne refusée fait tout annuler.
 *
 * ── POURQUOI AU PAIEMENT, ET PAS À L'AJOUT AU PANIER ───────────
 *
 * Retenir dès qu'un client coche un article gèlerait le stock pour tous les
 * paniers abandonnés de la soirée — et un soir de match, la plupart des
 * paniers ouverts ne sont jamais payés. On affamerait l'étagère pour protéger
 * des commandes qui n'arriveront jamais.
 *
 * Le prix de ce choix est assumé : deux clients peuvent composer des paniers
 * qui, ensemble, dépassent le stock. Le second l'apprend au paiement, où
 * refuser ne coûte qu'un message. C'est le bon endroit pour le lui dire.
 */

/** Une ligne de panier, réduite à ce qui compte pour le stock. */
export interface LigneARetenir {
  productId: string;
  quantity: number;
}

/** Ce qu'une étagère permet de vendre à l'instant. */
export function disponible(stock: { quantity: number; reserved: number }): number {
  // Jamais négatif : une opératrice peut abaisser l'étagère en dessous de ce
  // qui est retenu (elle recompte, elle corrige), et cet état transitoire ne
  // doit pas se lire comme « du stock en moins que zéro ».
  return Math.max(0, stock.quantity - stock.reserved);
}

/** Le client minimal dont ces fonctions ont besoin. */
type ClientStock = Pick<Prisma.TransactionClient, 'stock'>;

/**
 * L'étagère qui sert ce produit : celle du COMPTOIR d'abord, celle de la
 * buvette à défaut.
 *
 * `null` est un état NORMAL, pas une anomalie : un club qui ne compte pas ses
 * articles n'a aucune ligne de stock. C'est ce cas-là qui a fait échouer
 * CHAQUE commande pendant une journée entière, Stripe rejouant le webhook
 * toutes les minutes pour échouer à l'identique.
 */
export async function etagereDe(
  client: ClientStock,
  productId: string,
  pickupPointId: string | null,
): Promise<{ id: string; quantity: number; reserved: number } | null> {
  if (pickupPointId) {
    const duComptoir = await client.stock.findFirst({
      where: { productId, pickupPointId },
      select: { id: true, quantity: true, reserved: true },
    });
    if (duComptoir) return duComptoir;
  }
  return client.stock.findFirst({
    where: { productId, pickupPointId: null },
    select: { id: true, quantity: true, reserved: true },
  });
}

/**
 * Retient les articles d'un panier. Lève si UN SEUL manque.
 *
 * `tx` doit être une transaction : une ligne refusée doit annuler les
 * retenues déjà posées par cet appel.
 */
export async function retenirLeStock(
  tx: Prisma.TransactionClient,
  pickupPointId: string | null,
  lignes: readonly LigneARetenir[],
  nomDuProduit?: (productId: string) => string | undefined,
): Promise<void> {
  for (const ligne of lignes) {
    const etagere = await etagereDe(tx, ligne.productId, pickupPointId);
    // Produit sans suivi de stock : rien à retenir, et ce n'est pas un refus.
    if (!etagere) continue;

    /**
     * LA CONDITION QUI FAIT TOUT — et elle doit comparer DEUX COLONNES.
     *
     * Ma première version écrivait, en Prisma :
     *
     *     where: { id, quantity: { gte: etagere.reserved + ligne.quantity } }
     *
     * `etagere.reserved` est une valeur LUE juste avant. Cinq clients
     * simultanés lisaient tous `reserved = 0`, trouvaient tous
     * `quantity >= 0 + 1`, et incrémentaient tous les cinq — sur un stock de
     * trois. Mesuré : `reserved = 5`, disponible `-2`.
     *
     * C'est EXACTEMENT le travers qu'on corrige : une décision prise sur une
     * lecture n'empêche personne d'autre de lire la même chose. Le `WHERE` ne
     * protège que s'il compare la colonne À ELLE-MÊME, au moment de l'écriture.
     *
     * Prisma ne sait pas exprimer `quantity - reserved >= n` : son `where`
     * compare une colonne à une VALEUR. D'où le SQL brut — ce n'est pas une
     * préférence, c'est la seule forme qui tienne la promesse.
     */
    const retenu = await tx.$executeRaw`
      UPDATE "stock"
         SET "reserved" = "reserved" + ${ligne.quantity},
             "updated_at" = NOW()
       WHERE "id" = ${etagere.id}::uuid
         AND "quantity" - "reserved" >= ${ligne.quantity}
    `;

    if (retenu === 0) {
      // On relit pour DIRE ce qui reste. Le client doit pouvoir décider, pas
      // seulement apprendre qu'on refuse.
      const relu = await etagereDe(tx, ligne.productId, pickupPointId);
      const reste = relu ? disponible(relu) : 0;
      const nom = nomDuProduit?.(ligne.productId);
      throw new BadRequestException(
        `${nom ? `« ${nom} » : ` : ''}il n’en reste que ${reste}. ` +
          `Rien n’a été débité — ajuste ta commande.`,
      );
    }
  }
}

/**
 * Rend les articles retenus par un panier.
 *
 * NE LÈVE JAMAIS. On libère sur des chemins d'échec — un paiement refusé, un
 * panier périmé, un contenu modifié — et une libération qui échoue ne doit pas
 * transformer un échec propre en erreur serveur. L'écart se verrait au pire
 * comme quelques articles invendables jusqu'à correction, jamais comme une
 * commande perdue.
 */
export async function rendreLeStock(
  client: ClientStock,
  pickupPointId: string | null,
  lignes: readonly LigneARetenir[],
): Promise<void> {
  for (const ligne of lignes) {
    try {
      const etagere = await etagereDe(client, ligne.productId, pickupPointId);
      if (!etagere) continue;
      await client.stock.updateMany({
        // Jamais sous zéro : une double libération ne doit pas faire
        // apparaître du stock qui n'existe pas. La contrainte de la base le
        // refuserait, et on préfère ne pas l'atteindre.
        where: { id: etagere.id, reserved: { gte: ligne.quantity } },
        data: { reserved: { decrement: ligne.quantity } },
      });
    } catch {
      // Volontairement muet ici : l'appelant journalise avec son contexte,
      // qui est plus parlant qu'un message venant d'un helper.
    }
  }
}

/**
 * CONSOMME les articles retenus : ils quittent l'étagère pour de bon.
 *
 * `quantity` et `reserved` descendent ENSEMBLE, et c'est tout l'intérêt —
 * décrémenter l'un sans l'autre laisserait une retenue orpheline qui gèlerait
 * du stock pour toujours.
 *
 * Ne refuse rien : l'argent est encaissé quand ceci s'exécute, et la retenue
 * garantit déjà que les articles étaient là. Si une étagère a été corrigée à
 * la baisse entre-temps, on la borne à zéro et on sert la commande — c'est la
 * vérité du comptoir, et refuser ne rendrait pas l'argent.
 */
export async function consommerLeStock(
  tx: Prisma.TransactionClient,
  pickupPointId: string | null,
  lignes: readonly LigneARetenir[],
): Promise<void> {
  for (const ligne of lignes) {
    const etagere = await etagereDe(tx, ligne.productId, pickupPointId);
    if (!etagere) continue;

    /**
     * EN SQL, et pour la même raison que la retenue : l'arithmétique porte
     * sur les colonnes, pas sur une valeur lue avant.
     *
     * `quantity: etagere.quantity - n` écrit un nombre CALCULÉ à partir d'une
     * lecture. Deux commandes créées en même temps sur le même produit
     * liraient toutes deux la même étagère, et la seconde écriture écraserait
     * la première : un des deux décréments serait perdu, et l'étagère
     * annoncerait plus de stock qu'elle n'en a.
     *
     * `GREATEST(0, …)` borne sans refuser : l'argent est encaissé quand ceci
     * s'exécute. Si une opératrice a corrigé l'étagère à la baisse entre-temps,
     * on sert la commande et on constate — refuser ne rendrait pas l'argent.
     */
    await tx.$executeRaw`
      UPDATE "stock"
         SET "quantity" = GREATEST(0, "quantity" - ${ligne.quantity}),
             "reserved" = GREATEST(0, "reserved" - ${ligne.quantity}),
             -- L'étagère vidée quitte la carte : c'est la vérité du comptoir.
             "is_available" = CASE
               WHEN "quantity" - ${ligne.quantity} <= 0 THEN false
               ELSE "is_available"
             END,
             "updated_at" = NOW()
       WHERE "id" = ${etagere.id}::uuid
    `;
  }
}
