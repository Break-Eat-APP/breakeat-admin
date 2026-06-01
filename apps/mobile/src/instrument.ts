import * as Sentry from '@sentry/react-native';
import { ENV } from '@lib/config/env';

Sentry.init({
  dsn: ENV.SENTRY_DSN,
  environment: ENV.NODE_ENV,
  tracesSampleRate: ENV.IS_PRODUCTION ? 0.2 : 1.0,
  enabled: Boolean(ENV.SENTRY_DSN),
});
