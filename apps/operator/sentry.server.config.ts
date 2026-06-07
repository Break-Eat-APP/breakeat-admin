/**
 * Sentry server-side (Node.js) configuration — operator app (Phase 10)
 *
 * Loaded by apps/operator/instrumentation.ts on the Node.js runtime.
 * No-op when SENTRY_DSN_OPERATOR is not set.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN_OPERATOR ?? '',
  enabled: Boolean(process.env.SENTRY_DSN_OPERATOR),

  environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',

  // Server-side traces: lower rate in prod to avoid overhead
  tracesSampleRate: process.env.APP_ENV === 'production' ? 0.2 : 1.0,

  initialScope: {
    tags: { app: 'break-eat-operator', runtime: 'node' },
  },
});
