import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.integration-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
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
  }
};

export default config;
