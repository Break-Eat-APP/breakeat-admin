import { registerAs } from '@nestjs/config';

/**
 * Centralised app configuration.
 * All environment variables are read here — never read process.env directly
 * in services or controllers. Inject ConfigService instead.
 */
export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001'],

  /**
   * Demo Mode — when true, /admin/simulator and /demo endpoints are exposed.
   * Per PRODUCT_VALIDATION.md, demo mode must NEVER be enabled in production.
   */
  demoMode: process.env.DEMO_MODE === 'true',

  /**
   * Staging-only operations (seeders, simulators) require this token.
   * Generated server-side, shared via secure channel to the product owner.
   */
  stagingToken: process.env.STAGING_ONLY_TOKEN ?? '',

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    apiVersion: process.env.STRIPE_API_VERSION ?? '2024-12-18.acacia',
    /**
     * Platform commission in basis points.
     * 100 bps = 1%, 500 bps = 5%, etc.
     * Used as application_fee_amount on PaymentIntents.
     */
    platformFeeBps: parseInt(process.env.STRIPE_PLATFORM_FEE_BPS ?? '500', 10),
    connect: {
      returnUrl:
        process.env.STRIPE_CONNECT_RETURN_URL ??
        'http://localhost:3001/suppliers/onboarding/complete',
      refreshUrl:
        process.env.STRIPE_CONNECT_REFRESH_URL ??
        'http://localhost:3001/suppliers/onboarding/refresh',
    },
  },

  sentry: {
    dsn: process.env.SENTRY_DSN_BACKEND ?? '',
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT ?? '',
    accessKey: process.env.STORAGE_ACCESS_KEY ?? '',
    secretKey: process.env.STORAGE_SECRET_KEY ?? '',
    bucket: process.env.STORAGE_BUCKET ?? 'brateat-media',
    region: process.env.STORAGE_REGION ?? 'eu-west-1',
  },

  flaix: {
    apiUrl: process.env.FLAIX_API_URL ?? '',
    apiKey: process.env.FLAIX_API_KEY ?? '',
  },
}));
