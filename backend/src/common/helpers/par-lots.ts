/**
 * DÉCOUPER UNE LISTE EN LOTS — pour la DURÉE, pas pour une limite.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS, CONTRAIREMENT À CE QU'ON A CRU
 *
 * L'audit du 25/10/2026 (P1-3) annonçait qu'une campagne de masse dépasserait
 * la limite de **65 535 paramètres** du protocole PostgreSQL et échouerait
 * net. Vérifié le 26/10 sur un PostgreSQL 18 réel, c'est **faux** :
 *
 *   findMany  IN  avec 100 000 valeurs        → passe
 *   createMany    50 000 lignes × 4 colonnes  → passe
 *
 * Prisma découpe lui-même ce qu'il envoie. Ce découpage-ci n'est donc PAS ce
 * qui empêche une campagne d'échouer — elle n'échouait pas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT VRAIMENT : IL REND LA MAIN
 *
 * Un `createMany` de 80 000 lignes reste **une seule transaction**. Elle tient
 * ses verrous du début à la fin, et pendant ce temps les commandes en cours
 * attendent. Un club qui annonce un match à ses abonnés le fait précisément
 * quand les buvettes servent — c'est le pire moment pour immobiliser la base.
 *
 * Par lots, chaque écriture se termine et rend la main. La campagne prend un
 * peu plus longtemps ; les commandes, elles, continuent de passer.
 *
 * C'est une question de DISPONIBILITÉ, pas de capacité. La nuance compte :
 * sans elle, on croirait avoir réparé une panne alors qu'on a lissé une
 * contention.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI 1 000
 *
 * Assez grand pour que le nombre d'allers-retours reste négligeable — 80 lots
 * pour 80 000 destinataires —, assez petit pour qu'aucun ne retienne la base
 * plus d'une fraction de seconde.
 */
export const TAILLE_DE_LOT = 1_000;

/**
 * Les lots successifs d'une liste.
 *
 * Générateur plutôt que tableau de tableaux : on ne construit jamais une
 * seconde copie de la liste entière en mémoire.
 */
export function* parLots<T>(items: readonly T[], taille: number = TAILLE_DE_LOT): Generator<T[]> {
  if (taille < 1) throw new RangeError('La taille d’un lot doit être au moins 1.');
  for (let i = 0; i < items.length; i += taille) {
    yield items.slice(i, i + taille) as T[];
  }
}
