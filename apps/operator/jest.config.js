/**
 * LE POSTE OPÉRATEUR — le dernier des cinq paquets sans aucun test.
 *
 * Son risque n'est pas celui des autres : c'est l'écran qu'une équipière tient
 * pendant trois heures de service, les mains occupées. Une session qui saute,
 * un numéro de commande mal affiché ou une transition refusée se paient
 * immédiatement, au comptoir, devant le client.
 *
 * Même configuration que le back-office et l'admin, volontairement : trois
 * harnais qui divergent, c'est une suite qu'on finit par ne plus lancer.
 *
 * `jsdom` et non `node` : le client lit et écrit `localStorage` et émet un
 * événement de fenêtre quand la session meurt — c'est précisément ce qu'on veut
 * éprouver. Pas de rendu React ici ; les histoires Storybook couvrent déjà les
 * composants.
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
