import { faker } from '@faker-js/faker'; // v8.0.0
import '@testing-library/cypress'; // v9.0.0
import { tasks } from '../fixtures/tasks.json';
import { 
  TaskStatus, 
  TaskPriority, 
  TaskVerificationStatus 
} from '../../../backend/packages/task-service/src/types/task.types';
import { EMR_SYSTEMS } from '../../../backend/packages/shared/src/types/common.types';

// Test configuration constants
const TEST_USER = {
  email: 'test@example.com',
  password: 'test123',
  role: 'NURSE',
  department: 'ICU'
};

const TASK_BOARD_URL = '/dashboard/tasks';
const API_TIMEOUT = 30000;
const EMR_MOCK_CONFIG = {
  baseUrl: '/api/mock/emr',
  delay: 1000,
  errorRate: 0.05
};
const HANDOVER_ERROR_THRESHOLD = 0.40;

describe('Task Management', () => {
  beforeEach(() => {
    // Reset application state
    cy.clearLocalStorage();
    cy.clearIndexedDB();

    // Load test fixtures and configure mocks
    cy.fixture('tasks.json').as('taskFixtures');
    cy.intercept('GET', `${EMR_MOCK_CONFIG.baseUrl}/**`, (req) => {
      req.reply({
        statusCode: 200,
        delay: EMR_MOCK_CONFIG.delay,
        body: {
          success: Math.random() > EMR_MOCK_CONFIG.errorRate,
          data: tasks[0].emrData
        }
      });
    }).as('emrRequests');

    // Authenticate and visit task board
    cy.login(TEST_USER);
    cy.visit(TASK_BOARD_URL);
    cy.wait('@emrRequests');
  });

  it('should create a new task with EMR verification', () => {
    const newTask = {
      title: 'Blood Glucose Check',
      description: faker.lorem.sentence(),
      priority: TaskPriority.HIGH,
      patientId: faker.string.uuid(),
      emrData: {
        system: EMR_SYSTEMS.EPIC,
        resourceType: 'Observation',
        data: {
          code: {
            coding: [{
              system: 'http://loinc.org',
              code: '2339-0',
              display: 'Glucose [Mass/volume] in Blood'
            }]
          }
        }
      }
    };

    // Open task creation modal
    cy.findByRole('button', { name: /create task/i }).click();

    // Fill task form
    cy.findByLabelText(/title/i).type(newTask.title);
    cy.findByLabelText(/description/i).type(newTask.description);
    cy.findByLabelText(/priority/i).select(newTask.priority);
    cy.findByLabelText(/patient id/i).type(newTask.patientId);

    // Submit and verify EMR data
    cy.intercept('POST', '/api/tasks').as('createTask');
    cy.findByRole('button', { name: /submit/i }).click();
    cy.wait('@createTask').its('response.statusCode').should('eq', 201);

    // Verify task appears in board
    cy.findByText(newTask.title).should('be.visible');
    cy.findByTestId(`task-${newTask.title}-status`)
      .should('have.text', TaskStatus.TODO);
    cy.findByTestId(`task-${newTask.title}-verification`)
      .should('have.text', TaskVerificationStatus.PENDING);
  });

  it('should handle concurrent task updates with CRDT', () => {
    const taskId = tasks[0].id;
    const updates = [
      { status: TaskStatus.IN_PROGRESS },
      { priority: TaskPriority.CRITICAL }
    ];

    // Simulate concurrent updates
    cy.wrap(updates).each((update) => {
      cy.intercept('PATCH', `/api/tasks/${taskId}`).as('updateTask');
      cy.findByTestId(`task-${taskId}-card`).click();
      
      Object.entries(update).forEach(([field, value]) => {
        cy.findByLabelText(new RegExp(field, 'i')).select(value);
      });
      
      cy.findByRole('button', { name: /save/i }).click();
      cy.wait('@updateTask');
    });

    // Verify final state reflects CRDT merge
    cy.findByTestId(`task-${taskId}-card`).within(() => {
      cy.findByTestId('status').should('have.text', TaskStatus.IN_PROGRESS);
      cy.findByTestId('priority').should('have.text', TaskPriority.CRITICAL);
    });

    // Validate vector clock
    cy.window().its('app.store').invoke('getState').then((state) => {
      const task = state.tasks.find(t => t.id === taskId);
      expect(task.vectorClock.counter).to.be.greaterThan(0);
      expect(task.vectorClock.timestamps).to.have.property('device-001');
    });
  });

  it('should process task handover with error tracking', () => {
    const handoverTasks = tasks.slice(0, 3);
    let initialErrorCount = 0;
    let finalErrorCount = 0;

    // Initialize error tracking
    cy.window().then((win) => {
      initialErrorCount = win.app.metrics.handoverErrors || 0;
    });

    // Select tasks for handover
    cy.findByRole('button', { name: /initiate handover/i }).click();
    handoverTasks.forEach((task) => {
      cy.findByTestId(`task-${task.id}-checkbox`).click();
    });

    // Process handover
    cy.intercept('POST', '/api/handovers').as('createHandover');
    cy.findByRole('button', { name: /complete handover/i }).click();
    cy.wait('@createHandover');

    // Verify handover completion
    handoverTasks.forEach((task) => {
      cy.findByTestId(`task-${task.id}-card`).within(() => {
        cy.findByText(/handover complete/i).should('be.visible');
        cy.findByTestId('last-handover-time').should('not.be.empty');
      });
    });

    // Calculate error reduction
    cy.window().then((win) => {
      finalErrorCount = win.app.metrics.handoverErrors || 0;
      const errorReduction = 1 - (finalErrorCount / (initialErrorCount || 1));
      expect(errorReduction).to.be.greaterThan(HANDOVER_ERROR_THRESHOLD);
    });
  });

  it('should maintain offline functionality with sync', () => {
    // Enable offline mode
    cy.intercept('**', (req) => {
      req.destroy();
    }).as('networkFailure');

    // Create task offline
    const offlineTask = {
      title: 'Offline Blood Pressure Check',
      priority: TaskPriority.HIGH
    };

    cy.findByRole('button', { name: /create task/i }).click();
    cy.findByLabelText(/title/i).type(offlineTask.title);
    cy.findByLabelText(/priority/i).select(offlineTask.priority);
    cy.findByRole('button', { name: /submit/i }).click();

    // Verify task is stored locally
    cy.findByText(offlineTask.title).should('be.visible');
    cy.findByTestId(`task-${offlineTask.title}-sync`)
      .should('have.text', 'Pending Sync');

    // Restore connection and verify sync
    cy.intercept('POST', '/api/tasks').as('syncTask');
    cy.intercept('**').as('networkRestored');
    
    cy.wait('@syncTask').then(() => {
      cy.findByTestId(`task-${offlineTask.title}-sync`)
        .should('have.text', 'Synced');
    });
  });
});