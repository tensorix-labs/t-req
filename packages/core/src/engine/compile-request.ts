import { loadFileBody } from '../file-loader';
import { buildFormData, buildUrlEncoded, hasFileFields } from '../form-data-builder';
import type { IO } from '../runtime/types';
import type { ExecuteRequest, FormField } from '../types';
import { setOptional } from '../utils/optional';

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

  let body: ExecuteRequest['body'] = interpolated.body;

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
