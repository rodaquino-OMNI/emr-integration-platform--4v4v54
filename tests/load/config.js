// Load Testing Configuration
// Based on PRD requirements: Lines 307-318 of Product Requirements Document

export const config = {
  // Target SLAs from PRD
  sla: {
    // API endpoint latency: < 500ms for 95th percentile (PRD line 309)
    apiResponseTimeP95: 500, // milliseconds

    // Task creation/update: < 1s for completion (PRD line 310)
    taskOperationTime: 1000, // milliseconds

    // EMR data verification: < 2s for validation (PRD line 311)
    emrVerificationTime: 2000, // milliseconds

    // Uptime requirement: 99.99% (PRD line 354)
    successRate: 99.9, // percentage

    // Concurrent users: 10,000 simultaneous users (PRD line 312)
    maxConcurrentUsers: 10000,

    // Task operations: 1,000 operations/second (PRD line 313)
    taskOperationsPerSecond: 1000,

    // EMR integration: 500 requests/second (PRD line 314)
    emrRequestsPerSecond: 500
  },

  // Environment configuration
  environments: {
    dev: {
      baseUrl: process.env.DEV_BASE_URL || 'http://localhost:3000',
      apiGateway: process.env.DEV_API_GATEWAY || 'http://localhost:3000',
      taskService: process.env.DEV_TASK_SERVICE || 'http://localhost:3001',
      emrService: process.env.DEV_EMR_SERVICE || 'http://localhost:3002',
      syncService: process.env.DEV_SYNC_SERVICE || 'http://localhost:3003',
      handoverService: process.env.DEV_HANDOVER_SERVICE || 'http://localhost:3004',
      websocketUrl: process.env.DEV_WS_URL || 'ws://localhost:3000/ws'
    },
    staging: {
      baseUrl: process.env.STAGING_BASE_URL || 'https://staging.emrtask.io',
      apiGateway: process.env.STAGING_API_GATEWAY || 'https://api-staging.emrtask.io',
      taskService: process.env.STAGING_TASK_SERVICE || 'https://tasks-staging.emrtask.io',
      emrService: process.env.STAGING_EMR_SERVICE || 'https://emr-staging.emrtask.io',
      syncService: process.env.STAGING_SYNC_SERVICE || 'https://sync-staging.emrtask.io',
      handoverService: process.env.STAGING_HANDOVER_SERVICE || 'https://handover-staging.emrtask.io',
      websocketUrl: process.env.STAGING_WS_URL || 'wss://staging.emrtask.io/ws'
    },
    production: {
      baseUrl: process.env.PROD_BASE_URL || 'https://emrtask.io',
      apiGateway: process.env.PROD_API_GATEWAY || 'https://api.emrtask.io',
      taskService: process.env.PROD_TASK_SERVICE || 'https://tasks.emrtask.io',
      emrService: process.env.PROD_EMR_SERVICE || 'https://emr.emrtask.io',
      syncService: process.env.PROD_SYNC_SERVICE || 'https://sync.emrtask.io',
      handoverService: process.env.PROD_HANDOVER_SERVICE || 'https://handover.emrtask.io',
      websocketUrl: process.env.PROD_WS_URL || 'wss://emrtask.io/ws'
    }
  },

  // Load testing scenarios
  scenarios: {
    // Scenario 1: Normal load (Roadmap Week 15, line 365-367)
    normalLoad: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 100 },   // Ramp up to 100 users
        { duration: '5m', target: 1000 },  // Ramp up to 1000 users
        { duration: '10m', target: 1000 }, // Stay at 1000 users
        { duration: '2m', target: 0 }      // Ramp down
      ]
    },

    // Scenario 2: Stress test - exceed normal capacity
    stressTest: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 500 },
        { duration: '5m', target: 2000 },  // 2x normal load
        { duration: '10m', target: 5000 }, // 5x normal load
        { duration: '5m', target: 5000 },
        { duration: '2m', target: 0 }
      ]
    },

    // Scenario 3: Spike test - sudden traffic surge
    spikeTest: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 100 },
        { duration: '30s', target: 5000 }, // Sudden spike
        { duration: '3m', target: 5000 },
        { duration: '30s', target: 100 },
        { duration: '1m', target: 0 }
      ]
    },

    // Scenario 4: Soak test - sustained load over time
    soakTest: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '1h' // 1 hour sustained load
    },

    // Scenario 5: 10,000 active tasks simulation (Roadmap Week 15, line 366)
    massiveTasks: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5m', target: 500 },
        { duration: '10m', target: 2000 },
        { duration: '20m', target: 2000 }, // 2000 users creating 5 tasks each = 10,000 tasks
        { duration: '5m', target: 0 }
      ]
    }
  },

  // Thresholds for pass/fail criteria
  thresholds: {
    // HTTP request duration thresholds
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // PRD line 309
    'http_req_duration{endpoint:task_create}': ['p(95)<1000'], // PRD line 310
    'http_req_duration{endpoint:task_update}': ['p(95)<1000'], // PRD line 310
    'http_req_duration{endpoint:emr_verify}': ['p(95)<2000'], // PRD line 311

    // Request failure rate
    'http_req_failed': ['rate<0.001'], // 99.9% success rate (PRD line 369)

    // Custom metrics
    'task_operations_per_sec': ['rate>1000'], // PRD line 313
    'emr_requests_per_sec': ['rate>500'], // PRD line 314
    'crdt_sync_latency': ['p(95)<500'],
    'websocket_latency': ['p(95)<200']
  },

  // Authentication
  auth: {
    // Test user credentials (should be loaded from secure vault in production)
    testUsers: [
      { username: 'load-test-user-1', password: 'test-password-1', role: 'doctor' },
      { username: 'load-test-user-2', password: 'test-password-2', role: 'nurse' },
      { username: 'load-test-user-3', password: 'test-password-3', role: 'staff' }
    ],
    tokenEndpoint: '/api/auth/token',
    tokenExpiry: 3600 // seconds
  },

  // Test data generation
  testData: {
    patients: {
      count: 1000,
      emrSystems: ['epic', 'cerner']
    },
    tasks: {
      statuses: ['pending', 'in_progress', 'completed'],
      priorities: ['low', 'medium', 'high', 'critical']
    }
  }
};

export function getEnvironment() {
  return config.environments[process.env.ENVIRONMENT || 'dev'];
}

export default config;
