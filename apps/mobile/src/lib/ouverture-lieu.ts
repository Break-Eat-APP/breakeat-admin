/**
 * UN LIEU EST-IL OUVERT À LA COMMANDE, ET PAR QUEL CHEMIN ?
 *
 * Cette règle vivait à DEUX endroits de l'écran des lieux : une condition pour
 * naviguer, une autre pour peindre la carte. Elles ont divergé le 10/10 — la
 * navigation a été resserrée (`flaixEnabled` ET `flaixVenueId`), l'affichage est
 * resté sur `flaixEnabled` seul. Un lieu à moitié configuré s'affichait donc
 * **« Ouvert »** et, au clic, retombait sur « Bientôt ». Le pire des deux
 * mondes : une promesse à l'écran, un refus au doigt.
 *
 * Une seule fonction, employée par les deux : elles ne peuvent plus se
 * contredire. Et comme elle est pure, elle se teste sans rendu.
 */

/** Ce que l'écran des lieux sait d'un lieu, et rien de plus. */
export interface LieuOuvrable {
  flaixEnabled?: boolean;
  flaixVenueId?: string | null;
  currentEventId?: string | null;
}

/** Par où passe la commande de ce lieu — `null` quand il n'y a pas de chemin. */
export type CheminDeCommande = 'flaix' | 'evenement' | null;

/**
 * Le relais Flaix n'est praticable qu'avec SON identifiant : sans lui, l'écran
 * d'arrivée n'a aucune adresse à ouvrir.
 */
export function cheminDeCommande(lieu: LieuOuvrable): CheminDeCommande {
  if (lieu.flaixEnabled && lieu.flaixVenueId) return 'flaix';
  if (lieu.currentEventId) return 'evenement';
  return null;
}

/** Vrai quand le client peut réellement commander — ce que la carte annonce. */
export function ouvertALaCommande(lieu: LieuOuvrable): boolean {
  return cheminDeCommande(lieu) !== null;
}
