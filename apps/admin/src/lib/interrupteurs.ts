/**
 * LES INTERRUPTEURS QUI FONT RÉELLEMENT QUELQUE CHOSE.
 *
 * L'audit du 31/10 demande une « table explicite des modules réellement
 * branchés à un flag », et il ajoute la phrase qui compte : « les flags
 * stockés mais non lus ne sont pas des interrupteurs fonctionnels ».
 *
 * Ce fichier EST cette table. Il n'y en a qu'un seul aujourd'hui, et le dire
 * franchement vaut mieux qu'un écran de saisie libre qui laisserait croire le
 * contraire : une faute de frappe dans `app.split.enabled` crée une ligne en
 * base que personne ne lira jamais, et on chercherait pourquoi « l'interrupteur
 * ne marche pas ».
 *
 * ── POURQUOI UNE SONDE, ET PAS UN CALCUL ───────────────────────
 *
 * L'état affiché ne se RECALCULE PAS ici. Chaque interrupteur déclare une
 * adresse publique — celle que l'application interroge elle-même — et l'écran
 * lui pose la question.
 *
 * C'est la leçon du défaut corrigé le 31/10 : le serveur résolvait
 * ÉVÉNEMENT > CLUB > GLOBAL, l'affichage ne lui passait rien, et les deux se
 * contredisaient — un club dont la fonction venait d'être activée voyait le
 * bouton rester caché. Un écran d'administration qui refait le calcul de son
 * côté finirait par mentir de la même façon.
 *
 * Et il y a un second piège, plus vicieux : `GET /feature-flags/resolve` rend
 * `false` quand AUCUNE ligne n'existe. Or sans ligne, c'est la variable
 * d'environnement qui décide — `GROUP_SPLIT_ENABLED`, aujourd'hui à vrai en
 * production. Brancher cet écran sur `resolve` afficherait donc « inactif »
 * pour une fonction qui marche. Le commentaire du service le dit déjà en
 * toutes lettres : « un flag existe et il est à faux » et « aucun flag
 * n'existe » ne doivent jamais être confondus.
 *
 * La sonde, elle, répond ce que le client voit. Si l'écran et l'application
 * divergent un jour, c'est un vrai défaut — pas un écart d'interprétation.
 */

export interface Interrupteur {
  /** La clé en base. Jamais saisie à la main dans l'écran. */
  cle: string;
  /** Le nom que lit un club. JAMAIS « ardoise » : on dit partager l'addition. */
  label: string;
  /** Ce que la fonction fait, en une phrase. */
  quoi: string;
  /** Ce qui se passe quand on la coupe — la seule question qui compte avant de couper. */
  siCoupe: string;
  /**
   * La variable d'environnement qui décide quand AUCUNE ligne n'est posée.
   * Affichée pour que « rien de posé » ne se lise pas comme « éteint ».
   */
  defautEnv: string;
  /**
   * L'adresse PUBLIQUE que l'application interroge, et que l'écran interroge
   * aussi. `eventId` y est facultatif : sans lui, c'est l'état hors contexte.
   */
  sonde: (eventId?: string) => string;
}

export const INTERRUPTEURS: Interrupteur[] = [
  {
    cle: 'app.split.enabled',
    label: 'Partager l’addition',
    quoi:
      'Un client compose la commande, l’envoie à ses amis par message, et chacun ' +
      'règle sa part sans installer l’application.',
    siCoupe:
      'Le bouton « Partager l’addition » disparaît de l’application, et le serveur ' +
      'refuse d’en ouvrir une nouvelle. Les commandes en cours ne sont pas touchées, ' +
      'et le parcours de commande normal ne change pas d’une ligne.',
    defautEnv: 'GROUP_SPLIT_ENABLED',
    sonde: (eventId) =>
      `/public/order-splits/enabled${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`,
  },
];

/** Les clés que du code lit vraiment — pour distinguer le reste. */
export const CLES_BRANCHEES = new Set(INTERRUPTEURS.map((i) => i.cle));
