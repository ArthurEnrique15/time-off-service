import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['.*\\.integration-spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  collectCoverageFrom: ['<rootDir>/src/**/*.ts', '!<rootDir>/src/**/*.module.ts'],
  coveragePathIgnorePatterns: ['node_modules', 'dist'],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  testEnvironment: 'node',
  clearMocks: true,
  passWithNoTests: false,
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/', '<rootDir>/dist/'],
  moduleNameMapper: {
    '^@app-prisma/(.*)$': '<rootDir>/src/prisma/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@http/(.*)$': '<rootDir>/src/http/$1',
    '^@module/(.*)$': '<rootDir>/src/module/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1'
  },
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  }
};

export default config;
