/**
 * Next.js configuration — operator app (Phase 10)
 *
 * Wraps with withSentryConfig when @sentry/nextjs is installed.
 * Falls back to plain config if SENTRY_DSN_OPERATOR is absent (local dev without DSN).
 */
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Shared workspace package shipping raw TS/TSX — Next must transpile it.
  transpilePackages: ['@break-eat/brand'],

  // Expose NEXT_PUBLIC_* env vars to the client bundle
  // (NEXT_PUBLIC_SENTRY_DSN_OPERATOR is read by sentry.client.config.ts)
  // Nothing else needed here — Next.js auto-exposes NEXT_PUBLIC_* at build time.
};

// withSentryConfig enhances the Next.js build to:
//   - Upload source maps to Sentry (only when SENTRY_AUTH_TOKEN is present)
//   - Inject sentry.client.config.ts into the client bundle
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
