import { normalizeJsonc } from '../config/jsonc';
import { loadFileBody } from '../file-loader';
import { buildFormData, buildUrlEncoded, hasFileFields } from '../form-data-builder';
import type { IO } from '../runtime/types';
import type { ExecuteRequest, FormField } from '../types';
import { setOptional } from '../utils/optional';

function getHeaderValue(headers: Record<string, string>, key: string): string | undefined {
  const direct = headers[key];
  if (direct !== undefined) {
    return direct;
  }

  const loweredKey = key.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === loweredKey) {
      return value;
    }
  }

  return undefined;
}

function contentTypeIndicatesJson(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }
  const normalized = contentType.toLowerCase();
  return normalized.includes('/json') || normalized.includes('+json');
}

function bodyLooksLikeJson(body: string): boolean {
  const trimmed = body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function maybeNormalizeJsonBody(headers: Record<string, string>, body: string): string {
  const contentType = getHeaderValue(headers, 'content-type');
  if (!contentTypeIndicatesJson(contentType) && !bodyLooksLikeJson(body)) {
    return body;
  }

  try {
    return normalizeJsonc(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON/JSONC body: ${reason}`);
  }
}

export async function compileExecuteRequest(
  interpolated: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    bodyFile?: { path: string };
    formData?: FormField[];
  },
  ctx: { basePath: string; io?: IO; headerDefaults?: Record<string, string> }
): Promise<{ executeRequest: ExecuteRequest }> {
  const headers: Record<string, string> = {
    ...(ctx.headerDefaults ?? {}),
    ...(interpolated.headers ?? {})
  };

  let body: ExecuteRequest['body'] =
    interpolated.body !== undefined
      ? maybeNormalizeJsonBody(headers, interpolated.body)
      : undefined;

  if (interpolated.bodyFile) {
    const loadedFile = await loadFileBody(
      interpolated.bodyFile.path,
      setOptional<{ basePath: string; io?: IO }>({ basePath: ctx.basePath })
        .ifDefined('io', ctx.io)
        .build()
    );

    body = loadedFile.content;

    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = loadedFile.mimeType;
    }
  } else if (interpolated.formData && interpolated.formData.length > 0) {
    const hasFiles = hasFileFields(interpolated.formData);

    if (hasFiles) {
      body = await buildFormData(
        interpolated.formData,
        setOptional<{ basePath: string; io?: IO }>({ basePath: ctx.basePath })
          .ifDefined('io', ctx.io)
          .build()
      );
      delete headers['Content-Type'];
      delete headers['content-type'];
    } else {
      body = buildUrlEncoded(interpolated.formData);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  const executeRequest: ExecuteRequest = {
    method: interpolated.method,
    url: interpolated.url,
    headers,
    ...(body !== undefined ? { body } : {})
  };

  return { executeRequest };
}
