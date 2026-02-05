import { concatUint8, type FetchResponse, isBinaryContent } from './utils';

export type ProcessedBody = {
  body: string | undefined;
  encoding: 'utf-8' | 'base64';
  truncated: boolean;
  bodyBytes: number;
  bodyMode: 'buffered' | 'none';
};

export async function processResponseBody(
  response: FetchResponse,
  maxBodyBytes: number
): Promise<ProcessedBody> {
  let body: string | undefined;
  let encoding: 'utf-8' | 'base64' = 'utf-8';
  let truncated = false;
  let bodyBytes = 0;
  let bodyMode: 'buffered' | 'none' = 'none';

  try {
    const clone = response.clone();
    const stream = clone.body;

    if (stream) {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let collected = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;

        const remaining = maxBodyBytes - collected;
        if (remaining <= 0) {
          truncated = true;
          try {
            await reader.cancel();
          } catch {
            // noop
          }
          break;
        }

        if (value.byteLength > remaining) {
          chunks.push(value.slice(0, remaining));
          collected += remaining;
          truncated = true;
          try {
            await reader.cancel();
          } catch {
            // noop
          }
          break;
        }

        chunks.push(value);
        collected += value.byteLength;
      }

      bodyBytes = collected;

      if (collected > 0) {
        bodyMode = 'buffered';

        const bytes = concatUint8(chunks, collected);
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer;

        if (isBinaryContent(ab)) {
          encoding = 'base64';
          body = Buffer.from(bytes).toString('base64');
        } else {
          body = new TextDecoder().decode(bytes);
        }
      }
    }
  } catch (err) {
    bodyMode = 'none';
    console.error('Failed to process response body:', err);
  }

  return { body, encoding, truncated, bodyBytes, bodyMode };
}

export function extractResponseHeaders(
  response: FetchResponse
): Array<{ name: string; value: string }> {
  const responseHeaders: Array<{ name: string; value: string }> = [];

  // Preserve multi-value set-cookie headers when available
  const headersAny = response.headers as unknown as Record<string, unknown>;
  const setCookies =
    typeof headersAny.getSetCookie === 'function'
      ? (headersAny.getSetCookie as () => string[])()
      : [];
  for (const cookie of setCookies) {
    responseHeaders.push({ name: 'set-cookie', value: cookie });
  }

  response.headers.forEach((value: string, name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'set-cookie') return; // handled above (multi-value)
    responseHeaders.push({ name: lower, value });
  });

  return responseHeaders;
}
