import { defineConfig } from 'cypress'; // ^12.0.0
import '@testing-library/cypress'; // ^9.0.0

export default defineConfig({
  // E2E Testing Configuration
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    
    // Viewport configuration for consistent testing
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Extended timeouts for EMR operations
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    
    // Test recording configuration
    video: true,
    screenshotOnRunFailure: true,
    
    // Retry configuration for reliable test execution
    retries: {
      runMode: 2, // Retry failed tests twice in CI
      openMode: 0  // No retries in interactive mode
    },
    
    // Setup function for each test
    setupNodeEvents(on, config) {
      // Register event listeners for test execution
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'chrome' && browser.isHeadless) {
          launchOptions.args.push('--disable-gpu');
          launchOptions.args.push('--no-sandbox');
          return launchOptions;
        }
      });

      // Configure code coverage reporting
      on('after:run', (results) => {
        if (config.env.coverage) {
          // Handle coverage reporting after test run
          console.log('Test Coverage Results:', results);
        }
      });

      return config;
    }
  },

  // Component Testing Configuration
  component: {
    devServer: {
      framework: 'next',
      bundler: 'webpack'
    },
    specPattern: '**/*.cy.tsx'
  },

  // Environment variables and global settings
  env: {
    // API endpoint for integration tests
    apiUrl: 'http://localhost:8080',
    
    // Code coverage settings
    coverage: false,
    codeCoverage: {
      exclude: [
        'cypress/**/*.*',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}'
      ]
    }
  },

  // Project settings
  projectId: 'emr-task-management',
  
  // Reporter configuration
  reporter: 'mochawesome',
  reporterOptions: {
    reportDir: 'cypress/reports',
    overwrite: false,
    html: true,
    json: true
  },

  // Screenshot configuration
  screenshotsFolder: 'cypress/screenshots',
  trashAssetsBeforeRuns: true,

  // Video recording configuration
  videosFolder: 'cypress/videos',
  videoCompression: 32,

  // Browser launch configuration
  chromeWebSecurity: false,
  modifyObstructiveCode: false,

  // TypeScript configuration
  watchForFileChanges: true,
  experimentalMemoryManagement: true,

  // Test isolation settings
  testIsolation: true,

  // Network configuration
  numTestsKeptInMemory: 50,
  experimentalNetworkStubbing: true
});