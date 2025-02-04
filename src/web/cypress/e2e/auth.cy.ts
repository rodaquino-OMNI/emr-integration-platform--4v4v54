import { login } from '../support/commands';

// Test user data with role-based permissions
const TEST_USERS = {
  nurse: {
    email: 'nurse@test.com',
    password: 'testpass123',
    role: 'NURSE',
    permissions: ['view_tasks', 'update_tasks']
  },
  doctor: {
    email: 'doctor@test.com',
    password: 'testpass123',
    role: 'DOCTOR',
    permissions: ['create_tasks', 'approve_tasks']
  },
  admin: {
    email: 'admin@test.com',
    password: 'testpass123',
    role: 'ADMIN',
    permissions: ['manage_users', 'manage_system']
  }
};

// Application routes for testing
const TEST_ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  settings: '/settings',
  admin: '/admin',
  profile: '/profile',
  tasks: '/tasks'
};

describe('Authentication', () => {
  beforeEach(() => {
    // Clear session state before each test
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.visit(TEST_ROUTES.login);
  });

  it('should display login form with proper accessibility attributes', () => {
    // Verify form structure and accessibility
    cy.findByRole('form', { name: /login/i }).within(() => {
      cy.findByLabelText(/email/i)
        .should('have.attr', 'type', 'email')
        .should('have.attr', 'required');

      cy.findByLabelText(/password/i)
        .should('have.attr', 'type', 'password')
        .should('have.attr', 'required');

      cy.findByRole('button', { name: /sign in/i })
        .should('be.visible')
        .should('have.attr', 'type', 'submit');
    });

    // Verify additional form elements
    cy.findByLabelText(/remember me/i)
      .should('have.attr', 'type', 'checkbox');

    cy.findByRole('link', { name: /forgot password/i })
      .should('have.attr', 'href', '/forgot-password');
  });

  it('should handle successful login with MFA verification', () => {
    const { email, password, role } = TEST_USERS.nurse;

    // Intercept auth requests
    cy.intercept('POST', '/api/auth/login').as('loginRequest');
    cy.intercept('POST', '/api/auth/mfa/verify').as('mfaVerify');
    cy.intercept('GET', '/api/auth/session').as('sessionCheck');

    // Perform login
    cy.findByLabelText(/email/i).type(email);
    cy.findByLabelText(/password/i).type(password);
    cy.findByRole('button', { name: /sign in/i }).click();

    // Verify login request
    cy.wait('@loginRequest').then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
      expect(interception.response?.body).to.have.property('requireMfa', true);
    });

    // Handle MFA verification
    cy.findByLabelText(/mfa code/i).type('123456');
    cy.findByRole('button', { name: /verify/i }).click();

    // Verify MFA and session establishment
    cy.wait('@mfaVerify').then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
      expect(interception.response?.body).to.have.property('accessToken');
    });

    // Verify successful login and role-based access
    cy.url().should('include', TEST_ROUTES.dashboard);
    cy.getCookie('session').should('exist');
    cy.window().its('localStorage').should('have.property', 'accessToken');
    cy.findByTestId(`role-${role}`).should('exist');
  });

  it('should handle invalid credentials appropriately', () => {
    // Test invalid email format
    cy.findByLabelText(/email/i).type('invalid-email');
    cy.findByRole('button', { name: /sign in/i }).click();
    cy.findByText(/invalid email format/i).should('be.visible');

    // Test unknown email
    cy.findByLabelText(/email/i).clear().type('unknown@test.com');
    cy.findByLabelText(/password/i).type('password123');
    cy.findByRole('button', { name: /sign in/i }).click();
    cy.findByText(/account not found/i).should('be.visible');

    // Test wrong password
    const { email } = TEST_USERS.nurse;
    cy.findByLabelText(/email/i).clear().type(email);
    cy.findByLabelText(/password/i).clear().type('wrongpass');
    cy.findByRole('button', { name: /sign in/i }).click();
    cy.findByText(/invalid credentials/i).should('be.visible');

    // Verify rate limiting
    for (let i = 0; i < 5; i++) {
      cy.findByRole('button', { name: /sign in/i }).click();
    }
    cy.findByText(/too many attempts/i).should('be.visible');
  });

  it('should handle MFA verification flow comprehensively', () => {
    const { email, password } = TEST_USERS.doctor;

    // Complete initial login
    cy.findByLabelText(/email/i).type(email);
    cy.findByLabelText(/password/i).type(password);
    cy.findByRole('button', { name: /sign in/i }).click();

    // Test invalid MFA code
    cy.findByLabelText(/mfa code/i).type('000000');
    cy.findByRole('button', { name: /verify/i }).click();
    cy.findByText(/invalid mfa code/i).should('be.visible');

    // Test MFA timeout
    cy.clock().tick(300000); // 5 minutes
    cy.findByLabelText(/mfa code/i).clear().type('123456');
    cy.findByRole('button', { name: /verify/i }).click();
    cy.findByText(/mfa session expired/i).should('be.visible');

    // Test valid MFA code
    cy.findByLabelText(/mfa code/i).clear().type('123456');
    cy.findByRole('button', { name: /verify/i }).click();
    cy.url().should('include', TEST_ROUTES.dashboard);
  });

  it('should enforce role-based access control', () => {
    // Test nurse permissions
    cy.login(TEST_USERS.nurse.email, TEST_USERS.nurse.password, 'NURSE');
    cy.visit(TEST_ROUTES.tasks).should('be.visible');
    cy.visit(TEST_ROUTES.admin).should('be.denied');

    // Test doctor permissions
    cy.login(TEST_USERS.doctor.email, TEST_USERS.doctor.password, 'DOCTOR');
    cy.visit(TEST_ROUTES.tasks).should('be.visible');
    cy.visit(TEST_ROUTES.settings).should('be.visible');
    cy.visit(TEST_ROUTES.admin).should('be.denied');

    // Test admin permissions
    cy.login(TEST_USERS.admin.email, TEST_USERS.admin.password, 'ADMIN');
    cy.visit(TEST_ROUTES.admin).should('be.visible');
    cy.visit(TEST_ROUTES.settings).should('be.visible');
  });

  it('should handle logout securely', () => {
    // Login first
    cy.login(TEST_USERS.nurse.email, TEST_USERS.nurse.password, 'NURSE');

    // Intercept logout request
    cy.intercept('POST', '/api/auth/logout').as('logoutRequest');

    // Perform logout
    cy.findByRole('button', { name: /logout/i }).click();
    cy.findByRole('button', { name: /confirm/i }).click();

    // Verify logout
    cy.wait('@logoutRequest').then((interception) => {
      expect(interception.response?.statusCode).to.equal(200);
    });

    // Verify session cleanup
    cy.getCookie('session').should('not.exist');
    cy.window().its('localStorage').should('not.have.property', 'accessToken');
    cy.url().should('include', TEST_ROUTES.login);

    // Verify protected route access after logout
    cy.visit(TEST_ROUTES.dashboard);
    cy.url().should('include', TEST_ROUTES.login);
  });
});