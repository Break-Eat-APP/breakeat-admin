/**
 * L'ACCÈS D'UN LIEU — ce que le back-office remet au responsable, et la porte
 * vers le tableau de bord du lieu.
 *
 * Décision de Rémi (10/11/2026) : le super admin crée le lieu et l'accès ; TOUTE
 * la programmation (événements, liens Flaix, adversaires, photo, plan,
 * fidélité…) se fait dans le tableau de bord du lieu. Le back-office n'a plus
 * de seconde saisie : il ouvre ce tableau de bord, sur le bon lieu.
 */

/** Adresse du tableau de bord des lieux, à communiquer avec les identifiants. */
export const TABLEAU_DE_BORD_URL =
  process.env.NEXT_PUBLIC_MANAGER_URL ?? 'https://breakeat-admin-admin.vercel.app';

/**
 * Le tableau de bord, ouvert directement sur CE lieu (`/ouvrir` côté
 * tableau de bord). N'accorde rien : le serveur vérifie chaque appel.
 */
export function lienTableauDeBord(org: { id: string; name: string }): string {
  const q = new URLSearchParams({ club: org.id, nom: org.name });
  return `${TABLEAU_DE_BORD_URL}/ouvrir?${q.toString()}`;
}

/**
 * Mot de passe provisoire dictable : alphabet sans caractères ambigus
 * (0/O, 1/l/I) et assez long pour résister à une tentative.
 */
export function motDePasseProvisoire(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
