/**
 * Le panneau d'admin porte la session d'un responsable de club ET son
 * organisation choisie. C'est là que le défaut de la course au renouvellement a
 * été payé en production : « le dashboard sautait au clic » alors que la
 * session était valide.
 *
 * Même configuration que le back-office, volontairement : deux harnais qui
 * divergent, c'est une suite qu'on finit par ne plus lancer.
 *
 * `jsdom` et non `node` : le client lit et écrit `localStorage`, et c'est
 * précisément ce qu'on veut éprouver. Pas de rendu React ici — la logique
 * testée est celle du client d'API, qui n'en a pas besoin. Les histoires
 * Storybook couvrent déjà le rendu des composants.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          // Next.js compile pour le navigateur ; les tests tournent sous Node.
          module: 'commonjs',
          target: 'ES2021',
          strict: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  restoreMocks: true,
};
