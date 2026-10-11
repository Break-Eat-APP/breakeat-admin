/**
 * Sentry, cote NAVIGATEUR — poste operateur.
 *
 * Nomme `instrumentation-client.ts` depuis le 11/10/2026 : c'est le nom que
 * Next.js (>= 15.3) charge de lui-meme au demarrage du client. L'ancien
 * `sentry.client.config.ts` dependait d'une injection de `withSentryConfig`,
 * que Turbopack ne fait plus — le build le signalait a chaque passage, et le
 * jour ou le projet passera a Turbopack, les erreurs du navigateur auraient
 * cesse de remonter SANS que rien ne le dise.
 *
 * Inoperant quand `NEXT_PUBLIC_SENTRY_DSN_OPERATOR` est absente (dev local, CI
 * sans secret).
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

/**
 * LES NAVIGATIONS, elles aussi, sont mesurees.
 *
 * Sans ce crochet, Sentry ne voit que le premier chargement : chaque passage
 * d'un ecran a l'autre — justement ce que fait une equipiere pendant trois
 * heures — n'apparait dans aucune trace. Le SDK le reclame explicitement au
 * build (« ACTION REQUIRED »), et c'est la suite du meme demenagement que
 * `onRequestError` cote serveur.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
