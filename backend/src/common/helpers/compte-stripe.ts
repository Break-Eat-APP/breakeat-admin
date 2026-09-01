import { StripeAccountStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * À QUI va l'argent d'une commande.
 *
 * Le compte Stripe appartient au CLUB : il s'inscrit une fois, et toutes ses
 * buvettes encaissent dessus. Demander quatre inscriptions à un club qui a
 * quatre comptoirs n'aurait aucun sens — quatre fois les mêmes coordonnées
 * bancaires, quatre tableaux de bord, une recette éparpillée.
 *
 * Une buvette ne porte son propre compte que lorsqu'elle est exploitée par un
 * TIERS — food-truck, traiteur. Le sien prime alors : sa recette ne doit pas
 * atterrir chez le club.
 *
 * C'est la seule fonction qui décide de cette priorité. Toute autre lecture
 * directe de `supplier.stripeAccountId` ferait diverger le paiement seul de
 * l'ardoise partagée, et l'argent d'une buvette de deux endroits différents.
 */
export interface CompteEncaisseur {
  accountId: string;
  /** Vrai quand c'est le compte propre de la buvette (exploitant tiers). */
  propreALaBuvette: boolean;
}

/** Ce qui manque pour encaisser, dit en français, prêt à afficher. */
export class CompteStripeIndisponible extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompteStripeIndisponible';
  }
}

const EXPLICATIONS: Record<string, string> = {
  PENDING: 'l’inscription Stripe n’est pas terminée — Stripe attend encore des informations',
  RESTRICTED: 'Stripe a restreint ce compte',
  REJECTED: 'Stripe a refusé ce compte',
  NOT_ONBOARDED: 'l’inscription Stripe n’a pas été commencée',
};

export async function resoudreCompteEncaisseur(
  prisma: PrismaService,
  supplierId: string,
): Promise<CompteEncaisseur> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      name: true,
      organizationId: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
    },
  });
  if (!supplier) {
    throw new CompteStripeIndisponible('Cette buvette n’existe plus.');
  }

  // Exploitant tiers : son compte prime.
  if (supplier.stripeAccountId) {
    if (supplier.stripeAccountStatus !== StripeAccountStatus.ACTIVE) {
      throw new CompteStripeIndisponible(
        `« ${supplier.name} » ne peut pas encaisser : ${
          EXPLICATIONS[supplier.stripeAccountStatus] ?? supplier.stripeAccountStatus
        }. Ouvre sa fiche et appuie sur « Vérifier l’état ».`,
      );
    }
    return { accountId: supplier.stripeAccountId, propreALaBuvette: true };
  }

  const club = await prisma.organization.findUnique({
    where: { id: supplier.organizationId },
    select: { name: true, stripeAccountId: true, stripeAccountStatus: true },
  });

  if (!club?.stripeAccountId) {
    throw new CompteStripeIndisponible(
      'Le club n’est pas encore relié à Stripe : aucune de ses buvettes ne peut ' +
        'encaisser. À faire une seule fois, dans le back-office → Réglages.',
    );
  }
  if (club.stripeAccountStatus !== StripeAccountStatus.ACTIVE) {
    throw new CompteStripeIndisponible(
      `Le club ne peut pas encore encaisser : ${
        EXPLICATIONS[club.stripeAccountStatus] ?? club.stripeAccountStatus
      }. Va dans le back-office → Réglages et appuie sur « Vérifier l’état ».`,
    );
  }

  return { accountId: club.stripeAccountId, propreALaBuvette: false };
}
