import { IsInt, Min } from 'class-validator';

/**
 * PHASE 20 — points de fidélité que le client choisit d'utiliser sur son panier.
 * `0` retire la remise. Le plafonnement (solde, montant du panier) est appliqué
 * côté service : le client ne peut pas se sur-créditer via ce DTO.
 */
export class RedeemPointsDto {
  @IsInt({ message: 'points doit être un entier' })
  @Min(0, { message: 'points ne peut pas être négatif' })
  points!: number;
}
