import React, { useState, useCallback, useMemo } from 'react'; // ^18.0.0
import clsx from 'clsx'; // ^2.0.0
import { Loading } from '../common/Loading';
import { Button } from '../common/Button';

// Medical data format types for healthcare-specific display
type MedicalDataFormat = 'vitals' | 'medication' | 'lab' | 'datetime' | 'patient' | 'none';

interface TableColumn {
  field: string;
  header: string;
  sortable?: boolean;
  width?: string;
  cellAlignment?: 'left' | 'center' | 'right';
  isCritical?: boolean;
  medicalFormat?: MedicalDataFormat;
  accessibilityLabel?: string;
  render?: (row: any) => React.ReactNode;
}

interface TableProps {
  columns: TableColumn[];
  data: any[];
  loading?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  pageSize?: number;
  currentPage?: number;
  totalItems?: number;
  stickyHeader?: boolean;
  highlightCritical?: boolean;
  medicalDataConfig?: Record<MedicalDataFormat, (value: any) => string>;
  accessibilityDescriptions?: {
    tableSummary?: string;
    sortDescription?: string;
    paginationDescription?: string;
  };
  onPageChange?: (page: number) => void;
  onSort?: (field: string, direction: 'asc' | 'desc') => void;
  className?: string;
}

const getTableStyles = (
  className?: string,
  isCritical?: boolean,
  highContrast?: boolean
): string => {
  return clsx(
    'w-full overflow-x-auto rounded-lg border border-gray-200',
    'focus-within:ring-2 focus-within:ring-[#0066CC]',
    {
      'bg-red-50 border-red-200': isCritical,
      'bg-white border-black border-2 text-black': highContrast,
    },
    className
  );
};

export const Table: React.FC<TableProps> = ({
  columns,
  data,
  loading = false,
  sortable = true,
  pagination = true,
  pageSize = 10,
  currentPage = 1,
  totalItems = 0,
  stickyHeader = true,
  highlightCritical = true,
  medicalDataConfig,
  accessibilityDescriptions,
  onPageChange,
  onSort,
  className,
}) => {
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Format medical data based on type
  const formatMedicalData = useCallback((value: any, format?: MedicalDataFormat) => {
    if (!format || !medicalDataConfig?.[format]) return value;
    return medicalDataConfig[format](value);
  }, [medicalDataConfig]);

  // Handle column sorting with medical data considerations
  const handleSort = useCallback((field: string, medicalFormat?: MedicalDataFormat) => {
    if (!sortable) return;

    const newDirection = field === sortField && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
    onSort?.(field, newDirection);

    // Announce sort change to screen readers
    const sortAnnouncement = `Table sorted by ${field} in ${newDirection}ending order`;
    const announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.className = 'sr-only';
    announcer.textContent = sortAnnouncement;
    document.body.appendChild(announcer);
    setTimeout(() => document.body.removeChild(announcer), 1000);
  }, [sortable, sortField, sortDirection, onSort]);

  // Render pagination controls with enhanced accessibility
  const renderPagination = useMemo(() => {
    if (!pagination || !totalItems) return null;

    const totalPages = Math.ceil(totalItems / pageSize);
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

    return (
      <div 
        className="mt-4 flex items-center justify-between px-4 py-3 sm:px-6"
        role="navigation"
        aria-label="Pagination"
      >
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={currentPage === 1}
            onClick={() => onPageChange?.(currentPage - 1)}
            ariaLabel="Previous page"
          >
            Previous
          </Button>
          
          {pages.map((page) => (
            <Button
              key={page}
              size="sm"
              variant={page === currentPage ? 'primary' : 'secondary'}
              onClick={() => onPageChange?.(page)}
              ariaLabel={`Page ${page}`}
              ariaDescribedBy={page === currentPage ? 'current-page' : undefined}
            >
              {page}
            </Button>
          ))}
          
          <Button
            size="sm"
            variant="secondary"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange?.(currentPage + 1)}
            ariaLabel="Next page"
          >
            Next
          </Button>
        </div>
        
        <div className="text-sm text-gray-700">
          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} results
        </div>
      </div>
    );
  }, [pagination, totalItems, pageSize, currentPage, onPageChange]);

  if (loading) {
    return (
      <div className="w-full py-8">
        <Loading 
          size="lg"
          text="Loading medical data..."
          reducedMotion={true}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div 
        className={getTableStyles(className)}
        role="table"
        aria-label={accessibilityDescriptions?.tableSummary}
        aria-busy={loading}
      >
        <table className="min-w-full divide-y divide-gray-200">
          <thead className={clsx(
            'bg-gray-50 text-left text-sm font-semibold text-gray-600',
            { 'sticky top-0': stickyHeader }
          )}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.field}
                  className={clsx(
                    'px-6 py-4 whitespace-nowrap',
                    column.sortable && sortable && 'cursor-pointer select-none',
                    column.width,
                    `text-${column.cellAlignment || 'left'}`
                  )}
                  onClick={() => column.sortable && handleSort(column.field, column.medicalFormat)}
                  scope="col"
                  aria-sort={
                    column.field === sortField
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.header}</span>
                    {column.sortable && sortable && (
                      <span className="sr-only">
                        {column.field === sortField
                          ? `, sorted ${sortDirection === 'asc' ? 'ascending' : 'descending'}`
                          : ', select to sort'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={clsx(
                  'hover:bg-gray-50',
                  { 'bg-red-50': highlightCritical && columns.some(col => col.isCritical && row[col.field]) }
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.field}
                    className={clsx(
                      'px-6 py-4 whitespace-nowrap text-sm',
                      `text-${column.cellAlignment || 'left'}`,
                      {
                        'text-red-900 font-medium': column.isCritical && row[column.field],
                        'font-medium': column.medicalFormat === 'patient'
                      }
                    )}
                  >
                    {column.render
                      ? column.render(row)
                      : formatMedicalData(row[column.field], column.medicalFormat)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {renderPagination}
    </div>
  );
};

Table.defaultProps = {
  loading: false,
  sortable: true,
  pagination: true,
  pageSize: 10,
  currentPage: 1,
  stickyHeader: true,
  highlightCritical: true,
};

export default Table;