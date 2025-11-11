import { rest } from 'msw';
import { TaskStatus, TaskPriority } from '../../src/lib/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export const mockApiHandlers = [
  // Auth endpoints
  rest.post(`${API_BASE_URL}/auth/login`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        user: {
          id: 'user-123',
          email: 'nurse@hospital.com',
          name: 'Jane Doe',
          role: 'NURSE'
        },
        token: 'mock-auth-token',
        refreshToken: 'mock-refresh-token'
      })
    );
  }),

  rest.post(`${API_BASE_URL}/auth/logout`, (req, res, ctx) => {
    return res(ctx.status(200));
  }),

  rest.post(`${API_BASE_URL}/auth/refresh`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        token: 'new-auth-token',
        refreshToken: 'new-refresh-token'
      })
    );
  }),

  // Task endpoints
  rest.get(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        tasks: [
          {
            id: 'task-1',
            title: 'Blood Pressure Check',
            status: TaskStatus.TODO,
            priority: TaskPriority.HIGH,
            patientId: 'patient-123',
            assignedTo: 'user-123'
          },
          {
            id: 'task-2',
            title: 'Medication Administration',
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.CRITICAL,
            patientId: 'patient-456',
            assignedTo: 'user-123'
          }
        ],
        total: 2
      })
    );
  }),

  rest.post(`${API_BASE_URL}/tasks`, (req, res, ctx) => {
    return res(
      ctx.status(201),
      ctx.json({
        id: 'task-new',
        ...req.body,
        status: TaskStatus.TODO,
        createdAt: new Date().toISOString()
      })
    );
  }),

  rest.put(`${API_BASE_URL}/tasks/:id`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        id: req.params.id,
        ...req.body,
        updatedAt: new Date().toISOString()
      })
    );
  }),

  rest.delete(`${API_BASE_URL}/tasks/:id`, (req, res, ctx) => {
    return res(ctx.status(204));
  }),

  // Handover endpoints
  rest.get(`${API_BASE_URL}/handovers`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        handovers: [
          {
            id: 'handover-1',
            fromUserId: 'user-123',
            toUserId: 'user-456',
            patientId: 'patient-123',
            status: 'PENDING',
            priority: 'ROUTINE'
          }
        ],
        total: 1
      })
    );
  }),

  rest.post(`${API_BASE_URL}/handovers`, (req, res, ctx) => {
    return res(
      ctx.status(201),
      ctx.json({
        id: 'handover-new',
        ...req.body,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      })
    );
  }),

  // Patient endpoints (EMR)
  rest.get(`${API_BASE_URL}/patients/:id`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        id: req.params.id,
        mrn: 'MRN123456',
        name: { given: ['John'], family: 'Doe' },
        birthDate: '1980-01-01',
        gender: 'male'
      })
    );
  }),

  // Audit log endpoints
  rest.get(`${API_BASE_URL}/audit-logs`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        logs: [
          {
            id: 'log-1',
            action: 'LOGIN',
            userId: 'user-123',
            timestamp: new Date().toISOString()
          }
        ],
        total: 1
      })
    );
  }),

  // Notification endpoints
  rest.get(`${API_BASE_URL}/notifications`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        notifications: [
          {
            id: 'notif-1',
            type: 'TASK',
            title: 'New Task Assigned',
            message: 'You have been assigned a new task',
            read: false,
            createdAt: new Date().toISOString()
          }
        ],
        unreadCount: 1
      })
    );
  })
];

export const errorHandlers = {
  networkError: rest.get(`${API_BASE_URL}/*`, (req, res) => {
    return res.networkError('Failed to connect');
  }),

  serverError: rest.get(`${API_BASE_URL}/*`, (req, res, ctx) => {
    return res(
      ctx.status(500),
      ctx.json({ error: 'Internal server error' })
    );
  }),

  unauthorized: rest.get(`${API_BASE_URL}/*`, (req, res, ctx) => {
    return res(
      ctx.status(401),
      ctx.json({ error: 'Unauthorized' })
    );
  }),

  forbidden: rest.get(`${API_BASE_URL}/*`, (req, res, ctx) => {
    return res(
      ctx.status(403),
      ctx.json({ error: 'Forbidden' })
    );
  })
};
