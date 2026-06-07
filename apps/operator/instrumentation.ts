/**
 * Next.js instrumentation hook — operator app (Phase 10)
 *
 * Next.js calls this file once per runtime (node / edge / browser).
 * We use it to initialise Sentry on each runtime with the correct config.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Sentry client-side init is triggered via next.config.ts (withSentryConfig)
 * which injects an import of sentry.client.config.ts into the client bundle.
 * No explicit call needed here for the browser runtime.
 */
