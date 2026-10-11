/**
 * Lance l'API compilée contre la base d'ESSAI locale (conteneur `breakeat_audit`).
 *
 * Sert à voir le back-office et les tableaux de bord réagir à des scénarios
 * (comptes archivés, démonstration…) sans jamais toucher la production.
 *
 * Les variables posées ici priment sur `backend/.env` : la base est celle
 * d'essai, et les services extérieurs (Stripe, APNs, Flaix) sont neutralisés
 * pour qu'aucun appel réel ne parte d'un essai.
 *
 * Usage : node scripts/api-essai-local.js   (après `nest build`)
 */
Object.assign(process.env, {
  NODE_ENV: 'development',
  PORT: '3000',
  // Le port suit la base d'essai, et se laisse surcharger : il est passé de
  // 55432 à 15432 le 05/10 (Windows réserve 55397-55496 pour WSL, le conteneur
  // ne pouvait plus s'y lier). Codé en dur, ce script échouait alors que la
  // base tournait.
  DATABASE_URL:
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    'postgresql://audit:audit@localhost:15432/audit',
  JWT_SECRET: 'essai-local-uniquement',
  CORS_ORIGINS: 'http://localhost:8091,http://localhost:3002,http://localhost:3011,http://localhost:3013',
  REDIS_URL: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  APNS_KEY_ID: '',
  APNS_PRIVATE_KEY: '',
  APNS_TEAM_ID: '',
  FLAIX_API_KEY: '',
  APPLE_CLIENT_IDS: '',
  GOOGLE_CLIENT_IDS: '',
});

require('../dist/main');
