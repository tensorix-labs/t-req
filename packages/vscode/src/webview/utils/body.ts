import type { ExecutionResult } from '../../execution/types';
import { detectJson } from './format';
import { highlightJson } from './json-highlight';

export function formatBodyContent(result: ExecutionResult): {
  content: string;
  binary: boolean;
  highlighted: boolean;
} {
  const body = result.response.body;
  const contentType = result.response.contentType ?? '';

  if (!body) {
    return { content: '', binary: false, highlighted: false };
  }

  if (result.response.encoding === 'base64') {
    return {
      content: body,
      binary: true,
      highlighted: false
    };
  }

  if (detectJson(contentType, body)) {
    try {
      const formatted = JSON.stringify(JSON.parse(body), null, 2);
      return {
        content: highlightJson(formatted),
        binary: false,
        highlighted: true
      };
    } catch {
      return {
        content: body,
        binary: false,
        highlighted: false
      };
    }
  }

  return {
    content: body,
    binary: false,
    highlighted: false
  };
}

export function statusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-success';
  if (status >= 300 && status < 400) return 'status-redirect';
  if (status >= 400) return 'status-error';
  return 'status-neutral';
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return '[unserializable]';
  }
}
