/**
 * Le back-office n'avait AUCUN test. C'est pourtant lui qui porte la session
 * d'un super-administrateur et le renouvellement de son jeton — la mécanique
 * la plus délicate de l'app, et la plus silencieuse quand elle casse : on est
 * simplement renvoyé au login, et ça ressemble à un bug d'identifiants.
 *
 * `jsdom` et non `node` : le client lit et écrit `localStorage`, et c'est
 * précisément ce qu'on veut éprouver. Pas de rendu React ici — la logique
 * testée est celle du client d'API, qui n'en a pas besoin. Ajouter une
 * bibliothèque de rendu serait du poids pour rien à ce stade.
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
