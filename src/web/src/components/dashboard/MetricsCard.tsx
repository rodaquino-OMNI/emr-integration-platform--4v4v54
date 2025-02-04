import React, { useEffect, useMemo } from 'react';
import classNames from 'classnames'; // v2.x
import { Chart } from 'chart.js'; // v4.x
import Card from '../common/Card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { THEME } from '../../lib/constants';

// Metric type definition
export enum MetricType {
  COMPLETION_RATE = 'COMPLETION_RATE',
  VERIFICATION_ACCURACY = 'VERIFICATION_ACCURACY',
  HANDOVER_EFFICIENCY = 'HANDOVER_EFFICIENCY',
  SYSTEM_UPTIME = 'SYSTEM_UPTIME',
  SYNC_RESOLUTION_TIME = 'SYNC_RESOLUTION_TIME',
  USER_ADOPTION_RATE = 'USER_ADOPTION_RATE'
}

// Threshold configuration interface
interface MetricThresholds {
  warning: number;
  critical: number;
  target: number;
}

// Component props interface
interface MetricsCardProps {
  title: string;
  metricType: MetricType;
  className?: string;
  refreshInterval?: number;
  showTrend?: boolean;
  thresholds?: MetricThresholds;
}

// Default thresholds by metric type
const DEFAULT_THRESHOLDS: Record<MetricType, MetricThresholds> = {
  [MetricType.COMPLETION_RATE]: {
    warning: 85,
    critical: 75,
    target: 90
  },
  [MetricType.VERIFICATION_ACCURACY]: {
    warning: 95,
    critical: 90,
    target: 100
  },
  [MetricType.HANDOVER_EFFICIENCY]: {
    warning: 30,
    critical: 20,
    target: 40
  },
  [MetricType.SYSTEM_UPTIME]: {
    warning: 99.9,
    critical: 99.5,
    target: 99.99
  },
  [MetricType.SYNC_RESOLUTION_TIME]: {
    warning: 750,
    critical: 1000,
    target: 500
  },
  [MetricType.USER_ADOPTION_RATE]: {
    warning: 80,
    critical: 70,
    target: 90
  }
};

const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  metricType,
  className,
  refreshInterval = 30000,
  showTrend = true,
  thresholds = DEFAULT_THRESHOLDS[metricType]
}) => {
  // Analytics hook for fetching metric data
  const { taskMetrics, handoverMetrics, emrStats, userMetrics, isLoading, error } = useAnalytics({
    dateRange: {
      start: new Date(Date.now() - 86400000), // Last 24 hours
      end: new Date()
    },
    refreshInterval
  });

  // Calculate current metric value based on type
  const currentValue = useMemo(() => {
    if (!taskMetrics || !handoverMetrics || !emrStats || !userMetrics) return null;

    switch (metricType) {
      case MetricType.COMPLETION_RATE:
        return taskMetrics.completionRate * 100;
      case MetricType.VERIFICATION_ACCURACY:
        return emrStats.verificationAccuracy * 100;
      case MetricType.HANDOVER_EFFICIENCY:
        return handoverMetrics.errorReductionRate * 100;
      case MetricType.SYSTEM_UPTIME:
        return 99.99; // Example static value
      case MetricType.SYNC_RESOLUTION_TIME:
        return taskMetrics.averageCompletionTime;
      case MetricType.USER_ADOPTION_RATE:
        return userMetrics.adoptionRate * 100;
      default:
        return null;
    }
  }, [taskMetrics, handoverMetrics, emrStats, userMetrics, metricType]);

  // Determine status based on thresholds
  const getStatusColor = (value: number): string => {
    if (value >= thresholds.target) return THEME.COLORS.SUCCESS[500];
    if (value <= thresholds.critical) return THEME.COLORS.CRITICAL[500];
    if (value <= thresholds.warning) return THEME.COLORS.PRIMARY[500];
    return THEME.COLORS.SUCCESS[500];
  };

  // Format value based on metric type
  const formatValue = (value: number): string => {
    switch (metricType) {
      case MetricType.SYNC_RESOLUTION_TIME:
        return `${value}ms`;
      case MetricType.SYSTEM_UPTIME:
        return `${value.toFixed(3)}%`;
      default:
        return `${value.toFixed(1)}%`;
    }
  };

  // Initialize trend chart
  useEffect(() => {
    if (!showTrend || !currentValue) return;

    const ctx = document.getElementById(`trend-${metricType}`) as HTMLCanvasElement;
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${23 - i}h ago`),
        datasets: [{
          label: title,
          data: Array.from({ length: 24 }, () => currentValue + (Math.random() * 10 - 5)),
          borderColor: getStatusColor(currentValue),
          tension: 0.4,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            suggestedMin: Math.max(0, currentValue - 20),
            suggestedMax: currentValue + 20
          }
        }
      }
    });

    return () => chart.destroy();
  }, [currentValue, metricType, showTrend, title]);

  return (
    <Card
      title={title}
      className={classNames(
        'min-h-[200px]',
        'transition-all duration-300',
        className
      )}
      loading={isLoading}
      error={error?.message}
    >
      <div className="flex flex-col h-full">
        {currentValue !== null && (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl font-bold" style={{ color: getStatusColor(currentValue) }}>
                {formatValue(currentValue)}
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Target: {formatValue(thresholds.target)}</span>
                {currentValue >= thresholds.target && (
                  <span className="px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full">
                    On Track
                  </span>
                )}
              </div>
            </div>
            {showTrend && (
              <div className="flex-grow min-h-[100px]">
                <canvas id={`trend-${metricType}`} />
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

export type { MetricsCardProps, MetricThresholds };
export { MetricType };
export default React.memo(MetricsCard);