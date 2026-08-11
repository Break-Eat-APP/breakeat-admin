import { IsString, IsNotEmpty, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * Enregistrement d'une Live Activity démarrée par l'app.
 *
 * L'`userId` n'est JAMAIS accepté depuis le client : il vient du JWT. Le
 * serveur vérifie ensuite que la commande visée appartient bien à l'appelant.
 */
export class RegisterLiveActivityDto {
  @IsUUID()
  orderId!: string;

  /** Identifiant ActivityKit (opaque, généré par iOS). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  activityId!: string;

  /**
   * Token push de l'activité : chaîne hexadécimale fournie par ActivityKit.
   * Le format est contraint pour éviter qu'une valeur arbitraire ne parte vers
   * l'URL APNs.
   */
  @IsString()
  @Matches(/^[a-fA-F0-9]{32,200}$/, {
    message: 'pushToken doit être une chaîne hexadécimale de token APNs',
  })
  pushToken!: string;
}
