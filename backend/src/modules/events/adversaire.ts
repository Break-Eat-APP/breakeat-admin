import { verifierImageDistante, type VerdictImage } from './image-distante';

/**
 * L'ADVERSAIRE D'UN MATCH — son nom, et son blason.
 *
 * Saisis par le club au même endroit que le lien de commande : une rencontre
 * se renseigne d'un geste. Le calendrier de l'app met ce blason à la place du
 * numéro du jour — c'est ce qui le rend lisible d'un coup d'œil.
 *
 * LES RÈGLES DE L'ADRESSE SONT DANS `image-distante.ts`, et plus ici : depuis
 * le 01/11/2026 l'affiche d'un concert les partage mot pour mot. Deux
 * exemplaires d'une règle de sécurité, c'est la certitude qu'un jour on en
 * corrigerait un seul — le fichier voisin dit lesquelles, et pourquoi.
 */

/**
 * Le nom tient en une ligne de carte : « Union Bordeaux Bègles » fait 21
 * caractères. Au-delà de 60, ce n'est plus un nom d'équipe.
 */
export const LONGUEUR_MAX_NOM_ADVERSAIRE = 60;

/** L'adresse du blason, normalisée — ou la raison du refus, en clair. */
export function verifierLogoAdversaire(saisie: string): VerdictImage {
  return verifierImageDistante(saisie, { complement: 'du logo', sujet: 'un logo' });
}

/**
 * Le nom de l'adversaire, nettoyé — `null` quand il n'y a rien à garder.
 *
 * Un nom fait d'espaces n'est pas un nom : enregistré tel quel, il ferait
 * écrire une ligne vide sous le blason, là où le nom de l'événement aurait
 * pris le relais.
 */
export function nettoyerNomAdversaire(saisie: string | null | undefined): string | null {
  const net = saisie?.trim();
  return net ? net.slice(0, LONGUEUR_MAX_NOM_ADVERSAIRE) : null;
}
