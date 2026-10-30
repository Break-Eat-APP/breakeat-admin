/**
 * LE TABLEAU RELISAIT TOUT, À CHAQUE COMMANDE.
 *
 * Chaque `new_order` déclenchait un `loadSnapshot()` — une lecture COMPLÈTE du
 * tableau de bord. Un soir à 2 000 commandes, avec quatre écrans par buvette,
 * cela fait 8 000 lectures intégrales, toutes déclenchées par les mêmes
 * événements, souvent à la même seconde. Le serveur passait son temps à
 * répondre des instantanés que personne n'avait le temps de regarder, et plus
 * il ralentissait, plus les lectures s'empilaient : chaque événement en
 * lançait une nouvelle sans attendre que la précédente revienne.
 *
 * Trois règles, et elles tiennent ensemble :
 *
 *   1. UNE SEULE LECTURE À LA FOIS. Tant qu'une réponse n'est pas revenue, on
 *      n'en lance pas d'autre. C'est ce qui fait que le poste RALENTIT quand
 *      le serveur ralentit, au lieu de l'achever.
 *
 *   2. UNE SEULE EN ATTENTE. Pendant qu'une lecture est en vol, dix
 *      événements peuvent arriver : il n'en faut pas dix de plus derrière, il
 *      en faut UNE — celle qui verra les dix. Au-delà, elles liraient toutes
 *      la même chose.
 *
 *   3. LES ARRIVÉES SONT GROUPÉES. Trois commandes à la même seconde ne
 *      valent qu'une lecture. 300 ms sont invisibles pour l'œil d'une
 *      équipière.
 *
 * ── CE QUE LE GROUPEMENT NE FAIT PAS, ET MESURÉ ────────────────
 *
 * En dessous d'environ trois arrivées par seconde, il ne change RIEN : les
 * commandes sont déjà espacées de plus de 300 ms, chacune garde sa lecture.
 * Mesuré — 600 arrivées à 1/s donnent 600 lectures, 1 800 à 3/s en donnent
 * 1 800, et 6 000 à 10/s en donnent 2 000. Le test qui suit l'enregistre.
 *
 * C'est voulu, et c'est suffisant : une soirée à 2 000 commandes sur huit
 * buvettes, c'est une commande toutes les quarante secondes par comptoir,
 * soit moins d'une lecture par seconde pour le lieu entier. À ce rythme, une
 * lecture par commande est abordable.
 *
 * CE QUI ÉTAIT DANGEREUX, c'est la règle 1. Sans elle, un serveur qui
 * ralentit reçoit PLUS de requêtes — chaque événement en lance une sans
 * attendre la précédente — et c'est cette boucle qui transforme une soirée
 * lente en soirée morte. Le plafond est désormais d'UNE requête en vol par
 * écran, quelle que soit la cadence des commandes.
 *
 * ── ET LA RÉPONSE DÉPASSÉE ─────────────────────────────────────
 *
 * Une opératrice qui change de buvette change la cible de la lecture. La
 * réponse de l'ANCIENNE peut revenir après : elle afficherait les commandes du
 * comptoir voisin sur son écran. Chaque lecture emporte donc le jeton de ce
 * qu'elle lisait, et une réponse dont le jeton a changé est jetée sans bruit.
 *
 * Rien ici ne sait ce qu'est React : c'est une politique de lecture, et elle
 * s'éprouve sans monter un seul composant.
 */

/** Fenêtre de regroupement des arrivées. */
export const GROUPEMENT_MS = 300;

export interface LectureGroupee {
  /**
   * Lit MAINTENANT — premier affichage, sondage de réconciliation, reprise de
   * socket. Rend la main dès qu'une lecture est en vol : personne n'attend
   * l'instantané pour continuer.
   */
  lire(): Promise<void>;
  /** Lit BIENTÔT. Les appels rapprochés n'en font qu'une seule. */
  lireBientot(): void;
  /** Annule une lecture programmée. À appeler au démontage. */
  annuler(): void;
}

export function creerLectureGroupee<T>(reglages: {
  lire: () => Promise<T>;
  /**
   * L'identité de ce qu'on lit, comparée par `===`. Une réponse dont le jeton
   * a changé entre-temps est jetée. Sans jeton, rien n'est jeté.
   */
  jeton?: () => unknown;
  surDebut?: () => void;
  surSucces: (valeur: T) => void;
  surEchec: (erreur: unknown) => void;
  groupementMs?: number;
}): LectureGroupee {
  const groupementMs = reglages.groupementMs ?? GROUPEMENT_MS;

  let enVol = false;
  let aRelire = false;
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  async function lire(): Promise<void> {
    if (enVol) {
      // Règle 2 : une seule en attente. Le drapeau se repose, il ne
      // s'additionne pas.
      aRelire = true;
      return;
    }
    enVol = true;

    // Une lecture programmée n'a plus d'objet : celle-ci part tout de suite.
    if (minuterie) {
      clearTimeout(minuterie);
      minuterie = null;
    }

    const pour = reglages.jeton?.();
    reglages.surDebut?.();
    try {
      const valeur = await reglages.lire();
      if (!reglages.jeton || reglages.jeton() === pour) reglages.surSucces(valeur);
    } catch (erreur) {
      if (!reglages.jeton || reglages.jeton() === pour) reglages.surEchec(erreur);
    } finally {
      // LIBÉRER D'ABORD, relancer ensuite. Dans l'autre ordre, la relance
      // retomberait sur `enVol` et le drapeau resterait posé pour toujours :
      // le tableau ne relirait plus jamais.
      enVol = false;
      if (aRelire) {
        aRelire = false;
        void lire();
      }
    }
  }

  return {
    lire,
    lireBientot() {
      // Un minuteur DÉJÀ posé n'est pas repoussé : sous un flot continu
      // d'arrivées, le repousser à chaque fois ne lirait jamais. On borne le
      // rythme, on ne reporte pas l'échéance.
      if (minuterie) return;
      minuterie = setTimeout(() => {
        minuterie = null;
        void lire();
      }, groupementMs);
    },
    annuler() {
      if (minuterie) {
        clearTimeout(minuterie);
        minuterie = null;
      }
      // Une relance en attente n'a plus lieu d'être : le composant s'en va.
      aRelire = false;
    },
  };
}
