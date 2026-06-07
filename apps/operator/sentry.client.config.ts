/**
 * Sentry client-side configuration — operator app (Phase 10)
 *
 * Loaded by apps/operator/instrumentation.ts on the browser runtime.
 * No-op when NEXT_PUBLIC_SENTRY_DSN_OPERATOR is not set (local dev).
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_OPERATOR ?? '',

  // Skip init entirely when DSN is absent (local dev / CI without secret)
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN_OPERATOR),

  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development',

  // Lower sample rate in production to manage volume; full capture in other envs.
  tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.1 : 1.0,

  // Replay only in production (PII implications — keep off in dev/staging by default)
  replaysSessionSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.05 : 0,
  replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 1.0 : 0,

  // Tag every event with the app name so it's filterable in the Sentry dashboard
  initialScope: {
    tags: { app: 'break-eat-operator' },
  },

  // Filter out noise: network errors from third-party scripts, cancelled requests
  beforeSend(event) {
    const msg = event.message ?? '';
    if (msg.includes('ResizeObserver loop') || msg.includes('Non-Error promise rejection')) {
      return null; // drop
    }
    return event;
  },
});
