"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Root Jest configuration for backend microservices
 * Version: Jest 29.6.0
 *
 * This configuration establishes standardized testing environment and tooling
 * with enhanced execution controls for robust test runs across all backend services.
 */
const config = {
    // Use ts-jest as the default preset for TypeScript testing
    preset: 'ts-jest',
    // Set Node.js as the test environment
    testEnvironment: 'node',
    // Define test file locations
    roots: ['<rootDir>/packages'],
    testMatch: ['**/test/**/*.test.ts'],
    // Configure coverage collection
    collectCoverageFrom: [
        'packages/*/src/**/*.ts',
        // Exclude type definition files from coverage
        '!packages/*/src/types/**/*.ts'
    ],
    // Set coverage thresholds to ensure code quality
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    // Configure module resolution for the monorepo structure
    moduleNameMapper: {
        // Map @emrtask imports to their source locations
        '^@emrtask/(.*)$': '<rootDir>/packages/$1/src'
    },
    // Setup files to run before tests
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    // Supported file extensions
    moduleFileExtensions: ['ts', 'js', 'json'],
    // TypeScript transformation configuration
    transform: {
        '^.+\\.ts$': 'ts-jest'
    },
    // Enhanced test execution controls
    verbose: true,
    testTimeout: 30000,
    clearMocks: true,
    restoreMocks: true,
    detectOpenHandles: true,
    forceExit: true,
    // Global configuration
    globals: {
        'ts-jest': {
            tsconfig: '<rootDir>/tsconfig.json',
            diagnostics: {
                warnOnly: false
            }
        }
    },
    // Reporter configuration
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: 'coverage/junit',
                outputName: 'junit.xml',
                classNameTemplate: '{filepath}',
                titleTemplate: '{title}'
            }
        ]
    ],
    // Fail tests on any console errors
    errorOnDeprecated: true,
    // Maximum number of concurrent workers
    maxWorkers: '50%',
    // Prevent tests from printing console logs
    silent: true,
    // Cache configuration
    cache: true,
    cacheDirectory: '<rootDir>/node_modules/.cache/jest'
};
exports.default = config;
//# sourceMappingURL=jest.config.js.map