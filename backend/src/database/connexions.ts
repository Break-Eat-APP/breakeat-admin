/**
 * COMBIEN DE CONNEXIONS LA BASE ACCEPTE, ET COMBIEN SONT DÉJÀ PRISES.
 *
 * L'audit du 30/10 le pose ainsi, et il a raison : « le plan PostgreSQL, sa
 * limite de connexions, les ressources et le nombre maximal de répliques ne
 * figurent pas dans le dépôt audité. Sans ces valeurs, il n'est pas possible
 * d'affirmer que dix mille commandes simultanées sont supportées. »
 *
 * On pouvait y répondre par un document à remplir à la main. Il serait faux
 * au premier changement de plan, et personne ne le relirait. On DEMANDE donc
 * à PostgreSQL, qui sait : `max_connections` est sa configuration, et
 * `pg_stat_activity` dit ce qui est ouvert à l'instant.
 *
 * ── CE QUE ÇA REND POSSIBLE ──────────────────────────────────────
 *
 * Le pool ouvre dix connexions PAR INSTANCE (`pool.ts`). Dix répliques un
 * soir de gros match, et c'est cent connexions — plus les migrations au
 * démarrage, la sauvegarde nocturne, et la console de l'exploitant. Sur une
 * base modeste plafonnée à cent, on ajoute un replica pour encaisser
 * l'affluence et c'est précisément ce replica qui épuise la base : l'API
 * répond « too many connections » alors que le processeur s'ennuie.
 *
 * La valeur se lit maintenant au démarrage, dans les journaux de déploiement,
 * et à tout moment sur `/ready`. La question cesse d'être ouverte : elle a une
 * réponse, et elle se met à jour toute seule.
 *
 * ── ON NE DÉCLARE PAS « PAS PRÊT » POUR AUTANT ───────────────────
 *
 * Être près du plafond n'empêche pas de vendre. Et si les connexions étaient
 * réellement épuisées, le `SELECT 1` de `/ready` aurait déjà échoué — c'est
 * lui qui porte le verdict. Ici on RENSEIGNE, et on crie dans le journal au
 * bon moment. Retirer du service un conteneur qui vend parfaitement serait
 * provoquer la panne qu'on surveille.
 */

/** Ce que la base rend quand on l'interroge sur ses connexions. */
export interface EtatDesConnexions {
  /** Le plafond du serveur — la vraie limite du plan. */
  plafond: number;
  /** Ce qui est ouvert à l'instant, toutes bases et tous clients confondus. */
  ouvertes: number;
  /** Ce qui reste. Négatif ne peut pas arriver, mais on ne le suppose pas. */
  libres: number;
  /** Part du plafond déjà consommée, en pourcentage entier. */
  occupation: number;
  /**
   * Combien d'instances de PLUS le plafond permet, au rythme du pool.
   *
   * C'est le chiffre qu'on veut un soir de match, quand on se demande si l'on
   * peut ajouter un replica.
   */
  instancesPossibles: number;
}

/**
 * Au-delà, on crie. Quatre-vingts pour cent laisse encore de quoi démarrer une
 * instance de dix connexions sur une base à cent — en dessous, on serait déjà
 * dans le mur en voulant l'annoncer.
 */
export const OCCUPATION_ALERTE = 80;

type LecteurSql = {
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
};

/**
 * Interroge la base. Rend `null` si elle ne veut pas répondre — un plafond
 * inconnu n'est pas une panne, et certaines bases gérées masquent ces vues.
 */
export async function lireLesConnexions(
  prisma: LecteurSql,
  connexionsParInstance: number,
): Promise<EtatDesConnexions | null> {
  try {
    // `current_setting` et non `SHOW` : `SHOW` ne rend pas une ligne
    // exploitable par Prisma, et `pg_settings` demande plus de droits.
    const lignes = await prisma.$queryRawUnsafe<{ plafond: string; ouvertes: bigint }[]>(
      `SELECT current_setting('max_connections') AS plafond,
              (SELECT count(*) FROM pg_stat_activity) AS ouvertes`,
    );
    const ligne = lignes[0];
    if (!ligne) return null;

    const plafond = Number(ligne.plafond);
    const ouvertes = Number(ligne.ouvertes);
    if (!Number.isFinite(plafond) || plafond <= 0 || !Number.isFinite(ouvertes)) return null;

    const libres = Math.max(0, plafond - ouvertes);
    return {
      plafond,
      ouvertes,
      libres,
      occupation: Math.round((ouvertes / plafond) * 100),
      instancesPossibles: Math.floor(libres / Math.max(1, connexionsParInstance)),
    };
  } catch {
    // Vue inaccessible, droits insuffisants, base non PostgreSQL : on ne sait
    // pas, et on le dit en rendant `null`. Lever ici ferait échouer un
    // démarrage pour une ligne d'information.
    return null;
  }
}

/** La même chose en une phrase, pour le journal de démarrage. */
export function resumeDesConnexions(etat: EtatDesConnexions | null): string {
  if (!etat) return 'plafond de connexions inconnu (la base ne le dit pas)';
  return (
    `${etat.ouvertes}/${etat.plafond} connexions prises (${etat.occupation} %), ` +
    `de quoi tenir encore ${etat.instancesPossibles} instance(s)`
  );
}
