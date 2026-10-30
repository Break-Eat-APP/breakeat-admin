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
 *   • `ip` — un COUPE-CIRCUIT, pas un contrôle fin (voir plus bas) ;
 *   • `adresse` — serré (8 tentatives par quart d'heure), et compté par ADRESSE
 *     E-MAIL. Il ne s'applique qu'aux requêtes qui portent une adresse ET qui
 *     visent une route d'authentification. C'est lui qui empêche d'essayer une
 *     liste de mots de passe sur un compte, sans jamais gêner le voisin.
 *
 * Les compteurs sont partagés via Redis quand `REDIS_URL` est posée
 * (`limitation-redis.ts`), et retombent en mémoire sinon — par instance, donc
 * multipliés par leur nombre. C'est dit au démarrage.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE COMPTEUR PAR IP NE PEUT PAS PROTÉGER GRAND-CHOSE ICI
 *
 * Ce fichier a longtemps affirmé que 600 requêtes par minute « n'attrapent
 * qu'un script, jamais une foule ». **C'était faux**, et la revérification du
 * 27/10 l'a démontré : dix mille supporters derrière le wifi d'un stade
 * partagent UNE SEULE adresse publique. À une requête chacun dans la même
 * minute, six cents passent et neuf mille quatre cents reçoivent un refus —
 * au coup d'envoi, c'est-à-dire au pire moment possible.
 *
 * Et le problème n'a pas de bon réglage : toute limite assez basse pour
 * arrêter un script est assez basse pour casser un stade. Compter par COMPTE
 * plutôt que par adresse ne se peut pas non plus — ce garde est global et
 * s'exécute AVANT l'authentification, qui est posée route par route : il n'y a
 * pas encore d'utilisateur à lire.
 *
 * Alors on arrête de prétendre. Le compteur par IP devient un COUPE-CIRCUIT :
 * assez haut pour qu'aucun lieu réel ne le touche, assez bas pour qu'une
 * machine emballée finisse par s'arrêter. La vraie défense contre un déni de
 * service se pose EN AMONT de l'application — chez l'hébergeur, pas dans le
 * processus qu'on cherche à protéger.
 *
 * Ce qui protège vraiment un compte reste le second compteur, qui suit
 * l'ADRESSE E-MAIL et se moque de l'IP : huit essais par quart d'heure, et
 * dix mille supporters n'y changent rien.
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

/**
 * Le plafond du coupe-circuit, par minute et par adresse IP.
 *
 * Trente mille : un grand stade au coup d'envoi — quelques milliers de
 * téléphones qui chargent leur écran en même temps — reste très en dessous,
 * tandis qu'une machine qui tire cinq cents requêtes par seconde le franchit
 * en une minute. Ce n'est pas une protection fine, et ça ne prétend plus
 * l'être.
 *
 * RÉGLABLE SANS REDÉPLOYER, par `LIMITE_IP_PAR_MINUTE`. Un soir de match, on
 * ne veut pas attendre cinq minutes de build pour desserrer un étau qui
 * étrangle une buvette — c'est le même raisonnement que l'interrupteur de
 * l'ardoise. Une valeur illisible ou absurde retombe sur le défaut plutôt que
 * d'ouvrir en grand ou de tout fermer.
 */
export const LIMITE_IP_DEFAUT = 30_000;

export function limiteIp(brut = process.env.LIMITE_IP_PAR_MINUTE): number {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : LIMITE_IP_DEFAUT;
}

/** Les deux compteurs, tels que le module les reçoit. */
export const COMPTEURS: ThrottlerOptions[] = [
  {
    name: 'ip',
    ttl: 60_000,
    limit: limiteIp(),
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
