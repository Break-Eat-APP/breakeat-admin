import { IsOptional, IsUUID } from 'class-validator';

/**
 * Le créneau de retrait choisi sur un panier.
 *
 * `slotId` absent ou nul efface le choix : un client peut renoncer à une heure
 * précise et revenir au retrait « dès que prêt ». Un DTO qui l'exigerait
 * obligerait à inventer une route de suppression pour un geste anodin.
 */
export class ChoisirCreneauDto {
  @IsUUID()
  @IsOptional()
  slotId?: string | null;
}
