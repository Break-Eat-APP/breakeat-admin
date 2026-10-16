/**
 * UN LIEU EST-IL OUVERT À LA COMMANDE, ET PAR QUEL CHEMIN ?
 *
 * Cette règle vivait à DEUX endroits de l'écran des lieux : une condition pour
 * naviguer, une autre pour peindre la carte. Elles ont divergé le 10/10 — la
 * navigation a été resserrée, l'affichage est resté en arrière. Un lieu à
 * moitié configuré s'affichait donc **« Ouvert »** et, au clic, retombait sur
 * « Bientôt ». Le pire des deux mondes : une promesse à l'écran, un refus au
 * doigt.
 *
 * Une seule fonction, employée par les deux : elles ne peuvent plus se
 * contredire. Et comme elle est pure, elle se teste sans rendu.
 */

/** Ce que l'écran des lieux sait d'un lieu, et rien de plus. */
export interface LieuOuvrable {
  flaixEnabled?: boolean;
  /**
   * L'adresse de commande Flaix À OUVRIR MAINTENANT, résolue par le serveur
   * à partir de la date (`common/helpers/fenetre-commande.ts`).
   *
   * C'est la seule chose dont le relais a besoin : une adresse qui marche. Le
   * téléphone ne choisit pas — une horloge de travers ouvrirait le match de la
   * semaine suivante.
   */
  flaixOrderUrl?: string | null;
  /** L'heure à laquelle la commande ouvrira (ISO), quand elle est fermée. */
  commandeOuvreA?: string | null;
  currentEventId?: string | null;
}

/** Par où passe la commande de ce lieu — `null` quand il n'y a pas de chemin. */
export type CheminDeCommande = 'flaix' | 'evenement' | null;

/**
 * Le relais Flaix n'est praticable qu'avec une ADRESSE.
 *
 * Avant, on exigeait `flaixVenueId` — l'identifiant du lieu côté Flaix, prévu
 * pour une API qui n'existe pas encore. Il ne permettait d'ouvrir aucune page.
 * Ce qui ouvre une page, c'est le lien du match en cours, et c'est donc lui qui
 * décide. Un lieu basculé en Flaix dont la commande ouvre plus tard est FERMÉ
 * (voir ci-dessous) ; un lieu basculé sans aucun lien garde son parcours
 * Break Eat, le temps que le club finisse sa configuration.
 */
export function cheminDeCommande(lieu: LieuOuvrable): CheminDeCommande {
  if (lieu.flaixEnabled && lieu.flaixOrderUrl) return 'flaix';

  // UN LIEU FLAIX N'A PAS DEUX PORTES.
  //
  // Quand la commande Flaix ouvre PLUS TARD, le lieu est fermé — pas
  // disponible par un autre chemin. Sans cette ligne, un lieu basculé en
  // Flaix et dont le match est dans trois heures s'annonçait « Ouvert » et
  // envoyait le client dans le parcours Break Eat : des produits et des prix
  // que le club ne tient plus, puisque c'est Flaix qui vend.
  //
  // `commandeOuvreA` n'est posé que si un événement Flaix est RÉELLEMENT
  // prévu. Un lieu basculé mais sans aucun lien collé garde donc son parcours
  // Break Eat : on ne coupe pas un club qui n'a pas fini sa configuration.
  if (lieu.flaixEnabled && lieu.commandeOuvreA) return null;

  if (lieu.currentEventId) return 'evenement';
  return null;
}

/** Vrai quand le client peut réellement commander — ce que la carte annonce. */
export function ouvertALaCommande(lieu: LieuOuvrable): boolean {
  return cheminDeCommande(lieu) !== null;
}

/**
 * « Ouvre à 18:00 » — l'heure d'ouverture, quand elle est connue.
 *
 * On l'annonce plutôt que de dire « fermé » : un client qui lit une heure
 * revient. Un client qui lit « rien ici » ne revient pas.
 *
 * `null` dès que la commande est ouverte : afficher une heure d'ouverture
 * passée, alors que le bouton marche, sèmerait le doute.
 */
export function heureDOuverture(lieu: LieuOuvrable): string | null {
  if (ouvertALaCommande(lieu) || !lieu.commandeOuvreA) return null;
  const d = new Date(lieu.commandeOuvreA);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
