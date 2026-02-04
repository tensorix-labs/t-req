import { describe, expect, test } from 'bun:test';
import { client } from '../client';
import { User, UserListResponse } from '../schemas';

describe('Users API', () => {
  describe('GET /users', () => {
    test('returns a list of users matching schema', async () => {
      const response = await client.run('./collection/users/list.http');

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      // Schema validation - fails with clear error if shape doesn't match
      const users = UserListResponse.parse(await response.json());

      expect(users.length).toBeGreaterThan(0);
      expect(users[0]).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String)
      });
    });
  });

  describe('GET /users/:id', () => {
    test('returns a single user matching schema', async () => {
      const response = await client.run('./collection/users/get.http', {
        variables: { userId: 1 }
      });

      expect(response.ok).toBe(true);

      // Validated and typed as User
      const user = User.parse(await response.json());

      expect(user.id).toBe(1);
      expect(user.email).toContain('@');
      expect(user.address.city).toBeDefined();
    });

    test('returns 404 for non-existent user', async () => {
      const response = await client.run('./collection/users/get.http', {
        variables: { userId: 99999 }
      });

      expect(response.status).toBe(404);
    });
  });
});
