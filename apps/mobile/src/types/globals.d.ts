/**
 * Minimal process.env declaration for React Native / Metro bundler.
 *
 * Metro replaces process.env.FOO at bundle time with the actual value from .env.
 * TypeScript needs a type for `process` to accept these accesses without error.
 *
 * We declare only what is used (env) to avoid importing all of @types/node,
 * which would introduce Node.js globals (fs, path, Buffer, etc.) that do not
 * exist in the React Native runtime.
 */
declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};
