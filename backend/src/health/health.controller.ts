import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  environment: string;
  version: string;
  /**
   * Les 7 premiers caracteres du commit deploye, ou « inconnu » hors Railway.
   *
   * Deux fois de suite, une livraison a semble passee alors qu'elle avait
   * echoue au demarrage : Railway laisse l'ANCIEN conteneur repondre tant que
   * le nouveau ne passe pas son controle de sante. De l'exterieur, tout
   * repondait 200 -- y compris les routes de la version precedente -- et rien
   * ne disait laquelle etait en ligne. Ce champ le dit.
   */
  commit: string;
}

/**
 * Health endpoint — used by Docker, CI, load balancers and monitoring.
 * Must never require authentication.
 * Must respond in < 50ms.
 * Route: GET /health  (outside the /api/v1 prefix — see main.ts excludeGlobalPrefix)
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '0.1.0',
      // Railway pose cette variable a chaque construction.
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'inconnu',
    };
  }
}
