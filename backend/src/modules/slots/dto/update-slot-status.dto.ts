import { IsEnum } from 'class-validator';
import { SlotStatus } from '@prisma/client';

/**
 * Corps de PATCH /events/:eventId/slots/:id/status
 *
 * Volontairement limité au seul statut. Configurer un créneau (horaires,
 * capacité, libellé) passe par `PATCH /slots/:id` et reste réservé au
 * responsable ; l'ouvrir ou le fermer est une décision d'exploitation que
 * l'équipier prend depuis son poste.
 *
 * `FULL` reste accessible ici : une buvette peut vouloir marquer un créneau
 * complet sans le fermer, ce que le client lit différemment.
 */
export class UpdateSlotStatusDto {
  @IsEnum(SlotStatus, { message: 'Statut attendu : OPEN, FULL ou CLOSED' })
  status!: SlotStatus;
}
