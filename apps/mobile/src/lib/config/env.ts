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

export const ENV = {
  /** Backend API base URL. Override in .env → API_URL=http://192.168.x.x:3000/api/v1 */
  API_URL: (process.env['API_URL'] as string | undefined) ?? 'http://localhost:3000/api/v1',

  /** Sentry DSN for mobile. Leave empty to disable Sentry. */
  SENTRY_DSN: (process.env['SENTRY_DSN_MOBILE'] as string | undefined) ?? '',

  /** Current runtime environment. */
  NODE_ENV: (process.env['NODE_ENV'] as 'development' | 'production' | 'test') ?? 'development',

  /** True when running in production bundle. */
  IS_PRODUCTION: process.env['NODE_ENV'] === 'production',
} as const;
