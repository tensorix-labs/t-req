import { z } from 'zod';

// ----------------------------------------------------------------------------
// User Entity
// ----------------------------------------------------------------------------

export const User = z.object({
  id: z.number(),
  name: z.string(),
  username: z.string(),
  email: z.string().email(),
  phone: z.string(),
  website: z.string(),
  address: z.object({
    street: z.string(),
    suite: z.string(),
    city: z.string(),
    zipcode: z.string(),
    geo: z.object({
      lat: z.string(),
      lng: z.string()
    })
  }),
  company: z.object({
    name: z.string(),
    catchPhrase: z.string(),
    bs: z.string()
  })
});

export type User = z.infer<typeof User>;

// ----------------------------------------------------------------------------
// API Responses
// ----------------------------------------------------------------------------

export const UserListResponse = z.array(User);
export type UserListResponse = z.infer<typeof UserListResponse>;

export const UserResponse = User;
export type UserResponse = z.infer<typeof UserResponse>;
