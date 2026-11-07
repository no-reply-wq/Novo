const tsjest = require.resolve('ts-jest');
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'components',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/components/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [tsjest, { tsconfig: { module: 'commonjs', rootDir: '.' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
