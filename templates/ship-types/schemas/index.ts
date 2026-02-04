/**
 * Typed Collection Schemas
 *
 * Zod schemas as the source of truth for API contracts.
 * Types are inferred automatically via z.infer<typeof Schema>.
 *
 * Usage:
 *   import { User, Post, LoginResponse } from './schemas';
 *
 *   const user = User.parse(await response.json());  // Validated + typed
 */

export * from './auth';
export * from './config';
export * from './error';
export * from './post';
export * from './user';
