import { z } from 'zod';

export const TreqVariables = z.object({
  baseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
  userId: z.number().int().positive(),
  postId: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1)
});

export type TreqVariables = z.infer<typeof TreqVariables>;

export const TreqConfig = z.object({
  variables: TreqVariables,
  defaults: z
    .object({
      timeoutMs: z.number().positive()
    })
    .optional()
});

export type TreqConfig = z.infer<typeof TreqConfig>;
