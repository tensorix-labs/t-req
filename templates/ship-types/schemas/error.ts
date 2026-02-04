import { z } from 'zod';

export const ErrorResponse = z.object({
  error: z.string(),
  message: z.string()
});

export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const ValidationErrorResponse = z.object({
  error: z.literal('validation_error'),
  message: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional()
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponse>;
