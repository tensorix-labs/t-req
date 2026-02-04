import { z } from 'zod';

export const Post = z.object({
  id: z.number(),
  userId: z.number(),
  title: z.string(),
  body: z.string()
});

export type Post = z.infer<typeof Post>;

export const CreatePostRequest = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  userId: z.number().positive()
});

export type CreatePostRequest = z.infer<typeof CreatePostRequest>;

export const PostListResponse = z.array(Post);
export type PostListResponse = z.infer<typeof PostListResponse>;

export const PostResponse = Post;
export type PostResponse = z.infer<typeof PostResponse>;

export const CreatePostResponse = Post;
export type CreatePostResponse = z.infer<typeof CreatePostResponse>;
