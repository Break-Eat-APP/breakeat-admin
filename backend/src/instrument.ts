/**
 * Sentry instrumentation — must be imported before any other module in main.ts.
 * In Phase 1 it initialises with a no-op DSN when the env var is missing,
 * so the app still starts locally without a real Sentry project.
 */
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND ?? '',
  environment: process.env.NODE_ENV ?? 'development',
  // Capture 100% of transactions in dev, reduce in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  enabled: Boolean(process.env.SENTRY_DSN_BACKEND),
});
