import { describe, it, expect } from '@jest/globals';
import {
  formatDate,
  formatTime,
  formatDateTime,
  calculateDuration,
  formatDuration,
  formatPriority,
  formatStatus,
  truncateText,
  debounce,
  throttle,
  deepClone,
  deepEqual,
  generateId,
  formatEMRData
} from '../../src/lib/utils';

describe('Utility Functions', () => {
  describe('Date Formatting', () => {
    it('should format date correctly', () => {
      const date = new Date('2023-08-15T14:30:00');
      expect(formatDate(date)).toBe('08/15/2023');
      expect(formatDate(date, 'long')).toBe('August 15, 2023');
      expect(formatDate(date, 'short')).toBe('Aug 15');
    });

    it('should format time correctly', () => {
      const date = new Date('2023-08-15T14:30:00');
      expect(formatTime(date)).toBe('2:30 PM');
      expect(formatTime(date, true)).toBe('14:30');
    });

    it('should format date and time together', () => {
      const date = new Date('2023-08-15T14:30:00');
      expect(formatDateTime(date)).toBe('08/15/2023 2:30 PM');
    });

    it('should handle invalid dates', () => {
      expect(formatDate(null as any)).toBe('Invalid Date');
      expect(formatDate(undefined as any)).toBe('Invalid Date');
    });
  });

  describe('Duration Calculations', () => {
    it('should calculate duration between dates', () => {
      const start = new Date('2023-08-15T10:00:00');
      const end = new Date('2023-08-15T14:30:00');
      const duration = calculateDuration(start, end);

      expect(duration.hours).toBe(4);
      expect(duration.minutes).toBe(30);
    });

    it('should format duration as string', () => {
      expect(formatDuration({ hours: 2, minutes: 30 })).toBe('2h 30m');
      expect(formatDuration({ hours: 0, minutes: 45 })).toBe('45m');
      expect(formatDuration({ hours: 1, minutes: 0 })).toBe('1h');
    });
  });

  describe('Status Formatting', () => {
    it('should format task priority with color', () => {
      expect(formatPriority('CRITICAL')).toEqual({
        label: 'Critical',
        color: 'red',
        icon: 'alert-circle'
      });

      expect(formatPriority('HIGH')).toEqual({
        label: 'High',
        color: 'orange',
        icon: 'arrow-up'
      });

      expect(formatPriority('ROUTINE')).toEqual({
        label: 'Routine',
        color: 'blue',
        icon: 'check-circle'
      });
    });

    it('should format task status with color', () => {
      expect(formatStatus('TODO')).toEqual({
        label: 'To Do',
        color: 'gray',
        icon: 'circle'
      });

      expect(formatStatus('IN_PROGRESS')).toEqual({
        label: 'In Progress',
        color: 'blue',
        icon: 'activity'
      });

      expect(formatStatus('COMPLETED')).toEqual({
        label: 'Completed',
        color: 'green',
        icon: 'check-circle'
      });
    });
  });

  describe('Text Utilities', () => {
    it('should truncate long text', () => {
      const longText = 'This is a very long text that needs to be truncated';
      expect(truncateText(longText, 20)).toBe('This is a very long...');
      expect(truncateText(longText, 50)).toBe(longText);
    });

    it('should handle text shorter than limit', () => {
      const shortText = 'Short text';
      expect(truncateText(shortText, 20)).toBe(shortText);
    });
  });

  describe('Function Utilities', () => {
    it('should debounce function calls', (done) => {
      let callCount = 0;
      const debouncedFn = debounce(() => {
        callCount++;
      }, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 150);
    });

    it('should throttle function calls', (done) => {
      let callCount = 0;
      const throttledFn = throttle(() => {
        callCount++;
      }, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      setTimeout(() => {
        throttledFn();
      }, 50);

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 150);
    });
  });

  describe('Object Utilities', () => {
    it('should deep clone objects', () => {
      const obj = {
        a: 1,
        b: { c: 2, d: { e: 3 } },
        f: [1, 2, { g: 4 }]
      };

      const cloned = deepClone(obj);

      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
      expect(cloned.b.d).not.toBe(obj.b.d);
    });

    it('should compare objects deeply', () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { a: 1, b: { c: 2 } };
      const obj3 = { a: 1, b: { c: 3 } };

      expect(deepEqual(obj1, obj2)).toBe(true);
      expect(deepEqual(obj1, obj3)).toBe(false);
    });

    it('should handle null and undefined in deep equal', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, undefined)).toBe(false);
      expect(deepEqual({}, null)).toBe(false);
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('should generate IDs with prefix', () => {
      const id = generateId('task-');
      expect(id).toMatch(/^task-/);
    });
  });

  describe('EMR Data Formatting', () => {
    it('should format EMR data for display', () => {
      const emrData = {
        system: 'EPIC',
        patientId: 'P123456',
        resourceType: 'Patient',
        data: {
          name: [{ given: ['John'], family: 'Doe' }],
          birthDate: '1980-01-01'
        }
      };

      const formatted = formatEMRData(emrData);

      expect(formatted.patientName).toBe('John Doe');
      expect(formatted.birthDate).toBe('01/01/1980');
      expect(formatted.system).toBe('Epic');
    });

    it('should handle missing EMR data fields', () => {
      const emrData = {
        system: 'EPIC',
        patientId: 'P123456',
        data: {}
      };

      const formatted = formatEMRData(emrData);

      expect(formatted.patientName).toBe('Unknown');
    });

    it('should sanitize PHI in EMR data', () => {
      const emrData = {
        system: 'EPIC',
        patientId: 'P123456',
        data: {
          ssn: '123-45-6789',
          name: [{ given: ['John'], family: 'Doe' }]
        }
      };

      const formatted = formatEMRData(emrData, { sanitizePHI: true });

      expect(formatted.ssn).toBe('XXX-XX-6789');
    });
  });
});
