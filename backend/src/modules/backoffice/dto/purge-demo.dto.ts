import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Corps de POST /backoffice/demo/purge
 *
 * `confirmation` doit valoir exactement la phrase annoncée par l'aperçu
 * (`PURGER LA DEMO`). Même raison que pour la remise à zéro : l'opération
 * efface des commandes sans retour possible, et recopier une phrase oblige à
 * lire ce qu'on s'apprête à faire.
 */
export class PurgeDemoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  confirmation!: string;
}
