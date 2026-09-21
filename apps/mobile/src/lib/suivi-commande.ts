/**
 * L'état que la pastille centrale affiche — calculé à partir des commandes.
 *
 * Fonction PURE, sans import de l'app : elle se teste seule, et c'est elle qui
 * décide de ce que le client voit sur tous ses écrans. Une erreur ici, c'est
 * un anneau vert sur une commande qui n'est pas prête.
 */

/** Les seuls champs lus. Un `Order` complet convient. */
export interface CommandeSuivie {
  status: string;
  paymentStatus?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type EtatPastille =
  | 'repos'
  | 'recue'
  | 'preparation'
  | 'prete'
  | 'recuperee'
  | 'remboursee';

/**
 * Le jaune de « Commande reçue ».
 *
 * Deux teintes, et ce n'est pas du zèle : le jaune vif se voit sur un trait
 * ou un anneau, mais écrit en texte sur fond blanc il ne se lit presque pas.
 * Le second, plus sourd, sert aux libellés.
 */
export const JAUNE = '#EAB308';
export const JAUNE_TEXTE = '#CA8A04';
export const JAUNE_FOND = 'rgba(234, 179, 8, 0.14)';

/**
 * Combien de temps le ✓ (ou le bleu du remboursement) reste affiché.
 *
 * Assez pour que le client le voie en rouvrant l'app après être reparti du
 * comptoir ; pas au point que la pastille parle encore d'une commande
 * mangée depuis une heure.
 */
export const DUREE_FIN_MS = 10 * 60_000;

/** Rang d'avancement : plus il est haut, plus le client doit bouger vite. */
const RANG_EN_COURS: Record<string, number> = {
  PAID: 1,
  ACCEPTED: 1,
  PREPARING: 2,
  READY: 3,
};

const ETAT_EN_COURS: Record<number, EtatPastille> = {
  1: 'recue',
  2: 'preparation',
  3: 'prete',
};

export function estEnCours(c: CommandeSuivie): boolean {
  return c.status in RANG_EN_COURS;
}

/** Remboursée EN TOTALITÉ. Un remboursement partiel n'annule pas la commande. */
function estRemboursee(c: CommandeSuivie): boolean {
  return c.paymentStatus === 'REFUNDED';
}

function horodatage(c: CommandeSuivie): number {
  return Date.parse(c.updatedAt ?? c.createdAt);
}

/**
 * L'état à afficher.
 *
 * 1. Une commande EN COURS l'emporte toujours. S'il y en a plusieurs (deux
 *    buvettes), on suit la plus AVANCÉE : c'est elle qui va demander au client
 *    de se déplacer en premier. Un remboursement partiel ne change rien — la
 *    commande continue d'être servie.
 * 2. Sinon, la DERNIÈRE commande terminée, si elle l'a été il y a moins de
 *    dix minutes : ✓ vert si récupérée, bleu si remboursée.
 * 3. Sinon, la pastille au repos.
 */
export function etatPastille(
  commandes: readonly CommandeSuivie[],
  maintenant: number = Date.now(),
): EtatPastille {
  let rang = 0;
  for (const c of commandes) {
    if (estEnCours(c) && !estRemboursee(c)) rang = Math.max(rang, RANG_EN_COURS[c.status]);
  }
  if (rang > 0) return ETAT_EN_COURS[rang];

  const recentes = commandes
    .filter((c) => maintenant - horodatage(c) < DUREE_FIN_MS)
    .sort((a, b) => horodatage(b) - horodatage(a));
  const derniere = recentes[0];
  if (!derniere) return 'repos';

  if (estRemboursee(derniere)) return 'remboursee';
  if (derniere.status === 'PICKED_UP' || derniere.status === 'COMPLETED') return 'recuperee';
  return 'repos';
}

/**
 * Dans combien de temps l'état affiché expirera de lui-même (✓ ou bleu qui
 * repasse au repos). `null` s'il n'expire pas.
 *
 * Sans cette échéance, le ✓ resterait affiché jusqu'au prochain chargement —
 * qui, en l'absence de commande en cours, peut ne jamais venir.
 */
export function expirationEtat(
  commandes: readonly CommandeSuivie[],
  maintenant: number = Date.now(),
): number | null {
  const etat = etatPastille(commandes, maintenant);
  if (etat !== 'recuperee' && etat !== 'remboursee') return null;
  const plusRecente = Math.max(...commandes.map(horodatage));
  return Math.max(0, plusRecente + DUREE_FIN_MS - maintenant);
}
