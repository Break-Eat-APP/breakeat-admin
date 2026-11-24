import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Le jeton d'une commande Flaix : identifiant public, lettres et chiffres. */
export const FORME_JETON = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * L'app a démarré la Live Activity d'une commande Flaix (24/11/2026). Même
 * forme que celle d'une commande BreakEat, le jeton Flaix à la place de
 * `orderId`. L'utilisateur vient du JWT, jamais du corps.
 */
export class RegisterLiveActivityFlaixDto {
  @IsString()
  @Matches(FORME_JETON, { message: 'jeton invalide' })
  jeton!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  activityId!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{32,200}$/, {
    message: 'pushToken doit être une chaîne hexadécimale de token APNs',
  })
  pushToken!: string;
}
