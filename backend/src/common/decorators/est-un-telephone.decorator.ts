import { registerDecorator, type ValidationOptions } from 'class-validator';
import { estUnTelephonePlausible } from '../helpers/telephone';

/**
 * LA RÈGLE DU TÉLÉPHONE, POSÉE UNE SEULE FOIS.
 *
 * Les deux DTO qui acceptent un numéro — inscription et profil — portaient
 * chacun leur expression régulière. Elles étaient censées être identiques ; le
 * commentaire de l'une disait d'ailleurs « même règle que l'inscription ». Deux
 * copies d'une même règle finissent toujours par diverger, et celle-ci avait
 * déjà un trou commun : la classe de caractères acceptait la ponctuation
 * seule, donc neuf tirets.
 *
 * Ce décorateur délègue à `normaliserTelephone`, qui est aussi ce que le
 * service appelle pour ÉCRIRE la valeur. Validation et normalisation ne
 * peuvent donc plus se contredire : refuser et accepter sont le même test.
 */
export function EstUnTelephone(options?: ValidationOptions) {
  return function (objet: object, propriete: string): void {
    registerDecorator({
      name: 'estUnTelephone',
      target: objet.constructor,
      propertyName: propriete,
      options,
      validator: {
        validate(valeur: unknown): boolean {
          // UN CHAMP VIDE N'EST PAS UN NUMÉRO INVALIDE. Le profil s'en sert
          // pour EFFACER un numéro qu'un client ne veut plus voir partir chez
          // un partenaire ; refuser ici lui retirerait ce moyen.
          //
          // L'absence, elle, est l'affaire de `@IsOptional`.
          if (valeur === '') return true;
          if (typeof valeur !== 'string') return false;
          return estUnTelephonePlausible(valeur);
        },
        defaultMessage(): string {
          return 'Numéro de téléphone invalide';
        },
      },
    });
  };
}
