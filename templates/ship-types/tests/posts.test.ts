import { describe, expect, test } from 'bun:test';
import { client } from '../client';
import { CreatePostRequest, CreatePostResponse, Post, PostListResponse } from '../schemas';

describe('Posts API', () => {
  describe('GET /posts', () => {
    test('returns posts matching schema', async () => {
      const response = await client.run('./collection/posts/list.http');

      expect(response.ok).toBe(true);

      const posts = PostListResponse.parse(await response.json());

      expect(posts.length).toBeGreaterThan(0);
      expect(posts[0]).toMatchObject({
        id: expect.any(Number),
        userId: expect.any(Number),
        title: expect.any(String),
        body: expect.any(String)
      });
    });
  });

  describe('POST /posts', () => {
    test('creates a post and returns matching schema', async () => {
      // Validate request before sending (optional but demonstrates the pattern)
      const requestBody: CreatePostRequest = {
        title: 'Test Post',
        body: 'This is a test post created by the typed collection example.',
        userId: 1
      };
      CreatePostRequest.parse(requestBody); // Throws if invalid

      const response = await client.run('./collection/posts/create.http', {
        variables: requestBody
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);

      // Validate response
      const post = CreatePostResponse.parse(await response.json());

      expect(post.id).toBeDefined();
      expect(post.title).toBe(requestBody.title);
      expect(post.body).toBe(requestBody.body);
      expect(post.userId).toBe(requestBody.userId);
    });

    test('request validation catches invalid data', () => {
      const invalidRequest = {
        title: '', // Empty - violates min(1)
        body: 'Test body',
        userId: -1 // Negative - violates positive()
      };

      expect(() => CreatePostRequest.parse(invalidRequest)).toThrow();
    });
  });
});
