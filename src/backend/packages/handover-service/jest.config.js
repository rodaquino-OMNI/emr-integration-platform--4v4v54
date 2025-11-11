module.exports = {
  displayName: 'handover-service',
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test file patterns
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/types/**'
  ],

  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },

  coverageDirectory: '<rootDir>/coverage',

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@task/(.*)$': '<rootDir>/../task-service/src/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1'
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      diagnostics: {
        warnOnly: true
      }
    }]
  },

  // Test execution
  verbose: true,
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Performance
  maxWorkers: '50%',

  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage/junit',
        outputName: 'junit.xml'
      }
    ]
  ]
};
