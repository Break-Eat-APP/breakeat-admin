/**
 * Next.js configuration — operator app (Phase 10)
 *
 * Wraps with withSentryConfig when @sentry/nextjs is installed.
 * Falls back to plain config if SENTRY_DSN_OPERATOR is absent (local dev without DSN).
 */
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * UNE BUILD PUBLIEE SANS ADRESSE D'API NE DOIT PAS SORTIR.
 *
 * `NEXT_PUBLIC_API_URL` est inlinee a la COMPILATION. Absente ce jour-la,
 * l'application part en ligne en visant `http://localhost:3000` — c'est-a-dire
 * LA MACHINE DU VISITEUR. Chaque appel echoue, et l'echec se deguise en
 * « identifiant incorrect » : on cherche des heures du cote des comptes.
 *
 * Le repli etait pose ICI, dans `env` : le code client ne pouvait meme pas
 * s'en apercevoir, puisqu'il recevait une adresse — la mauvaise. Son
 * `console.error` de secours ne partait donc jamais au bon moment, et il
 * n'aurait de toute facon ete lu que par qui ouvre la console, une fois la
 * panne en production.
 *
 * On ne bloque QUE sur Vercel (`process.env.VERCEL`), jamais en CI ni en
 * local : la CI compile pour verifier que le code tient, elle ne publie
 * rien, et un developpeur doit pouvoir construire sans configurer Vercel.
 */
const LOCAL_PAR_DEFAUT = 'http://localhost:3000/api/v1';

if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    'NEXT_PUBLIC_API_URL est absente de cette build Vercel. Publiee telle quelle, ' +
      "l'application viserait " + LOCAL_PAR_DEFAUT + ' depuis le navigateur du ' +
      'visiteur, et tous les appels echoueraient. Poser la variable dans Vercel ' +
      '(Settings > Environment Variables), puis redeployer.',
  );
}


const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Shared workspace package shipping raw TS/TSX — Next must transpile it.
  transpilePackages: ['@break-eat/brand'],
  // Une seule source pour l'adresse de l'API, comme admin et backoffice :
  // elle etait jusqu'ici repetee dans chaque fichier client, et quatre
  // pages portaient le repli `localhost` sans aucun garde.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? LOCAL_PAR_DEFAUT,
  },

  // Expose NEXT_PUBLIC_* env vars to the client bundle
  // (NEXT_PUBLIC_SENTRY_DSN_OPERATOR is read by instrumentation-client.ts)
  // Nothing else needed here — Next.js auto-exposes NEXT_PUBLIC_* at build time.
};

// withSentryConfig enhances the Next.js build to:
//   - Upload source maps to Sentry (only when SENTRY_AUTH_TOKEN is present)
//   - Charger instrumentation-client.ts dans le bundle client (Next >= 15.3 :
//     ce nom remplace sentry.client.config.ts, renomme le 11/10/2026)
//   - Auto-instrument server components / route handlers
export default withSentryConfig(nextConfig, {
  // Sentry organisation + project (set these in CI / Vercel env vars)
  org: process.env.SENTRY_ORG ?? 'break-eat',
  project: process.env.SENTRY_PROJECT ?? 'operator',

  // Source map upload: only when auth token is present (CI / Vercel)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN, // suppress warnings when token is absent

  // Disable Sentry telemetry for the build tool
  telemetry: false,

  // Tunnel Sentry requests through the Next.js server to avoid ad-blockers
  tunnelRoute: '/monitoring',

  // Source map configuration: upload to Sentry but delete from bundle after upload
  // so they are not publicly accessible in the deployed Next.js build.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Disable logging of Sentry CLI output during builds
  disableLogger: true,
});
