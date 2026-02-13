import type {
  PostmanAuth,
  PostmanEvent,
  PostmanHeader,
  PostmanItem,
  PostmanRequest,
  PostmanVariable
} from '../postman-types';

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function asObjectArray<T extends object>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is T => isObjectRecord(item));
}

export function asItemArray(value: unknown): PostmanItem[] {
  return asObjectArray<PostmanItem>(value);
}

export function asEventArray(value: unknown): PostmanEvent[] {
  return asObjectArray<PostmanEvent>(value);
}

export function asVariableArray(value: unknown): PostmanVariable[] {
  return asObjectArray<PostmanVariable>(value);
}

export function asHeaders(value: unknown): Array<PostmanHeader | string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is PostmanHeader | string => {
    return typeof item === 'string' || isObjectRecord(item);
  });
}

export function asAuth(value: unknown): PostmanAuth | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }
  return value as PostmanAuth;
}

export function asRequest(value: unknown): PostmanRequest | string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (isObjectRecord(value)) {
    return value as PostmanRequest;
  }
  return undefined;
}
