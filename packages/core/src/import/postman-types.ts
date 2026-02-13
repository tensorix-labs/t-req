import { z } from 'zod';

export interface PostmanVariable {
  key?: string;
  value?: unknown;
  disabled?: boolean;
}

export interface PostmanAuthAttribute {
  key?: string;
  value?: string;
  disabled?: boolean;
}

export interface PostmanAuth {
  type?: string;
  bearer?: PostmanAuthAttribute[];
  basic?: PostmanAuthAttribute[];
  apikey?: PostmanAuthAttribute[];
  [key: string]: unknown;
}

export interface PostmanUrlQueryParam {
  key?: string;
  value?: string;
  disabled?: boolean;
}

export interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string | string[];
  port?: string | number;
  path?: string | string[];
  query?: PostmanUrlQueryParam[];
  hash?: string;
  variable?: PostmanVariable[];
}

export interface PostmanHeader {
  key?: string;
  value?: string;
  disabled?: boolean;
}

export interface PostmanBodyUrlencoded {
  key?: string;
  value?: string;
  disabled?: boolean;
}

export interface PostmanBodyFormData {
  key?: string;
  value?: string;
  type?: 'text' | 'file';
  src?: string | string[];
  disabled?: boolean;
}

export interface PostmanBodyFile {
  src?: string | string[];
}

export interface PostmanBodyGraphql {
  query?: string;
  variables?: string | Record<string, unknown>;
}

export interface PostmanBodyRawOptions {
  language?: string;
}

export interface PostmanRequestBody {
  mode?: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
  raw?: string;
  urlencoded?: PostmanBodyUrlencoded[];
  formdata?: PostmanBodyFormData[];
  file?: PostmanBodyFile;
  graphql?: PostmanBodyGraphql;
  options?: { raw?: PostmanBodyRawOptions };
}

export interface PostmanDescriptionObject {
  content?: string;
}

export type PostmanDescription = string | PostmanDescriptionObject;

export interface PostmanRequest {
  method?: string;
  header?: Array<PostmanHeader | string>;
  body?: PostmanRequestBody;
  auth?: PostmanAuth;
  url?: string | PostmanUrl;
  description?: PostmanDescription;
}

export interface PostmanScript {
  type?: string;
  exec?: string[];
}

export interface PostmanEvent {
  listen?: string;
  script?: PostmanScript;
  disabled?: boolean;
}

export interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
  auth?: PostmanAuth;
  event?: PostmanEvent[];
  description?: PostmanDescription;
  variable?: PostmanVariable[];
  disabled?: boolean;
}

export interface PostmanCollectionInfo {
  name?: string;
}

export interface PostmanCollection {
  info?: PostmanCollectionInfo;
  item?: PostmanItem[];
  auth?: PostmanAuth;
  variable?: PostmanVariable[];
  event?: PostmanEvent[];
}

/**
 * Envelope-only validation:
 * - ensures core collection shape exists
 * - leaves nested item/request/auth validation to converter guards
 */
export const PostmanCollectionSchema = z
  .object({
    info: z
      .object({
        name: z.string().optional()
      })
      .passthrough(),
    item: z.array(z.unknown())
  })
  .passthrough();
