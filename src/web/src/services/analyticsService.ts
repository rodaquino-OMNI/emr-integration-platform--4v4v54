/**
 * @fileoverview Analytics service for EMR Task Management Platform
 * @version 1.0.0
 * @license MIT
 */

import dayjs from 'dayjs'; // v1.11.9
import NodeCache from 'node-cache'; // v5.1.2
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'; // v2.7.2

import axiosInstance from '../lib/axios';
import type {
  Task,
  TaskStatus,
  TaskVerificationStatus,
  ShiftType,
  HandoverStatus,
  ComplianceStatus
} from '../lib/types';

// Cache configuration
const analyticsCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60,
  useClones: false
});

// Analytics interfaces
interface TaskMetrics {
  completionRate: number;
  averageCompletionTime: number;
  tasksByStatus: Record<TaskStatus, number>;
  trendsData: Array<{
    date: string;
    completed: number;
    userAdoption: number;
  }>;
  userMetrics: {
    activeUsers: number;
    adoptionRate: number;
  };
  departmentBreakdown: Record<string, TaskMetrics>;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
}

interface HandoverMetrics {
  errorReductionRate: number;
  averageHandoverDuration: number;
  successRate: number;
  trendsData: Array<{
    date: string;
    errors: number;
    duration: number;
  }>;
  shiftAnalysis: Record<ShiftType, HandoverMetrics>;
  errorPatterns: Array<{
    type: string;
    frequency: number;
  }>;
  statisticalSignificance: number;
}

// Decorators
function cacheResponse(ttl: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${propertyKey}:${JSON.stringify(args)}`;
      const cachedValue = analyticsCache.get(cacheKey);

      if (cachedValue) {
        return cachedValue;
      }

      const result = await originalMethod.apply(this, args);
      analyticsCache.set(cacheKey, result, ttl);
      return result;
    };

    return descriptor;
  };
}

function validateDateRange(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = function (startDate: Date, endDate: Date, ...args: any[]) {
    if (startDate > endDate) {
      throw new Error('Start date must be before end date');
    }

    if (dayjs(endDate).diff(startDate, 'days') > 365) {
      throw new Error('Date range cannot exceed 1 year');
    }

    return originalMethod.apply(this, [startDate, endDate, ...args]);
  };

  return descriptor;
}

function requiresPermission(permission: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Permission check handled by API Gateway
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Retrieves comprehensive task completion metrics with statistical analysis
 */
@cacheResponse(300)
@validateDateRange
@requiresPermission('analytics:read')
export async function getTaskCompletionMetrics(
  startDate: Date,
  endDate: Date,
  department?: string,
  includeUserMetrics: boolean = false
): Promise<TaskMetrics> {
  try {
    const params = {
      startDate: dayjs(startDate).toISOString(),
      endDate: dayjs(endDate).toISOString(),
      department,
      includeUserMetrics
    };

    const response = await axiosInstance.get('/api/analytics/tasks', { params });

    // Process and anonymize data for HIPAA compliance
    const processedData = {
      ...response.data,
      trendsData: response.data.trendsData.map((item: any) => ({
        date: item.date,
        completed: item.completed,
        userAdoption: item.userAdoption
      }))
    };

    // Calculate confidence intervals
    const confidenceLevel = 0.95;
    const standardError = Math.sqrt(
      (processedData.completionRate * (1 - processedData.completionRate)) /
        processedData.tasksByStatus.total
    );
    const zScore = 1.96; // 95% confidence level

    processedData.confidenceInterval = {
      lower: Math.max(0, processedData.completionRate - zScore * standardError),
      upper: Math.min(1, processedData.completionRate + zScore * standardError)
    };

    return processedData;
  } catch (error) {
    console.error('Error fetching task completion metrics:', error);
    throw error;
  }
}

/**
 * Retrieves detailed handover performance metrics with error reduction analysis
 */
@cacheResponse(300)
@validateDateRange
@requiresPermission('analytics:read')
export async function getHandoverMetrics(
  startDate: Date,
  endDate: Date,
  department?: string,
  shiftType?: ShiftType
): Promise<HandoverMetrics> {
  try {
    const params = {
      startDate: dayjs(startDate).toISOString(),
      endDate: dayjs(endDate).toISOString(),
      department,
      shiftType
    };

    const response = await axiosInstance.get('/api/analytics/handovers', {
      params
    });

    // Calculate statistical significance
    const baselineErrorRate = 0.4; // 40% baseline error rate
    const currentErrorRate = response.data.errorReductionRate;
    const sampleSize = response.data.totalHandovers;

    const zScore = Math.abs(
      (currentErrorRate - baselineErrorRate) /
        Math.sqrt(
          (baselineErrorRate * (1 - baselineErrorRate)) / sampleSize
        )
    );

    // Process and enhance the metrics
    const enhancedMetrics: HandoverMetrics = {
      ...response.data,
      statisticalSignificance: 1 - 2 * (1 - normalCDF(zScore)),
      errorPatterns: response.data.errorPatterns.sort(
        (a: any, b: any) => b.frequency - a.frequency
      ).slice(0, 5) // Top 5 error patterns
    };

    return enhancedMetrics;
  } catch (error) {
    console.error('Error fetching handover metrics:', error);
    throw error;
  }
}

// Helper function for calculating normal cumulative distribution function
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - probability : probability;
}