/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'components',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/__tests__/*.test.tsx',
        '<rootDir>/src/**/__tests__/**/*.test.tsx',
      ],
      transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', rootDir: '.' } }] },
      transform: { '^.+\\.tsx?$': ['<rootDir>/node_modules/ts-jest', { tsconfig: { module: 'commonjs', rootDir: '.' } }] },
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
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', rootDir: '.' } }],
        '^.+\\.js$': ['ts-jest', { tsconfig: { module: 'commonjs', rootDir: '.' }, diagnostics: false }],
        '^.+\\.tsx?$': ['<rootDir>/node_modules/ts-jest', { tsconfig: { module: 'commonjs', rootDir: '.' } }],
        '^.+\\.js$': ['<rootDir>/node_modules/ts-jest', { tsconfig: { module: 'commonjs', rootDir: '.' }, diagnostics: false }],
      },
      transformIgnorePatterns: [
        '/node_modules/(?!(@scure/base|@noble/hashes)/)',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^handlebars$': '<rootDir>/node_modules/handlebars/dist/cjs/handlebars.js',
        '^nodemailer$': '<rootDir>/node_modules/nodemailer/lib/nodemailer.js',
        '^playwright$': '<rootDir>/src/__mocks__/playwright.ts',
      },
    },
  ],
};
