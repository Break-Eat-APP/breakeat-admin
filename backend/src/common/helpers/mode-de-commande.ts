import { fenetreDeCommande } from './fenetre-commande';
import type { EvenementCommandable, ReglageOuverture } from './fenetre-commande';

/**
 * PAR OÙ PASSE LA COMMANDE D'UN LIEU — une seule règle, pour tout le monde.
 *
 * Elle était écrite à TROIS endroits, et les trois ne disaient pas la même
 * chose :
 *
 *   · le calendrier marquait commandable tout événement portant un lien
 *     ouvert, et rien d'autre ;
 *   · le panier refusait dès qu'UN événement du lieu portait un lien, même
 *     un match joué il y a six mois ;
 *   · l'application, elle, prévoyait un repli Break Eat pour un lieu basculé
 *     qui n'a pas encore de lien exploitable.
 *
 * Deux conséquences, et les deux tombent sur un club en pleine configuration.
 * Un lieu basculé sans aucun lien n'avait PLUS AUCUN BOUTON — ni Flaix, ni
 * Break Eat : le supporter arrivait, et ne pouvait rien commander. Et une
 * vieille adresse laissée sur un match terminé suffisait à faire refuser un
 * panier Break Eat, alors qu'aucune rencontre du moment n'était joignable.
 *
 * ── LES TROIS ÉTATS, ET RIEN D'AUTRE ─────────────────────────────────
 *
 *   `flaix`      une rencontre est ouverte chez Flaix MAINTENANT. C'est elle
 *                qui vend : Break Eat ne tient ni carte ni prix.
 *   `ferme`      le lieu est passé à Flaix et sa commande ouvre PLUS TARD.
 *                Fermé — et surtout pas rabattu sur le parcours Break Eat,
 *                qui vendrait des produits que le club ne tient plus.
 *   `break-eat`  tout le reste, y compris un lieu basculé dont aucun lien
 *                n'est exploitable. C'est le repli : on ne coupe pas la vente
 *                d'un club qui n'a pas fini sa bascule.
 *
 * Le miroir exact de `cheminDeCommande` côté mobile. Les deux doivent répondre
 * la même chose : écrites séparément, elles ont déjà divergé le 10/10 — un
 * lieu s'annonçait « Ouvert » et refusait au doigt.
 */
export type ModeDeCommande = 'flaix' | 'ferme' | 'break-eat';

export function modeDeCommande(
  lieu: { flaixEnabled: boolean },
  evenements: readonly EvenementCommandable[],
  maintenant: Date,
  reglage: ReglageOuverture,
): ModeDeCommande {
  if (!lieu.flaixEnabled) return 'break-eat';

  const fenetre = fenetreDeCommande(evenements, maintenant, reglage);
  if (fenetre.etat === 'ouvert') return 'flaix';
  // « Bientôt » : une ouverture est RÉELLEMENT prévue — un match à venir porte
  // son lien. Le lieu est donc bien passé à Flaix, et il est fermé en
  // attendant. Sans cette distinction, un stade dont le match est dans trois
  // heures retomberait sur le parcours Break Eat, et vendrait une carte que
  // le club ne tient plus.
  if (fenetre.etat === 'bientot') return 'ferme';

  // Basculé, mais rien d'exploitable : ni lien ouvert, ni ouverture prévue.
  // Le club n'a pas fini sa configuration, ou ses liens sont tous périmés. On
  // lui laisse sa vente.
  return 'break-eat';
}
