import { TaskStatus, TaskPriority, UserRole } from '../../src/lib/types';

export const mockUser = {
  id: 'user-123',
  email: 'nurse@hospital.com',
  name: 'Jane Doe',
  role: UserRole.NURSE,
  department: 'Cardiology',
  permissions: ['view_tasks', 'create_tasks', 'update_tasks'],
  avatar: '/avatars/jane-doe.jpg'
};

export const mockSupervisor = {
  id: 'user-456',
  email: 'supervisor@hospital.com',
  name: 'John Supervisor',
  role: UserRole.SUPERVISOR,
  department: 'Cardiology',
  permissions: ['view_tasks', 'create_tasks', 'update_tasks', 'assign_tasks', 'view_reports']
};

export const mockAdmin = {
  id: 'user-789',
  email: 'admin@hospital.com',
  name: 'Admin User',
  role: UserRole.ADMIN,
  department: 'Administration',
  permissions: ['*']
};

export const mockTask = {
  id: 'task-123',
  title: 'Blood Pressure Check',
  description: 'Routine BP measurement required',
  status: TaskStatus.TODO,
  priority: TaskPriority.HIGH,
  dueDate: new Date('2023-08-15T14:00:00'),
  assignedTo: 'user-123',
  patientId: 'patient-456',
  emrData: {
    system: 'EPIC',
    patientId: 'patient-456',
    resourceType: 'Observation',
    data: {
      vitalSigns: { bp: '120/80', temp: '98.6' }
    },
    lastUpdated: new Date(),
    version: '1.0',
    validation: {
      isValid: true,
      errors: []
    },
    hipaaCompliant: true
  },
  verificationStatus: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockHandover = {
  id: 'handover-001',
  fromUserId: 'user-123',
  toUserId: 'user-456',
  patientId: 'patient-456',
  summary: 'Patient handover for shift change',
  details: 'Patient stable, continue current medication regimen',
  tasks: ['task-123'],
  priority: 'ROUTINE',
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockNotification = {
  id: 'notif-123',
  type: 'TASK',
  title: 'New Task Assigned',
  message: 'You have been assigned a new task: Blood Pressure Check',
  read: false,
  createdAt: new Date(),
  metadata: {
    taskId: 'task-123'
  }
};

export const mockAuditLog = {
  id: 'log-123',
  action: 'VIEW_TASK',
  userId: 'user-123',
  resourceType: 'Task',
  resourceId: 'task-123',
  timestamp: new Date(),
  details: {
    taskTitle: 'Blood Pressure Check',
    patientId: 'patient-456'
  },
  hipaaCompliant: true
};

export const generateMockTasks = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    ...mockTask,
    id: `task-${i}`,
    title: `Task ${i}`,
    status: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED][i % 3],
    priority: [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.ROUTINE][i % 3],
    dueDate: new Date(Date.now() + i * 86400000)
  }));
};

export const generateMockHandovers = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    ...mockHandover,
    id: `handover-${i}`,
    summary: `Handover ${i}`,
    status: ['PENDING', 'ACKNOWLEDGED', 'COMPLETED'][i % 3]
  }));
};

export const generateMockNotifications = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    ...mockNotification,
    id: `notif-${i}`,
    title: `Notification ${i}`,
    read: i % 2 === 0,
    createdAt: new Date(Date.now() - i * 3600000)
  }));
};
