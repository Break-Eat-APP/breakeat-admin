/**
 * LES ORIGINES AUTORISÉES — une seule lecture, pour HTTP ET WebSocket.
 *
 * `main.ts` nettoyait la liste (espaces, barre oblique finale, entrées vides) ;
 * `realtime.gateway.ts` faisait un simple `split(',')`. Les deux lisaient la
 * même variable et n'en tiraient pas la même chose.
 *
 * Conséquence : `CORS_ORIGINS="https://a.fr, https://b.fr"` — avec l'espace
 * après la virgule, comme on l'écrit naturellement — autorisait les deux en
 * HTTP, et seule la première en WebSocket. La console du second club se
 * connectait, chargeait ses données par REST… et son temps réel restait muet,
 * sans message d'erreur côté serveur.
 *
 * C'est le genre de panne qu'on cherche du côté du réseau pendant une heure.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI EST NETTOYÉ, ET POURQUOI
 *
 * - les espaces : `"a, b"` est la façon naturelle d'écrire une liste ;
 * - la barre oblique finale : un navigateur envoie `https://a.fr` comme
 *   origine, jamais `https://a.fr/`. Une entrée avec barre ne correspond
 *   à rien et échoue en silence ;
 * - les entrées vides : une virgule en trop ne doit pas produire une origine
 *   `""`, qui n'autorise rien mais allonge la liste.
 */

/** Les origines de développement, quand rien n'est posé. */
export const ORIGINES_LOCALES = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
];

export function originesCors(brut: string | undefined = process.env.CORS_ORIGINS): string[] {
  return (brut?.split(',') ?? ORIGINES_LOCALES)
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
