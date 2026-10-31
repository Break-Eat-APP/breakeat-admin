/**
 * LE NUMÉRO DE TÉLÉPHONE, RAMENÉ À UNE SEULE FORME.
 *
 * Ce qui était accepté avant, et pourquoi c'était un problème :
 *
 *   • la règle tenait en une expression — `/^\+?[\d\s\-().]{7,20}$/` — dont la
 *     classe de caractères accepte la PONCTUATION SEULE. « --------- » passait.
 *     Neuf tirets étaient un numéro de téléphone valide pour le serveur ;
 *   • l'application exigeait 9 caractères, le serveur 7. Un numéro refusé par
 *     l'un pouvait être accepté par l'autre, et le client n'avait aucun moyen
 *     de comprendre pourquoi ;
 *   • la valeur était stockée après un simple `trim()`. « 06 12 34 56 78 »,
 *     « +33 6 12 34 56 78 » et « 0033612345678 » sont LE MÊME numéro et
 *     donnaient trois valeurs différentes en base. Le comptoir ne pouvait pas
 *     rapprocher un client de lui-même, et le lien Flaix recevait une forme
 *     qui changeait d'une inscription à l'autre.
 *
 * ── UNE SEULE RÈGLE, ÉCRITE DEUX FOIS ──────────────────────────
 *
 * La même existe dans `backend/src/common/helpers/telephone.ts`, à l'identique, et
 * les deux portent la MÊME TABLE DE CAS dans leurs tests. C'est une copie
 * assumée : un paquet partagé entre le serveur et l'app ajouterait un lien
 * d'espace de travail que Metro doit résoudre, et c'est précisément ce genre
 * d'ajout qui a déjà cassé des builds EAS ici. Quelques dizaines de lignes
 * dupliquées coûtent moins cher qu'un build mobile qui ne part pas.
 *
 * Si l'une des deux change, l'autre doit changer. La table de cas commune est
 * là pour que l'oubli se voie.
 *
 * ── CE QUE ÇA NE FAIT PAS ──────────────────────────────────────
 *
 * Ça ne VÉRIFIE PAS que le numéro existe, ni qu'il appartient à la personne.
 * Seul un code envoyé par SMS le prouverait, et ce parcours n'existe pas. On
 * valide une FORME, et l'application le dit comme tel : « Numéro à vérifier ».
 *
 * Ça ne connaît qu'UN plan de numérotation, le français. Un numéro étranger
 * donné en forme internationale (`+32…`) est accepté sur sa seule longueur,
 * sans contrôle de l'opérateur ni de la tranche. Une vraie bibliothèque de
 * numérotation ferait mieux ; elle n'est pas ici, et cette limite écrite noir
 * sur blanc vaut mieux qu'un contrôle qu'on croirait complet.
 *
 * ── PAS D'UNICITÉ, ET C'EST VOULU ──────────────────────────────
 *
 * Le numéro n'est pas unique en base, et ne doit pas le devenir tant qu'il
 * n'est pas vérifié. Deux raisons :
 *
 *   • un foyer partage un fixe, deux parents partagent un portable — le second
 *     inscrit serait refusé sans comprendre ;
 *   • un champ NON VÉRIFIÉ et unique se retourne en arme : il suffit de
 *     s'inscrire avec le numéro de quelqu'un d'autre pour l'empêcher, lui, de
 *     s'inscrire un jour.
 *
 * L'identification d'un client se fait par son compte. Le numéro sert au
 * comptoir à joindre quelqu'un qui ne vient pas chercher sa commande.
 */

/** Longueur maximale d'un numéro E.164, indicatif compris. */
const MAX_CHIFFRES_E164 = 15;
/** En-deçà, aucun plan de numérotation national ne tient. */
const MIN_CHIFFRES_E164 = 8;

/** L'indicatif supposé quand le numéro est donné en forme nationale. */
export const INDICATIF_DEFAUT = '33';

/** Un numéro français : l'indicatif, puis neuf chiffres d'abonné. */
const CHIFFRES_ABONNE_FR = 9;

/**
 * Les séparateurs qu'on retire. Les deux derniers sont des espaces INSÉCABLES
 * (U+00A0, U+202F) : un clavier français en insère sans que personne le voie,
 * et ils faisaient échouer une comparaison de chaînes sans laisser de trace
 * lisible dans un journal.
 */
const SEPARATEURS = /[\s.\-()  ]/g;

/**
 * La partie française, une fois l'indicatif retiré.
 *
 * Accepte le zéro national de trop — « +33 06 12 … » — parce que c'est la
 * faute de saisie la plus courante et qu'elle est SANS AMBIGUÏTÉ : aucune
 * tranche française ne commence par zéro. Refuser aurait été défendable ;
 * refuser SANS LE DIRE, comme le faisait l'ancienne règle en acceptant tout,
 * ne l'était pas.
 */
function abonneFrancais(chiffres: string): string | null {
  const brut = chiffres.slice(INDICATIF_DEFAUT.length);
  const net = brut.length === CHIFFRES_ABONNE_FR + 1 && brut.startsWith('0') ? brut.slice(1) : brut;
  if (net.length !== CHIFFRES_ABONNE_FR || net.startsWith('0')) return null;
  return net;
}

/**
 * Ramène un numéro à sa forme E.164 (`+33612345678`), ou rend `null` si la
 * saisie ne peut pas en être un.
 *
 * `null` est la réponse pour TOUT ce qui ne tient pas : chaîne vide, ponctuation
 * seule, lettres, numéro trop court ou trop long. L'appelant décide si c'est un
 * refus (à l'inscription) ou un champ laissé vide (dans le profil).
 */
export function normaliserTelephone(brut: string | null | undefined): string | null {
  if (!brut) return null;

  const compact = brut.replace(SEPARATEURS, '');
  if (compact === '') return null;

  // « 0033… » est la forme internationale composée depuis un poste français.
  // Elle désigne la même chose que « +33… », et doit finir au même endroit.
  const avecPlus = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;

  const international = avecPlus.startsWith('+');
  const chiffres = international ? avecPlus.slice(1) : avecPlus;

  // UN NUMÉRO EST FAIT DE CHIFFRES. C'est ce contrôle qui manquait : la classe
  // de caractères de l'ancienne expression acceptait la ponctuation seule.
  if (!/^\d+$/.test(chiffres)) return null;

  if (international) {
    // AUCUN INDICATIF PAYS NE COMMENCE PAR ZÉRO. Sans ce refus, dix zéros
    // devenaient « +00000000 » — huit chiffres, donc assez longs pour passer.
    if (chiffres.startsWith('0')) return null;

    // Le pays par défaut est le seul dont on connaisse le plan. On l'applique.
    if (chiffres.startsWith(INDICATIF_DEFAUT)) {
      const abonne = abonneFrancais(chiffres);
      return abonne ? `+${INDICATIF_DEFAUT}${abonne}` : null;
    }

    if (chiffres.length < MIN_CHIFFRES_E164 || chiffres.length > MAX_CHIFFRES_E164) return null;
    return `+${chiffres}`;
  }

  // Forme nationale française : dix chiffres, un zéro de départ qu'on remplace
  // par l'indicatif.
  if (chiffres.length === CHIFFRES_ABONNE_FR + 1 && chiffres.startsWith('0')) {
    const abonne = chiffres.slice(1);
    return abonne.startsWith('0') ? null : `+${INDICATIF_DEFAUT}${abonne}`;
  }

  // Neuf chiffres sans le zéro : ce que tape quelqu'un qui pense déjà en
  // international (« 612345678 »).
  //
  // ON SUPPOSE LA FRANCE, et c'est une supposition, pas une déduction : le même
  // numéro à neuf chiffres existe en Belgique. Tant que le formulaire n'offre
  // pas de choix de pays, c'est le défaut le moins faux pour un service de
  // buvettes françaises — et quiconque appelle d'ailleurs a la forme `+32…`
  // pour être compris sans ambiguïté.
  if (chiffres.length === CHIFFRES_ABONNE_FR && !chiffres.startsWith('0')) {
    return `+${INDICATIF_DEFAUT}${chiffres}`;
  }

  return null;
}

/** Vrai si la saisie peut devenir un numéro E.164. */
export function estUnTelephonePlausible(brut: string | null | undefined): boolean {
  return normaliserTelephone(brut) !== null;
}

/**
 * Le numéro tel qu'on le MONTRE à un client français : « 06 12 34 56 78 ».
 *
 * On stocke en E.164 et on affiche en national — un « +33 » devant un numéro
 * qu'on lit au comptoir n'aide personne, et le client ne reconnaît pas son
 * propre numéro sous cette forme.
 *
 * Tout ce qui n'est pas français ressort tel quel : on ne sait pas grouper les
 * chiffres d'un plan qu'on ne connaît pas, et un découpage inventé se lirait
 * comme une erreur de saisie.
 */
export function afficherTelephone(e164: string | null | undefined): string {
  if (!e164) return '';
  const prefixe = `+${INDICATIF_DEFAUT}`;
  if (!e164.startsWith(prefixe) || e164.length !== prefixe.length + CHIFFRES_ABONNE_FR) return e164;
  const national = `0${e164.slice(prefixe.length)}`;
  return national.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}
