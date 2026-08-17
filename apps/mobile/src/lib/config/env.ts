/**
 * Typed environment configuration for React Native.
 *
 * Metro bundler populates process.env at bundle time from the .env file
 * (via react-native-dotenv or inline definition in metro.config.js).
 *
 * NEVER import process.env directly in app code — always go through this module.
 * This ensures:
 *   - TypeScript knows every env var (no implicit `string | undefined`)
 *   - Default values are centralized in one place
 *   - Easy to swap for a real config library (e.g. react-native-config) later
 */

/**
 * Environnement de la build, posé par le profil EAS (`eas.json`).
 *
 * `staging` = build Beta distribuée aux testeurs (TestFlight / test fermé
 * Google Play). Elle doit viser un backend et une base SÉPARÉS de la
 * production : c'est toute la raison d'être de ce champ.
 */
export type AppEnv = 'development' | 'staging' | 'production';

const APP_ENV = (process.env['APP_ENV'] as AppEnv | undefined) ?? 'development';

/** Adresse du backend selon l'environnement, sans repli silencieux. */
function resolveApiUrl(): string {
  const fromEnv = process.env['EXPO_PUBLIC_API_URL'] as string | undefined;
  if (fromEnv) return fromEnv;

  // En développement, l'IP du poste rend le démarrage immédiat.
  if (APP_ENV === 'development') return 'http://192.168.1.133:3000/api/v1';

  // Une build empaquetée SANS adresse explicite est une erreur de
  // configuration, pas un cas à rattraper. Retomber sur une valeur par défaut
  // enverrait une Beta vers la production — exactement ce qu'on veut rendre
  // impossible. Mieux vaut une panne bruyante au premier écran qu'un test
  // « réussi » qui écrit dans les vraies commandes.
  throw new Error(
    `EXPO_PUBLIC_API_URL est absent pour une build "${APP_ENV}". ` +
      'Définissez-le dans le profil EAS correspondant (eas.json).',
  );
}

export const ENV = {
  /** Backend API base URL — voir {@link resolveApiUrl}. */
  API_URL: resolveApiUrl(),

  /** Environnement de la build : development | staging | production. */
  APP_ENV,

  /** True pour une build Beta distribuée aux testeurs. */
  IS_BETA: APP_ENV === 'staging',

  /** Sentry DSN for mobile. Leave empty to disable Sentry. */
  SENTRY_DSN: (process.env['SENTRY_DSN_MOBILE'] as string | undefined) ?? '',

  /** Current runtime environment. */
  NODE_ENV: (process.env['NODE_ENV'] as 'development' | 'production' | 'test') ?? 'development',

  /** True when running in production bundle. */
  IS_PRODUCTION: process.env['NODE_ENV'] === 'production',
} as const;
