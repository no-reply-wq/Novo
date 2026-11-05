/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/src/__tests__/*.test.tsx',
        '<rootDir>/src/**/__tests__/**/*.test.tsx',
      ],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }] },
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@codemirror/(.*)$': '<rootDir>/src/__mocks__/codemirror.ts',
        '^@lezer/(.*)$': '<rootDir>/src/__mocks__/codemirror.ts',
      },
    },
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/__tests__/*.test.ts',
        '<rootDir>/src/**/__tests__/**/*.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['/home/claude/novo/node_modules/ts-jest', { tsconfig: { module: 'commonjs' } }],
        '^.+\\.js$': ['/home/claude/novo/node_modules/ts-jest', { tsconfig: { module: 'commonjs' }, diagnostics: false }],
      },
      transformIgnorePatterns: [
        '/node_modules/(?!(@scure/base|@noble/hashes)/)',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
  ],
};
