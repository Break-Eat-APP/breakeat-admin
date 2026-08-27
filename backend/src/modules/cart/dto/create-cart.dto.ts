import { IsUUID, IsOptional, IsString, Length } from 'class-validator';

export class CreateCartDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  supplierId!: string;

  /** Optional at cart creation, but required before checkout. */
  @IsUUID()
  @IsOptional()
  pickupPointId?: string;

  /**
   * PHASE 24 — code d'invitation, quand le client rejoint la commande d'un ami.
   *
   * Un code invalide, expire ou emis pour une autre buvette est IGNORE : on
   * commande alors seul. Refuser le panier punirait le client d'une erreur qui
   * n'est pas la sienne, au moment ou il a faim.
   */
  @IsString()
  @IsOptional()
  @Length(4, 12)
  orderGroupCode?: string;
}
