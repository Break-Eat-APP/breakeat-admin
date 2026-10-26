/**
 * SOMMES-NOUS SUR UN DÉPLOIEMENT, OU SUR UNE MACHINE DE DÉVELOPPEMENT ?
 *
 * `NODE_ENV` ne répond pas à cette question dans ce projet. Constaté le
 * 26/10/2026 sur `/health` : il vaut `staging` sur les **deux** services
 * Railway, production comprise.
 *
 * Tout ce qui en dépendait était donc inactif en ligne :
 *
 *   • `all-exceptions.filter.ts` renvoyait au client le message d'erreur
 *     BRUT — messages PostgreSQL, noms de colonnes, chemins de fichiers ;
 *   • le rapport de configuration journalisait en `warn` au lieu de `error` ;
 *   • le niveau de journalisation restait `debug` ;
 *   • Sentry échantillonnait à 100 % au lieu de 20 %.
 *
 * Personne ne s'en est aperçu parce qu'aucun de ces comportements ne se
 * signale : ils se contentent d'être trop bavards.
 *
 * ON NE SE FIE DONC PLUS À UNE VARIABLE QUE QUELQU'UN DOIT PENSER À RÉGLER.
 * Railway pose `RAILWAY_*` lui-même, sur chaque service, sans intervention.
 * `NODE_ENV === 'production'` reste accepté pour les hébergeurs qui le
 * renseignent correctement, et pour les tests.
 *
 * En local, aucune de ces variables n'existe : la fonction rend `false`, et le
 * développeur garde ses messages d'erreur complets.
 */
export function estEnLigne(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ??
      process.env.RAILWAY_SERVICE_ID ??
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      (process.env.NODE_ENV === 'production' ? 'oui' : undefined),
  );
}

/** Le repli de développement du secret JWT — jamais acceptable en ligne. */
export const SECRET_JWT_DE_DEVELOPPEMENT = 'insecure-dev-secret';

/**
 * Un secret JWT digne de ce nom.
 *
 * Longueur minimale de 32 caractères : en deçà, une recherche exhaustive
 * devient envisageable, et un jeton forgé ouvre TOUT — y compris un compte
 * SUPER_ADMIN, qui franchit toutes les gardes d'organisation.
 */
export function secretJwtFaible(secret: string | undefined): string | null {
  if (!secret) return 'absent';
  if (secret === SECRET_JWT_DE_DEVELOPPEMENT) return 'égal au repli de développement';
  if (secret.length < 32) return `trop court (${secret.length} caractères, 32 minimum)`;
  return null;
}
