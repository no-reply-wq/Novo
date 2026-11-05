/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
    // Transform ESM-only packages that Jest cannot parse as CommonJS
    '^.+\\.js$': ['ts-jest', { tsconfig: { module: 'commonjs' }, diagnostics: false }],
  },
  transformIgnorePatterns: [
    // Transform ESM-only packages pulled in by otplib
    '/node_modules/(?!(@scure/base|@noble/hashes)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
};
