import { registerAs } from '@nestjs/config';

/**
 * Centralised app configuration.
 * All environment variables are read here — never read process.env directly
 * in services or controllers. Inject ConfigService instead.
 */
export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /**
   * APP_ENV is used for Sentry environment tagging and other context-sensitive
   * features where NODE_ENV is too coarse (e.g. staging vs. production).
   * Values: production | staging | development
   */
  appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
  /**
   * LOG_LEVEL controls the minimum log level emitted by JsonLogger.
   * Values: verbose | debug | log | warn | error | fatal
   * Defaults to 'log' in production, 'debug' elsewhere.
   */
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'log' : 'debug'),
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

  /**
   * Back-office reporting parameters.
   * vatRate: the VAT rate used to derive CA HT from the TTC totals stored on
   * orders (Order.totalCents is tax-inclusive — there is no tax field in the
   * schema). Default 0.10 = 10% (resto sur place). HT = TTC / (1 + vatRate).
   */
  reporting: {
    vatRate: parseFloat(process.env.REPORTING_VAT_RATE ?? '0.10'),
  },

  sentry: {
    dsn: process.env.SENTRY_DSN_BACKEND ?? '',
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT ?? '',
    accessKey: process.env.STORAGE_ACCESS_KEY ?? '',
    secretKey: process.env.STORAGE_SECRET_KEY ?? '',
    bucket: process.env.STORAGE_BUCKET ?? 'breakeat-media',
    region: process.env.STORAGE_REGION ?? 'eu-west-1',
  },

  flaix: {
    apiUrl: process.env.FLAIX_API_URL ?? '',
    apiKey: process.env.FLAIX_API_KEY ?? '',
    /**
     * Secret partagé signant les webhooks Flaix → Break Eat (HMAC-SHA256 du
     * corps brut). Vide = webhook refusé : un événement non signé ne doit
     * jamais être accepté « par défaut » faute de configuration.
     */
    webhookSecret: process.env.FLAIX_WEBHOOK_SECRET ?? '',
  },

  /**
   * APNs — mises à jour des Live Activities (phase 21).
   *
   * Canal DISTINCT d'Expo Push : Apple exige un appel direct avec le topic
   * `<bundleId>.push-type.liveactivity`. La clé privée reste strictement
   * serveur ; elle n'est jamais exposée à l'application.
   * Non renseigné ⇒ aucun envoi n'est tenté (pas de crash en local).
   */
  apns: {
    keyId: process.env.APNS_KEY_ID ?? '',
    teamId: process.env.APNS_TEAM_ID ?? '',
    bundleId: process.env.APNS_BUNDLE_ID ?? '',
    /** Contenu du .p8 ; les sauts de ligne échappés `\n` sont restaurés. */
    privateKey: (process.env.APNS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    /** 'production' ou 'sandbox' (build de développement). */
    env: process.env.APNS_ENV ?? 'sandbox',
  },
}));
