import type { ResponseHeader } from './types';

function concatUint8(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function isBinaryContent(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  const checkLength = Math.min(bytes.length, 8192);

  for (let i = 0; i < checkLength; i++) {
    const byte = bytes[i] ?? 0;
    if (byte === 0) {
      return true;
    }
    if (byte >= 0x80) {
      if ((byte & 0xc0) === 0x80 && (i === 0 || ((bytes[i - 1] ?? 0) & 0x80) === 0)) {
        return true;
      }
    }
  }

  return false;
}

export function extractHeaders(response: Response): ResponseHeader[] {
  const result: ResponseHeader[] = [];
  const headersAny = response.headers as unknown as { getSetCookie?: () => string[] };
  const setCookies = typeof headersAny.getSetCookie === 'function' ? headersAny.getSetCookie() : [];

  for (const cookie of setCookies) {
    result.push({ name: 'set-cookie', value: cookie });
  }

  response.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') {
      return;
    }
    result.push({ name: name.toLowerCase(), value });
  });

  return result;
}

export async function readResponseBody(
  response: Response,
  maxBytes: number
): Promise<{
  body?: string;
  encoding?: 'utf-8' | 'base64';
  bodyBytes: number;
  truncated: boolean;
}> {
  const stream = response.body;
  if (!stream) {
    return { bodyBytes: 0, truncated: false };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value || value.byteLength === 0) {
      continue;
    }

    const remaining = maxBytes - total;
    if (remaining <= 0) {
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // no-op
      }
      break;
    }

    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining));
      total += remaining;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // no-op
      }
      break;
    }

    chunks.push(value);
    total += value.byteLength;
  }

  if (total === 0) {
    return {
      bodyBytes: 0,
      truncated
    };
  }

  const bytes = concatUint8(chunks, total);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;

  if (isBinaryContent(arrayBuffer)) {
    return {
      body: Buffer.from(bytes).toString('base64'),
      encoding: 'base64',
      bodyBytes: total,
      truncated
    };
  }

  return {
    body: new TextDecoder().decode(bytes),
    encoding: 'utf-8',
    bodyBytes: total,
    truncated
  };
}
