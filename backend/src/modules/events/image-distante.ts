/**
 * UNE IMAGE HÉBERGÉE AILLEURS — le blason d'un adversaire, l'affiche d'un
 * concert. Les règles sont les mêmes, et elles ne vivent qu'ici.
 *
 * Ce fichier est né le 01/11/2026, quand l'affiche d'événement est arrivée à
 * côté du blason. Les deux adresses demandent exactement les mêmes garde-fous,
 * et `adversaire.ts` les portait déjà : les recopier aurait créé deux
 * exemplaires d'une règle de sécurité, c'est-à-dire la certitude qu'un jour on
 * en corrigerait un seul.
 *
 * ── CE QUI SE VÉRIFIE, ET POURQUOI ────────────────────────────────────
 *
 * Une image n'est pas un lien de commande : on n'y paie rien, on n'y saisit
 * aucun mot de passe. La liste blanche stricte de `lien-flaix.ts` n'a donc pas
 * lieu d'être — un club héberge son image où il veut.
 *
 * Mais deux garde-fous restent indispensables :
 *
 *  · HTTPS SEULEMENT. iOS refuse le http simple (App Transport Security) : une
 *    image en http ne s'afficherait sur AUCUN iPhone, et le club chercherait la
 *    panne du côté de son fichier. Mieux vaut refuser à la saisie, où le
 *    message est lisible, que laisser un trou sur un téléphone ;
 *  · PAS D'IDENTIFIANTS dans l'adresse. `https://moi:secret@…` s'afficherait en
 *    clair dans le dashboard de tout le club, et partirait dans la réponse
 *    PUBLIQUE de l'app.
 *
 * On ne vérifie PAS que l'adresse rend bien une image : il faudrait la
 * télécharger depuis le serveur, sur une adresse fournie par l'utilisateur —
 * c'est une requête sortante vers n'importe où, et on ne l'ouvre pas pour
 * valider un logo. L'admin, lui, affiche un aperçu : c'est le NAVIGATEUR du
 * club qui va chercher l'image, et une adresse qui ne rend rien se voit là.
 */

/** Une adresse d'image raisonnable n'a pas besoin d'être plus longue. */
export const LONGUEUR_MAX_IMAGE = 500;

export type VerdictImage = { valide: true; url: string } | { valide: false; raison: string };

/**
 * COMMENT L'IMAGE SE NOMME DANS LES MESSAGES D'ERREUR.
 *
 * Deux formes, parce que le français en demande deux — et un message de refus
 * qui parle de « l'image » là où l'écran dit « affiche » oblige le club à
 * deviner quel champ il doit corriger. À trois champs sur la même ligne, c'est
 * exactement ce qu'il ne faut pas lui demander.
 */
export interface NomsDeLImage {
  /** Ce qui suit « L'adresse … » : « du logo », « de l'affiche ». */
  complement: string;
  /** Avec son article : « un logo », « une affiche ». */
  sujet: string;
}

/** L'adresse, normalisée — ou la raison du refus, en clair. */
export function verifierImageDistante(saisie: string, noms: NomsDeLImage): VerdictImage {
  const brut = saisie.trim();
  if (!brut) return { valide: false, raison: `L’adresse ${noms.complement} est vide.` };
  if (brut.length > LONGUEUR_MAX_IMAGE) {
    return {
      valide: false,
      raison: `L’adresse ${noms.complement} dépasse ${LONGUEUR_MAX_IMAGE} caractères.`,
    };
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
      raison:
        `L’adresse ${noms.complement} doit commencer par https:// — ` +
        `${noms.sujet} en http ne s’affiche pas sur iPhone.`,
    };
  }

  if (url.username || url.password) {
    return {
      valide: false,
      raison: `L’adresse ${noms.complement} ne doit pas contenir d’identifiant ni de mot de passe.`,
    };
  }

  return { valide: true, url: url.toString() };
}

/**
 * L'AFFICHE D'UN ÉVÉNEMENT — le flyer d'un concert, en portrait.
 *
 * Elle vit ICI plutôt que dans un fichier `affiche.ts` à elle : il n'y aurait
 * rien d'autre dedans. Le blason, lui, garde `adversaire.ts`, où il voisine
 * avec le NOM de l'adversaire — les deux se saisissent et se nettoient
 * ensemble. Une affiche n'a pas de nom qui l'accompagne : le titre est dans
 * l'image, et le nom de l'événement est déjà en base.
 *
 * Aucune vérification des PROPORTIONS. On ne sait pas les lire sans télécharger
 * l'image, et même en les lisant on refuserait un flyer carré — qui s'affiche
 * très bien dans un cadre portrait, légèrement rogné. Un refus pour une raison
 * que le club ne peut pas corriger est pire qu'un cadrage imparfait.
 */
export function verifierAffiche(saisie: string): VerdictImage {
  return verifierImageDistante(saisie, { complement: 'de l’affiche', sujet: 'une affiche' });
}
