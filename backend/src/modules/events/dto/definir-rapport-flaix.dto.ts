import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Le lien du rapport Flaix d'un événement. `null` ou vide : on le retire.
 *
 * Seule la forme est vérifiée ici ; le domaine et le reste le sont par
 * `verifierLienFlaix`, qui explique POURQUOI un lien est refusé.
 */
export class DefinirRapportFlaixDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string | null;
}
