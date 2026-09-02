import { StripeAccountStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * À QUI va l'argent d'une commande : au compte Stripe DU CLUB.
 *
 * Un stade, un compte. Le club s'inscrit une fois dans « Encaissement », et
 * toutes ses buvettes encaissent dessus. Demander une inscription par comptoir
 * n'aurait aucun sens — quatre fois les mêmes coordonnées bancaires, quatre
 * tableaux de bord, une recette éparpillée.
 *
 * Un compte PAR BUVETTE a existé, pour le cas d'un exploitant extérieur
 * (food-truck, traiteur) encaissant lui-même. Il a été retiré : personne ne
 * l'utilisait, et il introduisait une seconde source de vérité — deux écrans
 * annonçaient un compte relié, sans que rien ne dise lequel recevait l'argent.
 * Les colonnes `Supplier.stripe*` restent en base, inertes, et le schéma le dit.
 * Le jour où un exploitant tiers se présentera, c'est ici que la règle revivra,
 * et nulle part ailleurs : toute autre lecture ferait diverger le paiement seul
 * de l'ardoise partagée.
 */
export interface CompteEncaisseur {
  accountId: string;
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
    select: { organizationId: true },
  });
  if (!supplier) {
    throw new CompteStripeIndisponible('Cette buvette n’existe plus.');
  }

  const club = await prisma.organization.findUnique({
    where: { id: supplier.organizationId },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  });

  if (!club?.stripeAccountId) {
    throw new CompteStripeIndisponible(
      'Le club n’est pas encore relié à Stripe : aucune de ses buvettes ne peut ' +
        'encaisser. À faire une seule fois, dans le back-office → Encaissement.',
    );
  }
  if (club.stripeAccountStatus !== StripeAccountStatus.ACTIVE) {
    throw new CompteStripeIndisponible(
      `Le club ne peut pas encore encaisser : ${
        EXPLICATIONS[club.stripeAccountStatus] ?? club.stripeAccountStatus
      }. Va dans le back-office → Encaissement et appuie sur « Vérifier l’état ».`,
    );
  }

  return { accountId: club.stripeAccountId };
}
