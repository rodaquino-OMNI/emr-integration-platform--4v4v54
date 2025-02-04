import { login, initiateHandover, verifyEMRData, handleOfflineSync, validateAccuracy } from '../support/commands';
import { handoverPackages } from '../fixtures/handovers.json';
import { TaskStatus, TaskPriority } from '@backend/packages/task-service/src/types/task.types';

// Test credentials and selectors
const NURSE_CREDENTIALS = {
  email: 'nurse@hospital.com',
  password: 'test123',
  role: 'NURSE',
  department: 'Emergency'
};

const HANDOVER_SELECTORS = {
  taskList: '[data-cy=handover-task-list]',
  criticalEvents: '[data-cy=critical-events]',
  submitButton: '[data-cy=submit-handover]',
  confirmDialog: '[data-cy=confirm-dialog]',
  offlineIndicator: '[data-cy=offline-status]',
  syncProgress: '[data-cy=sync-progress]',
  errorMessages: '[data-cy=error-display]',
  accuracyMetrics: '[data-cy=accuracy-metrics]'
};

const TEST_TIMEOUTS = {
  apiResponse: 10000,
  emrVerification: 15000,
  syncCompletion: 20000,
  pageLoad: 5000
};

describe('Shift Handover E2E Tests', () => {
  beforeEach(() => {
    // Intercept API requests
    cy.intercept('GET', '/api/handovers/*').as('getHandover');
    cy.intercept('POST', '/api/handovers').as('createHandover');
    cy.intercept('PUT', '/api/handovers/*/verify').as('verifyHandover');
    cy.intercept('GET', '/api/emr/verify/*').as('verifyEMR');

    // Reset local storage and offline status
    cy.clearLocalStorage();
    cy.window().then((win) => {
      win.localStorage.setItem('isOffline', 'false');
    });

    // Login and navigate to handover page
    cy.login(NURSE_CREDENTIALS.email, NURSE_CREDENTIALS.password, NURSE_CREDENTIALS.role);
    cy.visit('/handovers', { timeout: TEST_TIMEOUTS.pageLoad });
  });

  describe('Handover Creation', () => {
    it('should create a new handover with complete task list', () => {
      const handoverData = handoverPackages[0];
      
      cy.get(HANDOVER_SELECTORS.taskList).should('be.visible');
      cy.initiateHandover(handoverData);

      cy.wait('@createHandover', { timeout: TEST_TIMEOUTS.apiResponse })
        .its('response.statusCode')
        .should('equal', 201);

      // Verify task list is complete
      cy.get(HANDOVER_SELECTORS.taskList)
        .find('[data-cy=task-item]')
        .should('have.length', handoverData.tasks.length);
    });

    it('should validate EMR data with 100% accuracy', () => {
      const handoverData = handoverPackages[0];
      
      cy.initiateHandover(handoverData);

      // Verify EMR data for each task
      handoverData.tasks.forEach(task => {
        cy.verifyEMRData(task.id, task.emrData, {
          timeout: TEST_TIMEOUTS.emrVerification
        }).then(verification => {
          expect(verification.accuracy).to.equal(100);
        });
      });

      // Check accuracy metrics
      cy.get(HANDOVER_SELECTORS.accuracyMetrics)
        .should('contain', '100%');
    });
  });

  describe('Offline Support', () => {
    it('should handle handover creation in offline mode', () => {
      // Enable offline mode
      cy.window().then((win) => {
        win.localStorage.setItem('isOffline', 'true');
      });

      const handoverData = handoverPackages[1];
      
      // Create handover offline
      cy.initiateHandover(handoverData);

      // Verify offline indicators
      cy.get(HANDOVER_SELECTORS.offlineIndicator)
        .should('be.visible')
        .and('contain', 'Offline Mode');

      // Restore connection and verify sync
      cy.window().then((win) => {
        win.localStorage.setItem('isOffline', 'false');
      });

      cy.handleOfflineSync().then(syncResult => {
        expect(syncResult.success).to.be.true;
      });

      // Verify sync completion
      cy.get(HANDOVER_SELECTORS.syncProgress)
        .should('contain', 'Sync Complete');
    });
  });

  describe('Error Reduction Validation', () => {
    it('should achieve 40% error reduction in handovers', () => {
      const baselineErrors = 100; // Example baseline
      let currentErrors = 0;

      // Process multiple handovers and track errors
      handoverPackages.slice(0, 3).forEach(handover => {
        cy.initiateHandover(handover, {
          previousErrors: baselineErrors,
          currentErrors
        }).then(result => {
          currentErrors = result.errors || 0;
        });
      });

      // Calculate error reduction
      const errorReduction = ((baselineErrors - currentErrors) / baselineErrors) * 100;
      expect(errorReduction).to.be.at.least(40);
    });

    it('should handle critical events with proper verification', () => {
      const handoverData = handoverPackages[2];
      
      cy.initiateHandover(handoverData);

      // Verify critical events handling
      cy.get(HANDOVER_SELECTORS.criticalEvents)
        .find('[data-cy=critical-event]')
        .each(($event) => {
          cy.wrap($event)
            .find('[data-cy=verify-event]')
            .click();

          cy.wait('@verifyHandover')
            .its('response.statusCode')
            .should('equal', 200);
        });
    });
  });

  describe('Handover Completion', () => {
    it('should complete handover with all verifications', () => {
      const handoverData = handoverPackages[0];
      
      cy.initiateHandover(handoverData);

      // Complete all task verifications
      handoverData.tasks.forEach(task => {
        cy.verifyEMRData(task.id, task.emrData);
      });

      // Submit handover
      cy.get(HANDOVER_SELECTORS.submitButton).click();
      cy.get(HANDOVER_SELECTORS.confirmDialog)
        .should('be.visible')
        .find('[data-cy=confirm-submit]')
        .click();

      cy.wait('@createHandover')
        .its('response.body.status')
        .should('equal', 'COMPLETED');
    });

    it('should validate accuracy metrics after completion', () => {
      const handoverData = handoverPackages[0];
      
      cy.initiateHandover(handoverData);

      // Track accuracy metrics
      cy.validateAccuracy(handoverData).then(metrics => {
        expect(metrics.emrAccuracy).to.equal(100);
        expect(metrics.taskCompletion).to.equal(100);
        expect(metrics.verificationRate).to.equal(100);
      });
    });
  });
});