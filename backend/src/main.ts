import './instrument'; // Sentry must be imported first
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, raw } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { JsonLogger } from './logger/json-logger';

async function bootstrap(): Promise<void> {
  // Use structured JSON logger in production; NestJS default in other envs.
  // JsonLogger falls back to colour output automatically when NODE_ENV !== production.
  const appLogger = new JsonLogger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: appLogger,
    // Disable Nest's default body parser — we wire express middleware below
    // so the Stripe webhook gets a raw Buffer and the rest of the API gets JSON.
    bodyParser: false,
  });

  // Re-use the same logger instance for post-bootstrap messages.
  const logger = appLogger;

  // Stripe webhook MUST receive raw bytes for signature verification.
  // Must be registered BEFORE the generic JSON parser.
  app.use('/webhooks/stripe', raw({ type: 'application/json' }));
  // Phase 21 — même contrainte pour Flaix : la signature HMAC porte sur les
  // octets bruts, un JSON re-sérialisé ne correspondrait plus.
  app.use('/webhooks/flaix', raw({ type: 'application/json' }));
  app.use(json({ limit: '1mb' }));

  // Global validation pipe — active for all routes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — origines pilotées par l'environnement. Défaut : les 3 dashboards
  // de développement (admin 3001, opérateur 3002, back office 3003).
  //
  // Le découpage NETTOIE chaque entrée. `split(',')` seul laissait passer
  // l'espace qu'on tape naturellement après une virgule : « a.com, b.com »
  // donnait « ␣b.com », qui ne correspondait à rien. Le slash final est retiré
  // pour la même raison — une origine HTTP n'en porte jamais.
  //
  // Ce n'est pas de la précaution gratuite : une entrée malformée bloque
  // SILENCIEUSEMENT toute une app (le navigateur refuse, le serveur ne dit
  // rien), et c'est arrivé deux fois sur ce projet.
  const corsOrigins = (
    process.env.CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
    ]
  )
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Tracé au démarrage : la seule façon de vérifier ce que le serveur a
  // RÉELLEMENT retenu, sans avoir à deviner depuis un échec côté navigateur.
  logger.log(`CORS — origines autorisées : ${corsOrigins.join(' | ') || '(aucune)'}`);

  app.enableCors({ origin: corsOrigins, credentials: true });

  // Global prefix — /health and /webhooks are excluded so they remain at their root paths.
  // /webhooks/stripe must stay stable for Stripe; /health for Docker/monitoring.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'webhooks/(.*)'] });

  // Safety: DEMO_MODE must NEVER be enabled in production
  if (process.env.DEMO_MODE === 'true' && process.env.NODE_ENV === 'production') {
    logger.error('CRITICAL: DEMO_MODE=true is not allowed in NODE_ENV=production. Aborting.');
    process.exit(1);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`BREAK EAT backend running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  if (process.env.DEMO_MODE === 'true') {
    logger.warn('⚠️  DEMO_MODE is ENABLED — simulator endpoints are active at /internal/simulator');
  }
  logger.log(`Health check: GET http://localhost:${port}/health`);
  logger.log(`Stripe hook:  POST http://localhost:${port}/webhooks/stripe`);
  logger.log(`API base:     http://localhost:${port}/api/v1`);
}

void bootstrap();
