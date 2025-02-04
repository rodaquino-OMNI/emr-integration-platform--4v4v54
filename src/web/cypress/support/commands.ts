// @ts-check
import '@testing-library/cypress/add-commands'; // v9.0.0
import '@cypress/xpath'; // v2.0.0
import 'cypress-wait-until'; // v1.7.2
import 'cypress-localstorage-commands'; // v2.2.0
import { tasks } from '../fixtures/tasks.json';
import { HandoverPackageManager, HandoverStatus, VerificationState } from '../fixtures/handovers.json';
import { TaskStatus, TaskPriority } from '@backend/packages/task-service/src/types/task.types';
import { EMR_SYSTEMS } from '@backend/packages/shared/src/types/common.types';

// Global constants for test configuration
const WAIT_TIMEOUT = 10000;
const API_TIMEOUT = 30000;
const SYNC_RETRY_ATTEMPTS = 3;
const VERIFICATION_THRESHOLD = 100;
const ERROR_REDUCTION_TARGET = 40;

// Performance measurement decorator
function measurePerformance() {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      const result = await originalMethod.apply(this, args);
      const duration = performance.now() - start;
      Cypress.log({
        name: 'Performance',
        message: `${_propertyKey} took ${duration.toFixed(2)}ms`
      });
      return result;
    };
    return descriptor;
  };
}

// Retry decorator for flaky operations
function retry(attempts: number) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      let lastError;
      for (let i = 0; i < attempts; i++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error;
          Cypress.log({
            name: 'Retry',
            message: `Attempt ${i + 1}/${attempts} failed`
          });
        }
      }
      throw lastError;
    };
    return descriptor;
  };
}

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string, role: string, offlineMode?: boolean): Chainable<void>;
      createTask(taskData: any, offlineMode?: boolean): Chainable<any>;
      verifyEMRData(taskId: string, expectedData: any, options?: any): Chainable<any>;
      initiateHandover(handoverData: any, metrics?: any): Chainable<any>;
    }
  }
}

// Enhanced login command with MFA support
Cypress.Commands.add('login', { prevSubject: false }, 
  @retry(SYNC_RETRY_ATTEMPTS)
  async (email: string, password: string, role: string, offlineMode = false) => {
    if (offlineMode) {
      cy.setLocalStorage('isOffline', 'true');
    }

    cy.visit('/login', { timeout: WAIT_TIMEOUT });
    cy.findByLabelText('Email').type(email);
    cy.findByLabelText('Password').type(password);
    
    // Handle MFA if enabled
    cy.intercept('POST', '/api/auth/mfa/verify').as('mfaVerify');
    cy.findByRole('button', { name: /sign in/i }).click();
    
    cy.wait('@mfaVerify', { timeout: API_TIMEOUT }).then((interception) => {
      if (interception.response?.statusCode === 200) {
        cy.findByLabelText('MFA Code').type(interception.response.body.code);
        cy.findByRole('button', { name: /verify/i }).click();
      }
    });

    // Verify role-based access
    cy.url().should('include', '/dashboard');
    cy.findByTestId(`role-${role}`).should('exist');
    
    if (offlineMode) {
      cy.window().then((win) => {
        expect(win.navigator.onLine).to.be.false;
      });
    }
});

// Task creation with CRDT support
Cypress.Commands.add('createTask', { prevSubject: false },
  @measurePerformance()
  async (taskData: any, offlineMode = false) => {
    const vectorClock = {
      nodeId: 'test-device',
      counter: 1,
      timestamp: BigInt(Date.now()),
      causalDependencies: new Map(),
      mergeOperation: 'LAST_WRITE_WINS'
    };

    if (offlineMode) {
      cy.setLocalStorage('pendingTasks', JSON.stringify([{ ...taskData, vectorClock }]));
      return cy.wrap({ ...taskData, status: 'PENDING_SYNC' });
    }

    cy.intercept('POST', '/api/tasks').as('createTask');
    cy.findByRole('button', { name: /new task/i }).click();
    
    // Fill task form
    cy.findByLabelText('Title').type(taskData.title);
    cy.findByLabelText('Description').type(taskData.description);
    cy.findByLabelText('Priority').select(taskData.priority);
    cy.findByLabelText('Due Date').type(taskData.dueDate);
    
    // EMR data verification
    cy.findByLabelText('Patient ID').type(taskData.patientId);
    cy.findByRole('button', { name: /verify emr/i }).click();
    
    cy.wait('@createTask', { timeout: API_TIMEOUT }).then((interception) => {
      expect(interception.response?.statusCode).to.equal(201);
      return cy.wrap(interception.response?.body);
    });
});

// EMR data verification with accuracy checks
Cypress.Commands.add('verifyEMRData', { prevSubject: false },
  @retry(5)
  async (taskId: string, expectedData: any, options = {}) => {
    const timeout = options.timeout || API_TIMEOUT;
    
    cy.intercept('POST', `/api/tasks/${taskId}/verify`).as('verifyEMR');
    cy.findByTestId(`task-${taskId}`).within(() => {
      cy.findByRole('button', { name: /verify/i }).click();
      
      // Simulate barcode scanning if required
      if (options.scanBarcode) {
        cy.findByLabelText('Scan Barcode').type(options.barcodeData);
      }
    });

    return cy.wait('@verifyEMR', { timeout }).then((interception) => {
      const response = interception.response?.body;
      expect(response.emrMatch).to.equal(true);
      expect(response.accuracy).to.equal(VERIFICATION_THRESHOLD);
      return cy.wrap(response);
    });
});

// Handover initiation with error reduction tracking
Cypress.Commands.add('initiateHandover', { prevSubject: false },
  @measurePerformance()
  async (handoverData: any, metrics = {}) => {
    cy.intercept('POST', '/api/handovers').as('createHandover');
    
    // Initialize handover package
    const handoverPackage = HandoverPackageManager.createHandoverPackage(
      handoverData.fromShift,
      handoverData.toShift,
      handoverData.tasks,
      handoverData.criticalEvents
    );

    // Validate pre-handover conditions
    cy.findByRole('button', { name: /start handover/i }).click();
    
    // Process tasks and critical events
    handoverData.tasks.forEach((task: any) => {
      cy.findByTestId(`task-${task.id}`).within(() => {
        cy.findByLabelText('Handover Notes').type(task.handoverNotes);
        if (task.reassignTo) {
          cy.findByLabelText('Reassign To').select(task.reassignTo);
        }
      });
    });

    // Calculate error reduction
    const errorReduction = ((metrics.previousErrors - metrics.currentErrors) / metrics.previousErrors) * 100;
    expect(errorReduction).to.be.at.least(ERROR_REDUCTION_TARGET);

    return cy.wait('@createHandover', { timeout: API_TIMEOUT }).then((interception) => {
      expect(interception.response?.statusCode).to.equal(201);
      expect(interception.response?.body.status).to.equal(HandoverStatus.COMPLETED);
      return cy.wrap(interception.response?.body);
    });
});