import { escapeHtml } from './format';

export const JSON_TOKEN =
  /("(?:[^\\"]|\\.)*")\s*(?=:)|("(?:[^\\"]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false)\b|\b(null)\b/g;

export function highlightJson(json: string): string {
  return json.replace(JSON_TOKEN, (match, key, str, num, bool, nil) => {
    const escaped = escapeHtml(match);
    if (key !== undefined) return `<span class="json-key">${escaped}</span>`;
    if (str !== undefined) return `<span class="json-string">${escaped}</span>`;
    if (num !== undefined) return `<span class="json-number">${escaped}</span>`;
    if (bool !== undefined) return `<span class="json-bool">${escaped}</span>`;
    if (nil !== undefined) return `<span class="json-null">${escaped}</span>`;
    return escaped;
  });
}
