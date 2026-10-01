import { OrderStatus, PaymentStatus, type Prisma } from '@prisma/client';

/**
 * LES COMMANDES QUI COMPTENT DANS LE CHIFFRE D'AFFAIRES : payées, non annulées.
 *
 * Une seule définition, parce que plusieurs écrans montrent le même chiffre à
 * des gens différents. Les statistiques du club, le fichier client et la
 * fréquentation écrivaient la règle à la main, chacun de son côté ; le
 * back-office, lui, agrégeait TOUTES les commandes `SUCCEEDED`, annulées
 * comprises. Le même périmètre affichait donc deux chiffres d'affaires
 * différents selon la page — et rien, à l'écran, ne disait lequel croire.
 *
 * Pourquoi exclure les annulées : une commande annulée a bien été payée, mais
 * elle n'a rien vendu. La compter dans le chiffre d'affaires ferait payer au
 * club une commission sur une vente qui n'a pas eu lieu.
 *
 * Une FONCTION plutôt qu'une constante : chaque appelant reçoit son propre
 * objet, qu'il complète (club, lieu, événement, période) sans risquer de
 * modifier le périmètre des autres.
 *
 * `status` et `paymentStatus` sont RETIRÉS de ce que l'appelant peut passer —
 * le compilateur refuse de les écraser. C'est la seule façon de garantir que la
 * règle survive : un commentaire se contourne par distraction, une signature
 * non.
 *
 * @example
 * this.prisma.order.aggregate({ where: perimetreCa({ organizationId: orgId }) })
 */
export function perimetreCa(
  en: Omit<Prisma.OrderWhereInput, 'paymentStatus' | 'status'> = {},
): Prisma.OrderWhereInput {
  return {
    paymentStatus: PaymentStatus.SUCCEEDED,
    status: { not: OrderStatus.CANCELLED },
    ...en,
  };
}

/**
 * La même règle, en SQL, pour les agrégats que Prisma ne sait pas exprimer
 * (somme des lignes de commande par taux de TVA).
 *
 * `o` = l'alias de la table `orders` dans la requête. Écrite ici pour que les
 * deux formulations vivent côte à côte : les séparer, c'est en corriger une
 * seule le jour où la règle change.
 */
export const PERIMETRE_CA_SQL = `o.payment_status::text = 'SUCCEEDED' AND o.status::text <> 'CANCELLED'`;
