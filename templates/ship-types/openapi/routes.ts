import { registry } from './config';
import { PostIdPathParams, UserIdPathParams } from './registry';

// ----------------------------------------------------------------------------
// Auth Routes (DummyJSON)
// ----------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  summary: 'User login',
  description: 'Authenticate a user and receive access/refresh tokens',
  tags: ['Auth'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LoginRequest' }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Successful authentication',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/LoginResponse' }
        }
      }
    },
    400: {
      description: 'Invalid credentials',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' }
        }
      }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  summary: 'Refresh access token',
  description: 'Exchange a refresh token for new access/refresh tokens',
  tags: ['Auth'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RefreshRequest' }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Tokens refreshed successfully',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RefreshResponse' }
        }
      }
    },
    401: {
      description: 'Invalid or expired refresh token',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' }
        }
      }
    }
  }
});

// ----------------------------------------------------------------------------
// User Routes (JSONPlaceholder)
// ----------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/users',
  summary: 'List all users',
  description: 'Retrieve a list of all users',
  tags: ['Users'],
  responses: {
    200: {
      description: 'List of users',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/UserListResponse' }
        }
      }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/users/{userId}',
  summary: 'Get user by ID',
  description: 'Retrieve a single user by their unique identifier',
  tags: ['Users'],
  request: {
    params: UserIdPathParams
  },
  responses: {
    200: {
      description: 'User found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/User' }
        }
      }
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' }
        }
      }
    }
  }
});

// ----------------------------------------------------------------------------
// Post Routes (JSONPlaceholder)
// ----------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/posts',
  summary: 'List all posts',
  description: 'Retrieve a list of all posts',
  tags: ['Posts'],
  responses: {
    200: {
      description: 'List of posts',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/PostListResponse' }
        }
      }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/posts/{postId}',
  summary: 'Get post by ID',
  description: 'Retrieve a single post by its unique identifier',
  tags: ['Posts'],
  request: {
    params: PostIdPathParams
  },
  responses: {
    200: {
      description: 'Post found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Post' }
        }
      }
    },
    404: {
      description: 'Post not found',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' }
        }
      }
    }
  }
});

registry.registerPath({
  method: 'post',
  path: '/posts',
  summary: 'Create a new post',
  description: 'Create a new post with title, body, and userId',
  tags: ['Posts'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreatePostRequest' }
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Post created successfully',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Post' }
        }
      }
    },
    400: {
      description: 'Invalid request body',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ValidationErrorResponse' }
        }
      }
    }
  }
});
