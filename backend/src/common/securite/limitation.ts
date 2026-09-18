import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

/**
 * La limitation de débit — deux compteurs, qui ne comptent pas la même chose.
 *
 * Le contexte décide de tout ici : nos clients commandent depuis un stade, des
 * centaines de téléphones derrière le MÊME wifi, donc la même adresse IP
 * publique. Une limite serrée par IP bloquerait une buvette entière au coup
 * d'envoi — la protection deviendrait la panne.
 *
 * D'où deux compteurs :
 *
 *   • `ip` — large (600 requêtes par minute). Il n'attrape qu'un vrai déluge,
 *     un script, jamais une foule ;
 *   • `adresse` — serré (8 tentatives par quart d'heure), et compté par ADRESSE
 *     E-MAIL. Il ne s'applique qu'aux requêtes qui portent une adresse ET qui
 *     visent une route d'authentification. C'est lui qui empêche d'essayer une
 *     liste de mots de passe sur un compte, sans jamais gêner le voisin.
 *
 * Les deux compteurs vivent en mémoire : ils repartent à zéro au redémarrage, et
 * chaque conteneur a le sien. Suffisant tant qu'il n'y en a qu'un ; le jour où
 * l'API se dédouble, il faudra les déporter dans Redis, déjà disponible.
 */

/** Les routes où essayer des mots de passe a un sens. */
const ROUTES_SENSIBLES = /\/auth\/(login|register)\b/;

/** La requête telle qu'on a besoin de la lire — rien de plus. */
type RequeteLue = { url?: unknown; body?: unknown; ip?: unknown };

/** L'adresse e-mail portée par la requête, normalisée — ou rien. */
export function adresseDeLaRequete(req: RequeteLue): string | null {
  const corps = req.body as { email?: unknown } | undefined;
  if (typeof corps?.email !== 'string') return null;
  const adresse = corps.email.trim().toLowerCase();
  return adresse.length > 0 ? adresse : null;
}

/**
 * Ce compteur serré s'applique-t-il à cette requête ?
 *
 * Deux conditions, et les deux comptent : une adresse dans le corps, et une
 * route d'authentification. Sans la seconde, toute route portant une adresse —
 * l'invitation d'un équipier, par exemple — hériterait d'une limite de huit
 * par quart d'heure sans que personne l'ait voulu.
 */
export function concerneUneAuthentification(req: RequeteLue): boolean {
  const url = typeof req.url === 'string' ? req.url : '';
  return ROUTES_SENSIBLES.test(url) && adresseDeLaRequete(req) !== null;
}

/** Les deux compteurs, tels que le module les reçoit. */
export const COMPTEURS: ThrottlerOptions[] = [
  {
    name: 'ip',
    ttl: 60_000,
    limit: 600,
  },
  {
    name: 'adresse',
    ttl: 900_000,
    limit: 8,
    // Hors authentification, ce compteur ne s'applique pas du tout.
    skipIf: (contexte: ExecutionContext) =>
      !concerneUneAuthentification(contexte.switchToHttp().getRequest<RequeteLue>()),
    // Et quand il s'applique, il suit l'adresse — jamais l'IP.
    getTracker: (req: Record<string, unknown>) =>
      `adresse:${adresseDeLaRequete(req as RequeteLue) ?? 'inconnue'}`,
  },
];

/**
 * Ce que doivent porter les routes qu'on ne limite JAMAIS.
 *
 * Les deux noms sont écrits explicitement : `@SkipThrottle()` sans argument ne
 * viserait qu'un compteur nommé `default`, qui n'existe pas ici — la route ne
 * serait donc pas exemptée, et personne ne s'en apercevrait avant la panne.
 */
export const AUCUNE_LIMITE = { ip: true, adresse: true } as const;
