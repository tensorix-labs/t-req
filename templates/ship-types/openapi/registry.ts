import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  CreatePostRequest,
  ErrorResponse,
  LoginRequest,
  LoginResponse,
  Post,
  PostListResponse,
  RefreshRequest,
  RefreshResponse,
  User,
  UserListResponse,
  ValidationErrorResponse
} from '../schemas';
import { registry } from './config';

// Extend Zod with OpenAPI methods (.openapi())
extendZodWithOpenApi(z);

// ----------------------------------------------------------------------------
// Auth Schemas
// ----------------------------------------------------------------------------

registry.register(
  'LoginRequest',
  LoginRequest.openapi({
    description: 'Credentials for user authentication',
    example: {
      username: 'emilys',
      password: 'emilyspass'
    }
  })
);

registry.register(
  'LoginResponse',
  LoginResponse.openapi({
    description: 'Successful authentication response with tokens',
    example: {
      id: 1,
      username: 'emilys',
      email: 'emily.johnson@example.com',
      firstName: 'Emily',
      lastName: 'Johnson',
      gender: 'female',
      image: 'https://dummyjson.com/icon/emilys/128',
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    }
  })
);

registry.register(
  'RefreshRequest',
  RefreshRequest.openapi({
    description: 'Request to refresh access token',
    example: {
      refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      expiresInMins: 30
    }
  })
);

registry.register(
  'RefreshResponse',
  RefreshResponse.openapi({
    description: 'New access and refresh tokens',
    example: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    }
  })
);

// ----------------------------------------------------------------------------
// User Schemas
// ----------------------------------------------------------------------------

registry.register(
  'User',
  User.openapi({
    description: 'User entity from JSONPlaceholder API',
    example: {
      id: 1,
      name: 'Leanne Graham',
      username: 'Bret',
      email: 'Sincere@april.biz',
      phone: '1-770-736-8031 x56442',
      website: 'hildegard.org',
      address: {
        street: 'Kulas Light',
        suite: 'Apt. 556',
        city: 'Gwenborough',
        zipcode: '92998-3874',
        geo: { lat: '-37.3159', lng: '81.1496' }
      },
      company: {
        name: 'Romaguera-Crona',
        catchPhrase: 'Multi-layered client-server neural-net',
        bs: 'harness real-time e-markets'
      }
    }
  })
);

registry.register(
  'UserListResponse',
  UserListResponse.openapi({
    description: 'Array of users'
  })
);

// ----------------------------------------------------------------------------
// Post Schemas
// ----------------------------------------------------------------------------

registry.register(
  'Post',
  Post.openapi({
    description: 'Post entity from JSONPlaceholder API',
    example: {
      id: 1,
      userId: 1,
      title: 'sunt aut facere repellat provident occaecati excepturi optio reprehenderit',
      body: 'quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto'
    }
  })
);

registry.register(
  'CreatePostRequest',
  CreatePostRequest.openapi({
    description: 'Request body for creating a new post',
    example: {
      title: 'My New Post',
      body: 'This is the content of my post.',
      userId: 1
    }
  })
);

registry.register(
  'PostListResponse',
  PostListResponse.openapi({
    description: 'Array of posts'
  })
);

// ----------------------------------------------------------------------------
// Error Schemas
// ----------------------------------------------------------------------------

registry.register(
  'ErrorResponse',
  ErrorResponse.openapi({
    description: 'Standard error response',
    example: {
      error: 'not_found',
      message: 'The requested resource was not found'
    }
  })
);

registry.register(
  'ValidationErrorResponse',
  ValidationErrorResponse.openapi({
    description: 'Validation error response with field-level details',
    example: {
      error: 'validation_error',
      message: 'Request validation failed',
      fields: {
        title: ['Title is required'],
        userId: ['Must be a positive number']
      }
    }
  })
);

// ----------------------------------------------------------------------------
// Path Parameters
// ----------------------------------------------------------------------------

export const UserIdPathParams = z.object({
  userId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      param: {
        name: 'userId',
        in: 'path',
        description: 'Unique identifier for the user',
        example: 1
      }
    })
});

export const PostIdPathParams = z.object({
  postId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({
      param: {
        name: 'postId',
        in: 'path',
        description: 'Unique identifier for the post',
        example: 1
      }
    })
});
