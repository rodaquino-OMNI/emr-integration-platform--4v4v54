module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.types.ts',
    '!packages/*/src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  moduleNameMapper: {
    '^@emrtask/task-service/(.*)$': '<rootDir>/packages/task-service/src/$1',
    '^@emrtask/emr-service/(.*)$': '<rootDir>/packages/emr-service/src/$1',
    '^@emrtask/handover-service/(.*)$': '<rootDir>/packages/handover-service/src/$1',
    '^@emrtask/sync-service/(.*)$': '<rootDir>/packages/sync-service/src/$1',
    '^@emrtask/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
    '^@epic/(.*)$': '<rootDir>/packages/$1/src',
    '^@shared/(.*)$': '<rootDir>/packages/shared/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  testTimeout: 10000,
  verbose: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }
  }
};
