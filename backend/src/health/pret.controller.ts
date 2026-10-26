import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { AUCUNE_LIMITE } from '../common/securite/limitation';
import { PrismaService } from '../database/prisma.service';

/**
 * EST-CE QUE CE CONTENEUR PEUT RÉELLEMENT PRENDRE UNE COMMANDE ?
 *
 * `/health` répond « ok » sans rien vérifier, et c'est VOULU : Railway
 * l'interroge en continu, et un conteneur dont la base hoquette une seconde ne
 * doit pas être tué pour autant. C'est une preuve de vie, pas de bonne santé.
 *
 * Mais personne ne pouvait répondre à l'autre question, celle qui compte un
 * soir de match : *est-ce que ça marche ?* Les 23-25 octobre, la production a
 * servi du code vieux de quatre jours avec un `/health` parfaitement vert —
 * une migration avait échoué, Railway gardait l'ancien conteneur, et rien, de
 * l'extérieur, ne le disait.
 *
 * `/ready` répond à celle-là. Il n'est l'objet d'AUCUNE surveillance
 * automatique : on le consulte quand on doute, et il doit dire la vérité même
 * quand elle est mauvaise.
 *
 * ── CE QU'IL VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS ──────────────────────
 *
 * LA BASE : une requête réelle, pas un ping de socket. Un pool épuisé ou une
 * base en lecture seule répond au TCP et refuse les requêtes.
 *
 * LES MIGRATIONS INACHEVÉES : c'est le cœur de l'affaire. Prisma laisse dans
 * `_prisma_migrations` les lignes commencées et jamais finies — l'état
 * `P3009`, qui bloque TOUTES les migrations suivantes. Un serveur dans cet
 * état démarre, répond, encaisse… avec un schéma à moitié posé. Rien ne le
 * signalait.
 *
 * PAS REDIS. Sa panne ne rend plus l'API inapte : les compteurs de limitation
 * basculent en mémoire (`common/securite/limitation-redis.ts`) et le temps
 * réel se dégrade sans couper la vente. Le déclarer « pas prêt » ferait
 * retirer du service un conteneur qui vend parfaitement.
 */
@SkipThrottle(AUCUNE_LIMITE)
@Controller('ready')
export class PretController {
  private readonly logger = new Logger('Pret');

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async pret(@Res({ passthrough: true }) res: Response) {
    const base = await this.verifierBase();
    const migrations = await this.verifierMigrations();

    const pret = base.ok && migrations.ok;
    // 503 et non 500 : « indisponible pour le moment » est exact, et c'est ce
    // qu'un répartiteur de charge comprend. Un 200 avec un corps qui dit
    // « pas prêt » serait lu comme un succès par tout ce qui ne lit que le code.
    res.status(pret ? 200 : 503);

    if (!pret) {
      this.logger.error(
        `Pas prêt — base: ${base.detail ?? 'ok'} | migrations: ${migrations.detail ?? 'ok'}`,
      );
    }

    return {
      status: pret ? 'pret' : 'pas-pret',
      timestamp: new Date().toISOString(),
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'inconnu',
      base,
      migrations,
    };
  }

  /** Une VRAIE requête : un pool épuisé répond au TCP et refuse les requêtes. */
  private async verifierBase(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * LES MIGRATIONS COMMENCÉES ET JAMAIS FINIES — l'état `P3009`.
   *
   * `finished_at` nul et `rolled_back_at` nul : la migration a démarré, elle
   * a échoué, et personne ne l'a résolue. Prisma refuse alors d'appliquer
   * TOUTES les suivantes, en silence, à chaque déploiement.
   *
   * La table est absente sur une base montée à la main (tests, bac à sable) :
   * ce n'est pas une panne, c'est une base qui n'a jamais vu Prisma. On le dit
   * sans faire échouer — sinon `/ready` crierait au loup sur tout
   * environnement jetable.
   */
  private async verifierMigrations(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const bloquees = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
        ORDER BY started_at ASC
      `;
      if (bloquees.length === 0) return { ok: true };
      return {
        ok: false,
        detail:
          `${bloquees.length} migration(s) en échec, à résoudre avant toute autre : ` +
          bloquees.map((m) => m.migration_name).join(', '),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // `42P01` — la table n'existe pas. Base sans Prisma, pas base en panne.
      if (/_prisma_migrations/.test(message) && /exist/i.test(message)) {
        return { ok: true, detail: 'aucun historique Prisma sur cette base' };
      }
      return { ok: false, detail: message };
    }
  }
}
