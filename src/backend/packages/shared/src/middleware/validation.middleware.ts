import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import { z, ZodError, ZodSchema } from 'zod'; // ^3.21.4
import { logger } from '../logger';
import { HTTP_STATUS } from '../constants';

/**
 * Validation error response interface
 */
interface ValidationErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: Array<{
      field: string;
      message: string;
      code: string;
    }>;
    correlationId: string;
    timestamp: string;
  };
}

/**
 * Validation target types
 */
export enum ValidationTarget {
  BODY = 'body',
  QUERY = 'query',
  PARAMS = 'params',
  HEADERS = 'headers'
}

/**
 * Format Zod validation errors into user-friendly format
 */
function formatZodErrors(error: ZodError): Array<{
  field: string;
  message: string;
  code: string;
}> {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * Create validation middleware for request data
 * @param schema Zod schema to validate against
 * @param target Which part of the request to validate (body, query, params, headers)
 */
export function validate(
  schema: ZodSchema,
  target: ValidationTarget = ValidationTarget.BODY
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const correlationId = (req.headers['x-correlation-id'] as string) ||
                         (req as any).correlationId ||
                         'unknown';

    try {
      // Get data to validate based on target
      const dataToValidate = req[target];

      // Validate data against schema
      const validatedData = await schema.parseAsync(dataToValidate);

      // Replace request data with validated (and potentially transformed) data
      (req as any)[target] = validatedData;

      // Log successful validation
      logger.debug('Request validation successful', {
        correlationId,
        target,
        path: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = formatZodErrors(error);

        logger.warn('Request validation failed', {
          correlationId,
          target,
          path: req.path,
          method: req.method,
          errors: validationErrors
        });

        const response: ValidationErrorResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: validationErrors,
            correlationId,
            timestamp: new Date().toISOString()
          }
        };

        res.status(HTTP_STATUS.BAD_REQUEST).json(response);
        return;
      }

      // Handle unexpected errors
      logger.error('Unexpected validation error', {
        correlationId,
        error,
        path: req.path,
        method: req.method
      });

      const response: ValidationErrorResponse = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred during validation',
          details: [],
          correlationId,
          timestamp: new Date().toISOString()
        }
      };

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
  };
}

/**
 * Validate request body
 */
export function validateBody(schema: ZodSchema) {
  return validate(schema, ValidationTarget.BODY);
}

/**
 * Validate query parameters
 */
export function validateQuery(schema: ZodSchema) {
  return validate(schema, ValidationTarget.QUERY);
}

/**
 * Validate route parameters
 */
export function validateParams(schema: ZodSchema) {
  return validate(schema, ValidationTarget.PARAMS);
}

/**
 * Validate request headers
 */
export function validateHeaders(schema: ZodSchema) {
  return validate(schema, ValidationTarget.HEADERS);
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Pagination parameters
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['ASC', 'DESC']).optional()
  }),

  // Date range parameters
  dateRange: z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional()
  }).refine(data => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  }, {
    message: 'Start date must be before or equal to end date'
  }),

  // Search parameters
  search: z.object({
    q: z.string().min(1).max(100).optional(),
    filters: z.record(z.any()).optional()
  }),

  // ID parameter
  idParam: z.object({
    id: z.string().uuid('Invalid ID format')
  })
};

/**
 * Sanitize input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * Middleware to sanitize all request inputs
 */
export function sanitizeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.body) {
    req.body = sanitizeInput(req.body);
  }

  if (req.query) {
    req.query = sanitizeInput(req.query);
  }

  if (req.params) {
    req.params = sanitizeInput(req.params);
  }

  next();
}
