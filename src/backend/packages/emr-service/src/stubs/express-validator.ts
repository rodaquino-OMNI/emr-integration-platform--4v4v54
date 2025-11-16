/**
 * Stub for express-validator package
 * Provides request validation middleware
 */

import { Request, Response, NextFunction } from 'express';

export interface ValidationChain {
  notEmpty(): ValidationChain;
  isEmail(): ValidationChain;
  isString(): ValidationChain;
  isNumeric(): ValidationChain;
  trim(): ValidationChain;
  escape(): ValidationChain;
  optional(): ValidationChain;
}

export function body(field: string): ValidationChain {
  return {} as ValidationChain;
}

export function query(field: string): ValidationChain {
  return {} as ValidationChain;
}

export function param(field: string): ValidationChain {
  return {} as ValidationChain;
}

export function validationResult(req: Request): any {
  return {
    isEmpty: () => true,
    array: () => []
  };
}

export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
}
