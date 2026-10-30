import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * CE QUE LE CLIENT VEUT DANS SON PANIER — en absolu, pas en ajouts.
 *
 * `POST /carts/:id/items` AJOUTE : il incrémente la quantité d'un produit déjà
 * présent. C'est juste pour un bouton « + », et c'est un piège pour une
 * synchronisation. L'écran de paiement faisait, à chaque tentative :
 *
 *     POST /carts                     → réutilise le panier OUVERT existant
 *     POST /carts/:id/items  × N      → incrémente CHAQUE ligne
 *
 * Si la tentative échouait après l'ajout — Stripe, points de fidélité, réseau
 * — le panier restait ouvert et l'écran permettait de réessayer. La seconde
 * tentative renvoyait les mêmes quantités, et elles s'ADDITIONNAIENT. Deux
 * bières devenaient quatre, le client payait quatre, et son écran affichait
 * toujours deux.
 *
 * Une quantité ABSOLUE n'a pas ce défaut : renvoyer deux fois la même demande
 * donne le même panier. C'est la différence entre « ajoute deux bières » et
 * « j'en veux deux ».
 */
export class ArticleVouluDto {
  @IsUUID()
  productId!: string;

  /**
   * Combien le client en veut EN TOUT. Zéro n'est pas accepté : retirer un
   * article, c'est ne pas l'envoyer.
   */
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class RemplacerArticlesDto {
  /**
   * Le contenu voulu, en entier. Ce qui n'y figure pas est RETIRÉ du panier :
   * c'est tout l'intérêt, et c'est pourquoi la liste ne peut pas être vide —
   * vider un panier a sa propre route, et le faire par mégarde avec un corps
   * incomplet serait trop facile.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ArticleVouluDto)
  items!: ArticleVouluDto[];
}
