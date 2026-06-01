import './instrument'; // Sentry must be imported first
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, raw } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    // Disable Nest's default body parser — we wire express middleware below
    // so the Stripe webhook gets a raw Buffer and the rest of the API gets JSON.
    bodyParser: false,
  });

  // Stripe webhook MUST receive raw bytes for signature verification.
  // Must be registered BEFORE the generic JSON parser.
  app.use('/webhooks/stripe', raw({ type: 'application/json' }));
  app.use(json({ limit: '1mb' }));

  // Global validation pipe — active for all routes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — origins controlled via env
  const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001'];
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
