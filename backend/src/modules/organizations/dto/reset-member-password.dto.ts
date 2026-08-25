import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Corps de POST /organizations/:id/members/:memberId/reset-password
 *
 * Le mot de passe est fourni par l'appelant, et non généré ici : c'est ce qui
 * permet à l'interface de l'AFFICHER une fois, comme pour une invitation. Le
 * générer côté serveur obligerait à le renvoyer dans la réponse, donc à le
 * faire transiter par les journaux en cas de débogage.
 *
 * Obligatoire, contrairement au `temporaryPassword` de l'invitation : ici il
 * n'existe aucun repli sensé — on redéfinit un mot de passe ou on ne fait rien.
 */
export class ResetMemberPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(200)
  newPassword!: string;
}
