import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { EstUnTelephone } from '../../../common/decorators/est-un-telephone.decorator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password!: string;

  /**
   * Prénom et nom, SÉPARÉS.
   *
   * Un club qui reçoit son fichier client a besoin des deux distinctement pour
   * sa base : découper un champ unique n'est jamais fiable (« Jean-Pierre De La
   * Tour » n'a pas de règle).
   *
   * Facultatifs au niveau du serveur, et c'est voulu : les inscriptions par
   * Apple ou Google passent par une autre route et ne les fournissent pas
   * toujours. C'est le formulaire de l'application qui les réclame.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  /**
   * Ce qu'on affiche. Reste accepté pour ne pas casser les appels existants ;
   * quand prénom et nom sont fournis, le serveur le recompose à partir d'eux.
   */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  displayName?: string;

  /**
   * LE NUMÉRO, VALIDÉ PAR LA MÊME RÈGLE QUI L'ÉCRIT.
   *
   * L'expression précédente — `/^\+?[\d\s\-().]{7,20}$/` — acceptait la
   * ponctuation seule : « --------- » était un numéro valide. Et sa borne
   * basse (7) ne correspondait pas à celle du formulaire mobile (9), donc un
   * numéro refusé par l'un passait chez l'autre.
   *
   * `EstUnTelephone` délègue à `normaliserTelephone`, que le service appelle
   * aussi pour STOCKER la valeur. Accepter et normaliser sont désormais le
   * même test.
   */
  @IsOptional()
  @IsString()
  @EstUnTelephone()
  phone?: string;

  /**
   * LA VERSION DES CGU QUE LA PERSONNE A LUE.
   *
   * L'écran impose une case décochée au départ et refuse de continuer sans
   * elle — mais la réponse ne quittait pas le téléphone. On affirmait, dans les
   * CGU elles-mêmes, recueillir l'acceptation à l'inscription, sans pouvoir
   * montrer ni la date ni le texte accepté.
   *
   * On reçoit la VERSION, pas un booléen : les conditions changent, et
   * « accepté » ne dit pas à quoi. La date, elle, est posée par le serveur —
   * une date fournie par le client ne prouverait rien.
   *
   * FACULTATIF, et ce n'est pas un oubli. Le rendre obligatoire casserait deux
   * parcours existants : les builds déjà installées, qui ne l'envoient pas, et
   * les inscriptions par Apple ou Google, qui passent par une autre route. Un
   * compte refusé à l'inscription est une vente perdue ; une preuve manquante
   * se voit et se corrige.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cguVersion?: string;
}
