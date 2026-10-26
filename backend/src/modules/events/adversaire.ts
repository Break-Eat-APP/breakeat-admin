/**
 * L'ADVERSAIRE D'UN MATCH — son nom, et son blason.
 *
 * Saisis par le club au même endroit que le lien de commande : une rencontre
 * se renseigne d'un geste. Le calendrier de l'app met ce blason à la place du
 * numéro du jour — c'est ce qui le rend lisible d'un coup d'œil.
 *
 * ── CE QUI SE VÉRIFIE ICI, ET POURQUOI ────────────────────────────────
 *
 * Le blason n'est pas un lien de commande : on n'y paie rien, on n'y saisit
 * aucun mot de passe. La liste blanche stricte de `lien-flaix.ts` n'a donc
 * pas lieu d'être — un club héberge son image où il veut.
 *
 * Mais deux garde-fous restent indispensables :
 *
 *  · HTTPS SEULEMENT. iOS refuse le http simple (App Transport Security) : un
 *    logo en http ne s'afficherait sur AUCUN iPhone, et le club chercherait
 *    la panne du côté de son image. Mieux vaut refuser à la saisie, où le
 *    message est lisible, que laisser un trou sur un téléphone ;
 *  · PAS D'IDENTIFIANTS dans l'adresse. `https://moi:secret@…` s'afficherait
 *    en clair dans le dashboard de tout le club, et partirait dans la réponse
 *    PUBLIQUE de l'app.
 *
 * On ne vérifie PAS que l'adresse rend bien une image : il faudrait la
 * télécharger depuis le serveur, sur une adresse fournie par l'utilisateur —
 * c'est une requête sortante vers n'importe où, et on ne l'ouvre pas pour
 * valider un logo.
 */

/** Une adresse d'image raisonnable n'a pas besoin d'être plus longue. */
export const LONGUEUR_MAX_LOGO = 500;

/**
 * Le nom tient en une ligne de carte : « Union Bordeaux Bègles » fait 21
 * caractères. Au-delà de 60, ce n'est plus un nom d'équipe.
 */
export const LONGUEUR_MAX_NOM_ADVERSAIRE = 60;

export type VerdictLogoAdversaire =
  | { valide: true; url: string }
  | { valide: false; raison: string };

/** L'adresse du blason, normalisée — ou la raison du refus, en clair. */
export function verifierLogoAdversaire(saisie: string): VerdictLogoAdversaire {
  const brut = saisie.trim();
  if (!brut) return { valide: false, raison: 'L’adresse du logo est vide.' };
  if (brut.length > LONGUEUR_MAX_LOGO) {
    return { valide: false, raison: `L’adresse du logo dépasse ${LONGUEUR_MAX_LOGO} caractères.` };
  }

  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return { valide: false, raison: 'Ce n’est pas une adresse web valide.' };
  }

  if (url.protocol !== 'https:') {
    return {
      valide: false,
      raison: 'L’adresse du logo doit commencer par https:// — un logo en http ne s’affiche pas sur iPhone.',
    };
  }

  if (url.username || url.password) {
    return {
      valide: false,
      raison: 'L’adresse du logo ne doit pas contenir d’identifiant ni de mot de passe.',
    };
  }

  return { valide: true, url: url.toString() };
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
