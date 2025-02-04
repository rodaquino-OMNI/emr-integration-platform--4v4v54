import { TaskStatus, TaskPriority, TaskVerificationStatus } from '@shared/types';
import type { Task } from '@shared/types';
import type { HandoverPackage, HandoverStatus, VerificationState } from '../fixtures/handovers.json';

// @version: cypress ^12.0.0
describe('EMR Task Management Dashboard', () => {
  beforeEach(() => {
    // Intercept API calls and provide mock responses
    cy.intercept('GET', '/api/tasks*', { fixture: 'tasks.json' }).as('getTasks');
    cy.intercept('GET', '/api/handovers*', { fixture: 'handovers.json' }).as('getHandovers');
    cy.intercept('GET', '/api/emr/verification/*', {
      statusCode: 200,
      body: {
        status: 'VERIFIED',
        timestamp: new Date().toISOString(),
        accuracy: 1.0
      }
    }).as('emrVerify');

    // Setup offline capability mocks
    cy.intercept('GET', '/api/sync/status', {
      lastSynced: new Date().toISOString(),
      pendingChanges: 0,
      status: 'SYNCED'
    }).as('syncStatus');

    // Visit dashboard with authentication
    cy.visit('/dashboard');
    cy.wait(['@getTasks', '@getHandovers', '@syncStatus']);
  });

  describe('Task Management', () => {
    it('should display task board with correct columns', () => {
      cy.get('[data-cy=task-board]').should('be.visible');
      cy.get('[data-cy=column-todo]').should('exist');
      cy.get('[data-cy=column-in-progress]').should('exist');
      cy.get('[data-cy=column-completed]').should('exist');
      cy.get('[data-cy=column-blocked]').should('exist');
    });

    it('should verify EMR data accuracy with 100% requirement', () => {
      cy.get('[data-cy=task-card]').first().click();
      cy.wait('@emrVerify');
      
      cy.get('[data-cy=emr-verification-status]')
        .should('contain', 'VERIFIED')
        .and('have.class', 'success');
      
      cy.get('[data-cy=emr-data-accuracy]')
        .should('contain', '100%')
        .and('have.class', 'compliant');
    });

    it('should handle barcode verification workflow', () => {
      cy.intercept('POST', '/api/tasks/verify', {
        statusCode: 200,
        body: {
          verified: true,
          emrMatch: true,
          barcodeData: 'P123456789'
        }
      }).as('verifyBarcode');

      cy.get('[data-cy=task-card]').first().click();
      cy.get('[data-cy=scan-barcode]').click();
      cy.get('[data-cy=barcode-input]').type('P123456789');
      cy.get('[data-cy=verify-button]').click();

      cy.wait('@verifyBarcode');
      cy.get('[data-cy=verification-success]').should('be.visible');
    });

    it('should support offline task updates', () => {
      // Simulate offline mode
      cy.window().then((win) => {
        win.navigator.onLine = false;
      });

      cy.get('[data-cy=task-card]').first().click();
      cy.get('[data-cy=update-status]').click();
      cy.get('[data-cy=status-in-progress]').click();

      // Verify offline indicator and pending sync
      cy.get('[data-cy=offline-indicator]').should('be.visible');
      cy.get('[data-cy=pending-sync]').should('contain', '1');

      // Restore online mode and verify sync
      cy.window().then((win) => {
        win.navigator.onLine = true;
      });
      cy.get('[data-cy=sync-complete]').should('be.visible');
    });
  });

  describe('Handover System', () => {
    it('should validate handover error reduction target of 40%', () => {
      cy.get('[data-cy=handover-metrics]').should('be.visible');
      cy.get('[data-cy=error-reduction]')
        .invoke('text')
        .then((text) => {
          const reduction = parseFloat(text);
          expect(reduction).to.be.at.least(40);
        });
    });

    it('should handle bulk task transfer during handover', () => {
      cy.get('[data-cy=initiate-handover]').click();
      cy.get('[data-cy=select-all-tasks]').click();
      cy.get('[data-cy=assign-shift]').click();
      cy.get('[data-cy=shift-evening]').click();
      
      cy.intercept('POST', '/api/handovers', {
        statusCode: 200,
        body: {
          status: HandoverStatus.COMPLETED,
          tasksTransferred: 5,
          verificationStatus: {
            state: VerificationState.COMPLETED
          }
        }
      }).as('createHandover');

      cy.get('[data-cy=confirm-handover]').click();
      cy.wait('@createHandover');
      
      cy.get('[data-cy=handover-success]').should('be.visible');
      cy.get('[data-cy=tasks-transferred]').should('contain', '5');
    });

    it('should track critical events during handover', () => {
      cy.get('[data-cy=critical-events]').should('be.visible');
      cy.get('[data-cy=add-critical-event]').click();
      
      cy.get('[data-cy=event-description]')
        .type('Patient reported adverse reaction');
      cy.get('[data-cy=event-priority]').select('HIGH');
      
      cy.intercept('POST', '/api/events', {
        statusCode: 200,
        body: {
          id: 'event-123',
          status: 'ACTIVE'
        }
      }).as('createEvent');

      cy.get('[data-cy=save-event]').click();
      cy.wait('@createEvent');
      
      cy.get('[data-cy=event-list]')
        .should('contain', 'Patient reported adverse reaction')
        .and('have.class', 'high-priority');
    });
  });

  describe('Analytics Dashboard', () => {
    it('should display real-time compliance metrics', () => {
      cy.get('[data-cy=compliance-metrics]').should('be.visible');
      cy.get('[data-cy=emr-accuracy]').should('contain', '100%');
      cy.get('[data-cy=verification-rate]').should('be.at.least', 95);
      cy.get('[data-cy=handover-compliance]').should('be.at.least', 98);
    });

    it('should generate accurate performance reports', () => {
      cy.get('[data-cy=generate-report]').click();
      
      cy.intercept('GET', '/api/reports/performance', {
        statusCode: 200,
        body: {
          taskCompletion: 92,
          averageVerificationTime: 45,
          handoverAccuracy: 98
        }
      }).as('getReport');

      cy.wait('@getReport');
      
      cy.get('[data-cy=report-metrics]').should('be.visible');
      cy.get('[data-cy=task-completion]').should('contain', '92%');
      cy.get('[data-cy=verification-time]').should('contain', '45');
    });

    it('should support data export with HIPAA compliance', () => {
      cy.get('[data-cy=export-data]').click();
      
      cy.intercept('POST', '/api/export', {
        statusCode: 200,
        body: {
          exportId: 'export-123',
          status: 'COMPLETED',
          format: 'HIPAA_COMPLIANT'
        }
      }).as('exportData');

      cy.get('[data-cy=export-format]').select('HIPAA_COMPLIANT');
      cy.get('[data-cy=confirm-export]').click();
      
      cy.wait('@exportData');
      cy.get('[data-cy=export-success]')
        .should('be.visible')
        .and('contain', 'HIPAA-compliant format');
    });
  });
});