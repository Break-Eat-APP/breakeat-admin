/**
 * LE RÔLE DU COMPTE, LU DANS LE JETON DE CONNEXION.
 *
 * Le serveur signe `globalRole` dans le jeton qu'il remet à la connexion.
 * L'app le relit pour décider d'AFFICHER un outil réservé (l'aperçu de la Live
 * Activity) — jamais pour autoriser quoi que ce soit : la signature n'est pas
 * vérifiée ici, et n'a pas à l'être. Tout ce que le serveur protège, il le
 * vérifie lui-même. Au pire, quelqu'un qui forgerait un jeton verrait un
 * bouton qui ne fait que dessiner une fausse commande sur son propre écran.
 *
 * Fonction PURE, et qui ne lève jamais : un jeton illisible veut dire « pas
 * super admin », pas un écran Profil qui plante.
 */

function base64UrlVersTexte(segment: string): string | null {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const complete = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  // `atob` existe dans Hermes depuis React Native 0.74, mais les types de
  // React Native ne le déclarent pas. S'il manquait, on répond « pas de rôle »
  // plutôt que de planter.
  const decoder = (globalThis as { atob?: (texte: string) => string }).atob;
  if (typeof decoder !== 'function') return null;
  try {
    return decoder(complete);
  } catch {
    return null;
  }
}

/** Le `globalRole` porté par le jeton, ou null. */
export function roleDuJeton(jeton: string | null | undefined): string | null {
  if (!jeton) return null;
  const parties = jeton.split('.');
  if (parties.length !== 3) return null;
  const texte = base64UrlVersTexte(parties[1]);
  if (!texte) return null;
  try {
    const charge = JSON.parse(texte) as { globalRole?: unknown };
    return typeof charge.globalRole === 'string' ? charge.globalRole : null;
  } catch {
    return null;
  }
}

export function estSuperAdmin(jeton: string | null | undefined): boolean {
  return roleDuJeton(jeton) === 'SUPER_ADMIN';
}
