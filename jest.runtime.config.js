/** @type {import('jest').Config} */
module.exports = {
  displayName: 'node',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/lib/runtime/__tests__/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['/home/claude/novo/node_modules/ts-jest', { tsconfig: { module: 'commonjs', rootDir: '<rootDir>' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
