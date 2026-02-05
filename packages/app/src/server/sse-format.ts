import type { SSEMessage } from './schemas';

/**
 * Format an SSEMessage into the SSE wire format.
 *
 * Per the SSE specification, each line of multi-line data must be
 * prefixed with "data: ". A blank line terminates the message.
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */
export function formatSSEMessage(msg: SSEMessage): string {
  let result = '';
  if (msg.event) result += `event: ${msg.event}\n`;
  if (msg.id) result += `id: ${msg.id}\n`;
  if (msg.retry) result += `retry: ${msg.retry}\n`;
  // Each line of multi-line data must be prefixed with "data:"
  const dataLines = msg.data.split('\n');
  for (const line of dataLines) {
    result += `data: ${line}\n`;
  }
  result += '\n';
  return result;
}
