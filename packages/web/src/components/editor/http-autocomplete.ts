/**
 * HTTP editor autocomplete provider for CodeMirror 6.
 */

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete';
import {
  BUILTIN_RESOLVERS,
  COMMON_HEADERS,
  HEADER_VALUE_COMPLETIONS,
  HTTP_METHODS
} from './http-completions';

/**
 * Detect if we're at a position where HTTP methods should be suggested.
 * This is typically at the start of a line after ### or at an empty line.
 */
function isMethodPosition(line: string, pos: number): boolean {
  const beforeCursor = line.slice(0, pos);
  const trimmed = beforeCursor.trim();
  // At start of line or after only whitespace
  if (trimmed === '' || /^[A-Z]*$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Detect if we're at a position where headers should be suggested.
 */
function isHeaderPosition(
  doc: string,
  lineNum: number,
  lineBefore: string
): { isHeader: boolean; headerName?: string } {
  // Check if there's a request line before this
  const lines = doc.split('\n');
  let sawRequest = false;
  let inBody = false;

  for (let i = 0; i < lineNum; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line === '') {
      if (sawRequest) inBody = true;
      continue;
    }
    if (line.startsWith('###')) {
      sawRequest = false;
      inBody = false;
      continue;
    }
    if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\s/i.test(line)) {
      sawRequest = true;
      inBody = false;
    }
  }

  // If we're in body, don't suggest headers
  if (inBody) return { isHeader: false };

  // If we saw a request and this line is empty or starts with a word, suggest headers
  if (sawRequest) {
    const trimmed = lineBefore.trim();
    // Check if we're typing a header name (no colon yet)
    if (!trimmed.includes(':')) {
      return { isHeader: true };
    }
    // Check if we're after a header name (after colon)
    const colonIndex = lineBefore.indexOf(':');
    if (colonIndex !== -1) {
      const headerName = lineBefore.slice(0, colonIndex).trim().toLowerCase();
      return { isHeader: false, headerName };
    }
  }

  return { isHeader: false };
}

/**
 * Extract variables defined in the document (from {{varName}} patterns).
 */
function extractDocumentVariables(doc: string): string[] {
  const variables = new Set<string>();
  const regex = /\{\{([^{}]+)\}\}/g;
  for (const match of doc.matchAll(regex)) {
    const varName = match[1]?.trim();
    // Skip resolver calls (they start with $)
    if (varName && !varName.startsWith('$')) {
      variables.add(varName);
    }
  }
  return Array.from(variables);
}

/**
 * Create completions for HTTP methods.
 */
function methodCompletions(prefix: string): Completion[] {
  return HTTP_METHODS.filter((m) => m.toLowerCase().startsWith(prefix.toLowerCase())).map(
    (method) => ({
      label: method,
      type: 'keyword',
      detail: 'HTTP method',
      boost: 10
    })
  );
}

/**
 * Create completions for headers.
 */
function headerCompletions(prefix: string): Completion[] {
  const lowerPrefix = prefix.toLowerCase();
  return COMMON_HEADERS.filter((h) => h.toLowerCase().startsWith(lowerPrefix)).map((header) => ({
    label: header,
    type: 'property',
    detail: 'HTTP header',
    apply: `${header}: `
  }));
}

/**
 * Create completions for header values.
 */
function headerValueCompletions(headerName: string, prefix: string): Completion[] {
  const values = HEADER_VALUE_COMPLETIONS[headerName];
  if (!values) return [];

  const lowerPrefix = prefix.toLowerCase();
  return values
    .filter((v) => v.toLowerCase().startsWith(lowerPrefix))
    .map((value) => ({
      label: value,
      type: 'constant',
      detail: `${headerName} value`
    }));
}

/**
 * Create completions for variables.
 */
function variableCompletions(doc: string, prefix: string): Completion[] {
  const completions: Completion[] = [];

  // Add built-in resolvers
  for (const resolver of BUILTIN_RESOLVERS) {
    if (resolver.name.toLowerCase().startsWith(prefix.toLowerCase())) {
      completions.push({
        label: resolver.name,
        type: 'function',
        detail: resolver.description,
        info: resolver.detail
      });
    }
  }

  // Add document variables
  const docVars = extractDocumentVariables(doc);
  for (const varName of docVars) {
    if (varName.toLowerCase().startsWith(prefix.toLowerCase())) {
      completions.push({
        label: varName,
        type: 'variable',
        detail: 'Document variable'
      });
    }
  }

  return completions;
}

/**
 * Main completion source for HTTP files.
 */
function httpCompletionSource(context: CompletionContext): CompletionResult | null {
  const { state, pos } = context;
  const doc = state.doc.toString();
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  const lineBefore = lineText.slice(0, pos - line.from);

  // Check for variable completion (after {{)
  const varMatch = lineBefore.match(/\{\{([^{}]*)$/);
  if (varMatch) {
    const prefix = varMatch[1] ?? '';
    const completions = variableCompletions(doc, prefix);
    if (completions.length > 0) {
      return {
        from: pos - prefix.length,
        options: completions,
        validFor: /^[a-zA-Z0-9_$()]*$/
      };
    }
  }

  // Check for header value completion (after "HeaderName: ")
  const headerValueMatch = lineBefore.match(/^([^:]+):\s*(.*)$/);
  if (headerValueMatch) {
    const headerName = headerValueMatch[1]?.trim().toLowerCase();
    const valuePrefix = headerValueMatch[2] ?? '';
    if (headerName) {
      const completions = headerValueCompletions(headerName, valuePrefix);
      if (completions.length > 0) {
        return {
          from: pos - valuePrefix.length,
          options: completions,
          validFor: /^[a-zA-Z0-9\-_/*;=, ]*$/
        };
      }
    }
  }

  // Check for header name completion
  const headerInfo = isHeaderPosition(doc, line.number - 1, lineBefore);
  if (headerInfo.isHeader) {
    const prefix = lineBefore.trim();
    // Don't trigger on empty line without explicit request
    if (!prefix && !context.explicit) return null;
    const completions = headerCompletions(prefix);
    if (completions.length > 0) {
      const prefixStart = lineBefore.length - lineBefore.trimStart().length;
      return {
        from: line.from + prefixStart,
        options: completions,
        validFor: /^[a-zA-Z-]*$/
      };
    }
  }

  // Check for method completion
  if (isMethodPosition(lineText, pos - line.from)) {
    const prefix = lineBefore.trim();
    // Only suggest methods if it looks like the user is typing one
    if (/^[A-Z]*$/i.test(prefix)) {
      // Don't trigger on empty line without explicit request
      if (!prefix && !context.explicit) return null;
      const completions = methodCompletions(prefix);
      if (completions.length > 0) {
        const prefixStart = lineBefore.length - lineBefore.trimStart().length;
        return {
          from: line.from + prefixStart,
          options: completions,
          validFor: /^[A-Z]*$/i
        };
      }
    }
  }

  return null;
}

/**
 * HTTP autocomplete extension for CodeMirror.
 */
export function httpAutocomplete() {
  return autocompletion({
    override: [httpCompletionSource],
    activateOnTyping: true,
    maxRenderedOptions: 20
  });
}
