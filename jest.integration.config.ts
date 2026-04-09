import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.integration-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  testEnvironment: 'node',
  clearMocks: true,
  passWithNoTests: false,
  moduleNameMapper: {
    '^@app-prisma/(.*)$': '<rootDir>/src/prisma/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@http/(.*)$': '<rootDir>/src/http/$1',
    '^@module/(.*)$': '<rootDir>/src/module/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1'
  }
};

export default config;
