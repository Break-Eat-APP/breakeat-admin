import { ENV } from '@lib/config/env';

// Sentry.init() touches a TurboModule (getEnforcing) that throws immediately
// if the native module isn't registered — this must never take the whole
// app down before it even renders, so failure here is swallowed.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    environment: ENV.NODE_ENV,
    tracesSampleRate: ENV.IS_PRODUCTION ? 0.2 : 1.0,
    enabled: Boolean(ENV.SENTRY_DSN),
  });
} catch (e) {
  console.warn('Sentry init failed, continuing without crash reporting:', e);
}
