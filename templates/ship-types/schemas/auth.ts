import { z } from 'zod';

export const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export type LoginRequest = z.infer<typeof LoginRequest>;

export const LoginResponse = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.enum(['male', 'female']),
  image: z.string().url(),
  accessToken: z.string(),
  refreshToken: z.string()
});

export type LoginResponse = z.infer<typeof LoginResponse>;

export const RefreshRequest = z.object({
  refreshToken: z.string(),
  expiresInMins: z.number().optional()
});

export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const RefreshResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string()
});

export type RefreshResponse = z.infer<typeof RefreshResponse>;
