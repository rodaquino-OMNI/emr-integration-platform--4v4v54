import { TaskStatus, TaskPriority, TaskVerificationStatus } from '../../packages/task-service/src/types/task.types';
import { EMR_SYSTEMS } from '../../packages/shared/src/types/common.types';

export const mockUser = {
  id: 'user-123',
  email: 'nurse@hospital.com',
  name: 'Jane Doe',
  role: 'NURSE',
  department: 'Cardiology',
  permissions: ['view_tasks', 'create_tasks', 'update_tasks']
};

export const mockPatient = {
  id: 'patient-456',
  mrn: 'MRN123456',
  name: {
    given: ['John'],
    family: 'Smith'
  },
  birthDate: '1980-01-15',
  gender: 'male'
};

export const mockTask = {
  id: 'task-789',
  title: 'Blood Pressure Check',
  description: 'Routine BP measurement required',
  status: TaskStatus.TODO,
  priority: TaskPriority.HIGH,
  dueDate: new Date('2023-08-15T14:00:00'),
  assignedTo: 'user-123',
  patientId: 'patient-456',
  emrData: {
    system: EMR_SYSTEMS.EPIC,
    patientId: 'patient-456',
    resourceType: 'Observation',
    data: {
      code: { coding: [{ system: 'LOINC', code: '85354-9', display: 'Blood pressure' }] },
      valueQuantity: { value: 120, unit: 'mmHg' }
    },
    lastUpdated: new Date(),
    version: '1.0',
    validation: {
      isValid: true,
      errors: [],
      warnings: [],
      lastValidated: new Date()
    },
    hipaaCompliant: true
  },
  verificationStatus: TaskVerificationStatus.PENDING,
  vectorClock: {
    nodeId: 'node-1',
    counter: 1,
    timestamp: BigInt(Date.now()),
    causalDependencies: new Map(),
    mergeOperation: 'LAST_WRITE_WINS'
  },
  lastSyncedAt: new Date(),
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
  tasks: ['task-789'],
  priority: 'ROUTINE',
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date()
};

export const mockEMRObservation = {
  resourceType: 'Observation',
  id: 'obs-123',
  status: 'final',
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '85354-9',
        display: 'Blood pressure'
      }
    ]
  },
  subject: {
    reference: 'Patient/patient-456'
  },
  effectiveDateTime: '2023-08-15T14:00:00Z',
  valueQuantity: {
    value: 120,
    unit: 'mmHg',
    system: 'http://unitsofmeasure.org',
    code: 'mm[Hg]'
  }
};

export const mockEMRPatient = {
  resourceType: 'Patient',
  id: 'patient-456',
  identifier: [
    {
      system: 'urn:oid:2.16.840.1.113883.2.4.6.3',
      value: 'MRN123456'
    }
  ],
  name: [
    {
      use: 'official',
      family: 'Smith',
      given: ['John', 'Michael']
    }
  ],
  gender: 'male',
  birthDate: '1980-01-15',
  telecom: [
    {
      system: 'phone',
      value: '555-123-4567',
      use: 'home'
    },
    {
      system: 'email',
      value: 'john.smith@email.com'
    }
  ],
  address: [
    {
      use: 'home',
      line: ['123 Main Street'],
      city: 'Anytown',
      state: 'CA',
      postalCode: '12345',
      country: 'USA'
    }
  ]
};

export const generateMockTasks = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    ...mockTask,
    id: `task-${i}`,
    title: `Task ${i}`,
    status: i % 3 === 0 ? TaskStatus.TODO : i % 3 === 1 ? TaskStatus.IN_PROGRESS : TaskStatus.COMPLETED,
    priority: i % 2 === 0 ? TaskPriority.HIGH : TaskPriority.ROUTINE
  }));
};

export const generateMockPatients = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    ...mockPatient,
    id: `patient-${i}`,
    mrn: `MRN${String(i).padStart(6, '0')}`,
    name: {
      given: [`Patient${i}`],
      family: 'Test'
    }
  }));
};
