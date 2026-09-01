import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

/**
 * Filtre d'exceptions — rendre une panne DIAGNOSTICABLE.
 *
 * NestJS répond « Internal server error » à toute exception imprévue, sans rien
 * d'autre. C'est le bon réflexe face au public : un message d'erreur brut peut
 * révéler la structure de la base ou le nom des colonnes.
 *
 * Mais en pratique, ce silence a coûté une soirée : deux écrans affichaient
 * `{"statusCode":500,"message":"Internal server error"}` sans qu'aucune piste
 * ne remonte jusqu'à la personne qui pouvait corriger. Chercher « à l'aveugle »
 * consiste alors à relire du code au hasard.
 *
 * Ce filtre tranche autrement :
 *
 *  - il JOURNALISE toujours l'erreur complète, avec sa pile et la route ;
 *  - il attribue une RÉFÉRENCE courte, renvoyée au client, qui permet de
 *    retrouver la ligne exacte dans les journaux même quand le message reste
 *    générique ;
 *  - hors production (`NODE_ENV=production`), il renvoie AUSSI le message réel.
 *    Sur un environnement d'essai, cacher la cause à celui qui teste ne protège
 *    personne — ça ne fait qu'allonger la boucle.
 *
 * Les exceptions HTTP volontaires (400, 403, 404…) passent inchangées : elles
 * portent déjà un message écrit pour l'utilisateur.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Erreur métier explicite : on ne touche à rien.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    const reference = randomUUID().slice(0, 8);
    const message = exception instanceof Error ? exception.message : String(exception);
    const pile = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `[${reference}] ${request.method} ${request.url} → ${message}`,
      pile,
    );

    const enProduction = process.env.NODE_ENV === 'production';
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      // La référence suffit à retrouver la trace complète dans les journaux.
      reference,
      message: enProduction
        ? `Une erreur interne est survenue (réf. ${reference})`
        : `${message} (réf. ${reference})`,
    });
  }
}
