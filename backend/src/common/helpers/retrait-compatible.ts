import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SlotStatus } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

/**
 * OÙ ET QUAND UNE COMMANDE PEUT ÊTRE RETIRÉE — la même règle pour tous.
 *
 * Un comptoir et un créneau appartiennent à un lieu, souvent à un événement, et
 * parfois à une buvette précise. Accepter un identifiant quelconque, c'est
 * envoyer un client devant un stand qui n'attend rien — ou, pire, rattacher sa
 * commande au comptoir d'un autre club.
 *
 * Le panier vérifiait déjà tout cela pour les choix du CLIENT. Le webhook Flaix,
 * lui, écrivait `slotId` et `pickupPointId` directement sur la commande : la
 * signature HMAC prouve que le message vient bien de Flaix, elle ne dit rien de
 * la cohérence de son contenu. Un identifiant erroné — une erreur de
 * configuration suffit — déplaçait silencieusement le retrait d'un client.
 *
 * Les deux contrôles vivent ici pour qu'il n'y en ait qu'un à corriger.
 */

/** Le comptoir appartient-il bien à ce lieu, cet événement, cette buvette ? */
export async function assertPointDeRetraitCompatible(
  prisma: PrismaService,
  pickupPointId: string,
  commande: { eventId: string; supplierId: string; venueId: string },
): Promise<void> {
  const pp = await prisma.pickupPoint.findUnique({ where: { id: pickupPointId } });
  if (!pp) throw new NotFoundException('Pickup point not found');

  if (pp.venueId !== commande.venueId) {
    throw new BadRequestException('Pickup point is in a different venue than the event');
  }
  // `null` = le comptoir sert tout l'événement, ou toutes les buvettes du lieu.
  if (pp.eventId !== null && pp.eventId !== commande.eventId) {
    throw new BadRequestException('Pickup point is scoped to a different event');
  }
  if (pp.supplierId !== null && pp.supplierId !== commande.supplierId) {
    throw new BadRequestException('Pickup point is scoped to a different supplier');
  }
}

/**
 * Le créneau appartient-il bien à cet événement, et à cette buvette ?
 *
 * @param exigerOuvert vrai pour un CHOIX (le client ne réserve pas une place
 *   dans un créneau fermé), faux pour un RATTACHEMENT décidé par le comptoir —
 *   qui a le droit de poser une commande sur un créneau qu'il vient de fermer.
 */
export async function assertCreneauCompatible(
  prisma: PrismaService,
  slotId: string,
  commande: { eventId: string; supplierId: string },
  exigerOuvert = false,
): Promise<void> {
  const creneau = await prisma.slot.findUnique({
    where: { id: slotId },
    select: { eventId: true, status: true, supplierId: true },
  });
  if (!creneau || creneau.eventId !== commande.eventId) {
    throw new BadRequestException('Ce créneau n’appartient pas à cet événement.');
  }
  if (exigerOuvert && creneau.status !== SlotStatus.OPEN) {
    throw new BadRequestException('Ce créneau vient d’être fermé. Choisissez-en un autre.');
  }
  // Un créneau rattaché à une buvette ne vaut que pour elle : sans ce contrôle,
  // on réserverait « Mi-temps » au comptoir Sud pour une commande passée au
  // Nord, et le client se présenterait devant un stand qui n'attend rien.
  if (creneau.supplierId && creneau.supplierId !== commande.supplierId) {
    throw new BadRequestException('Ce créneau appartient à une autre buvette.');
  }
}
