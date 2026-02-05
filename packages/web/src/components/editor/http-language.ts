import { StreamLanguage } from '@codemirror/language';
import { simpleMode } from '@codemirror/legacy-modes/mode/simple-mode';

/**
 * HTTP file language mode for CodeMirror 6.
 *
 * Supports:
 * - Comments (### separators, # and // line comments)
 * - @name and other directives (@prompt, @no-redirect, etc.)
 * - HTTP methods (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS, TRACE, CONNECT)
 * - URLs with query parameters
 * - HTTP version (HTTP/1.1, HTTP/2)
 * - Headers (Name: Value) with distinct name/value styling
 * - Variables ({{...}}) with resolver highlighting
 * - JSON in body
 */
const httpMode = simpleMode({
  start: [
    // ### separators (request delimiter)
    { regex: /^###.*$/, token: 'comment def' },

    // Line comments
    { regex: /^#.*$/, token: 'comment' },
    { regex: /^\/\/.*$/, token: 'comment' },

    // @name directive with value
    { regex: /@name\s+/, token: 'attribute', next: 'directiveValue' },

    // Other directives (@prompt, @no-redirect, @no-cookie-jar, etc.)
    { regex: /@[\w-]+/, token: 'attribute' },

    // HTTP Methods at start of line
    {
      regex: /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/,
      token: 'keyword'
    },

    // HTTP version
    { regex: /HTTP\/[0-9.]+/, token: 'atom' },

    // URLs with query params - highlight base URL and params separately
    {
      regex: /https?:\/\/[^?\s]+/,
      token: 'string'
    },
    // Query string
    { regex: /\?[^\s]*/, token: 'string-2' },

    // Header name (before colon)
    { regex: /^[\w-]+(?=:)/, token: 'property' },
    // Colon separator
    { regex: /:(?=\s)/, token: 'punctuation' },

    // Variables with resolvers ({{$env(...)}}, {{$uuid()}})
    { regex: /\{\{\$[\w]+\([^)]*\)\}\}/, token: 'variable-2' },
    // Regular variables {{...}}
    { regex: /\{\{[^}]+\}\}/, token: 'variable' },
    // Unclosed variable start
    { regex: /\{\{/, token: 'variable error' },

    // JSON in body
    { regex: /[{}[\]]/, token: 'bracket' },
    // JSON property names
    { regex: /"(?:[^\\"]|\\.)*"(?=\s*:)/, token: 'property' },
    // JSON strings
    { regex: /"(?:[^\\"]|\\.)*"/, token: 'string' },
    { regex: /true|false|null/, token: 'atom' },
    { regex: /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i, token: 'number' }
  ],

  // Directive value state (for @name values)
  directiveValue: [{ regex: /.*$/, token: 'string', next: 'start' }]
});

export const httpLanguage = StreamLanguage.define(httpMode);

/**
 * HTTP language support extension for CodeMirror.
 * Usage: import { http } from './http-language';
 *        extensions: [http(), ...]
 */
export function http() {
  return httpLanguage;
}
