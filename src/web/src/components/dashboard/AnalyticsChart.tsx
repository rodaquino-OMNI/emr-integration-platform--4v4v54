/**
 * @fileoverview HIPAA-compliant analytics chart component for EMR task management
 * @version 1.0.0
 * @license MIT
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { Chart, ChartConfiguration, registerables } from 'chart.js'; // v4.x
import { format, parseISO } from 'date-fns'; // v2.x
import debounce from 'lodash/debounce'; // v4.x

import { useAnalytics } from '../../hooks/useAnalytics';
import Loading from '../common/Loading';
import ErrorBoundary from '../common/ErrorBoundary';
import { THEME } from '../../lib/constants';

// Register Chart.js components
Chart.register(...registerables);

// Constants for chart configuration
const CHART_UPDATE_DEBOUNCE = 250;
const CHART_ANIMATION_DURATION = 750;
const MIN_DATA_POINTS = 2;

interface AnalyticsChartProps {
  timeRange: string;
  metrics: string[];
  chartType: 'line' | 'bar' | 'pie';
  className?: string;
  isAccessible?: boolean;
  onDataUpdate?: (data: any) => void;
}

/**
 * Formats analytics data for chart rendering with HIPAA compliance
 */
const formatChartData = (data: any, metrics: string[]) => {
  if (!data || !metrics.length) return null;

  // Sanitize and format data for display
  const sanitizedData = metrics.map(metric => ({
    label: metric,
    data: data[metric]?.map((point: any) => ({
      x: format(parseISO(point.timestamp), 'MM/dd HH:mm'),
      y: Number(point.value).toFixed(2)
    })) || []
  }));

  return {
    labels: sanitizedData[0]?.data.map((point: any) => point.x) || [],
    datasets: sanitizedData.map((dataset, index) => ({
      label: dataset.label,
      data: dataset.data.map((point: any) => point.y),
      borderColor: THEME.COLORS.PRIMARY[500 + (index * 100)],
      backgroundColor: `${THEME.COLORS.PRIMARY[500 + (index * 100)]}80`,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.4
    }))
  };
};

/**
 * Generates accessible Chart.js configuration
 */
const getChartConfig = (
  chartType: string,
  data: any,
  isAccessible: boolean
): ChartConfiguration => {
  return {
    type: chartType,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: CHART_ANIMATION_DURATION,
        easing: 'easeInOutQuart'
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: {
              family: THEME.TYPOGRAPHY.FONT_FAMILY.PRIMARY
            }
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: THEME.COLORS.BACKGROUND.DARK,
          titleFont: {
            family: THEME.TYPOGRAPHY.FONT_FAMILY.PRIMARY,
            size: 14
          },
          bodyFont: {
            family: THEME.TYPOGRAPHY.FONT_FAMILY.PRIMARY,
            size: 12
          },
          padding: 12,
          cornerRadius: 4
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false
          },
          ticks: {
            font: {
              family: THEME.TYPOGRAPHY.FONT_FAMILY.PRIMARY
            }
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: {
            color: THEME.COLORS.PRIMARY[100]
          },
          ticks: {
            font: {
              family: THEME.TYPOGRAPHY.FONT_FAMILY.PRIMARY
            }
          }
        }
      },
      ...(isAccessible && {
        accessibility: {
          enabled: true,
          announceNewData: {
            enabled: true,
            announcementStyle: 'assertive'
          }
        }
      })
    }
  };
};

/**
 * Analytics chart component with HIPAA compliance and accessibility features
 */
export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  timeRange,
  metrics,
  chartType,
  className = '',
  isAccessible = true,
  onDataUpdate
}) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const { data, loading, error, refetch } = useAnalytics({
    dateRange: {
      start: new Date(Date.now() - parseInt(timeRange) * 60 * 60 * 1000),
      end: new Date()
    }
  });

  // Format chart data with memoization
  const chartData = useMemo(() => {
    return formatChartData(data, metrics);
  }, [data, metrics]);

  // Update chart with debouncing
  const updateChart = debounce(() => {
    if (chartInstance.current && chartData) {
      chartInstance.current.data = chartData;
      chartInstance.current.update('none');
      onDataUpdate?.(chartData);
    }
  }, CHART_UPDATE_DEBOUNCE);

  // Initialize and cleanup chart
  useEffect(() => {
    if (!chartRef.current || !chartData) return;

    // Destroy existing chart instance
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Create new chart instance
    const ctx = chartRef.current.getContext('2d');
    if (ctx) {
      chartInstance.current = new Chart(
        ctx,
        getChartConfig(chartType, chartData, isAccessible)
      );
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [chartType, chartData, isAccessible]);

  // Handle data updates
  useEffect(() => {
    updateChart();
  }, [chartData]);

  // Handle loading state
  if (loading) {
    return (
      <div className={`${className} loadingContainer`}>
        <Loading
          size="lg"
          text="Loading analytics data..."
          variant="spinner"
          isAccessible={isAccessible}
        />
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className={`${className} errorContainer`} role="alert">
        <p>Error loading analytics data</p>
        <button
          onClick={() => refetch()}
          className="retryButton"
          aria-label="Retry loading analytics data"
        >
          Retry
        </button>
      </div>
    );
  }

  // Handle insufficient data
  if (!chartData || chartData.labels.length < MIN_DATA_POINTS) {
    return (
      <div className={`${className} noDataContainer`} role="alert">
        <p>Insufficient data for analysis</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className={`${className} errorContainer`} role="alert">
          <p>Error rendering analytics chart</p>
        </div>
      }
    >
      <div className={`${className} chartContainer`}>
        <canvas
          ref={chartRef}
          role="img"
          aria-label={`Analytics chart showing ${metrics.join(', ')}`}
          className="chartCanvas"
        />
        {isAccessible && (
          <div className="sr-only">
            {/* Screen reader description of chart data */}
            <p>
              Chart showing {metrics.join(', ')} data for the last {timeRange} hours
            </p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AnalyticsChart;