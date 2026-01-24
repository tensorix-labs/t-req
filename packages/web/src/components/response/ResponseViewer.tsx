import { createMemo, Show } from 'solid-js';

interface ResponseViewerProps {
  body: string;
  contentType?: string;
  encoding: 'utf-8' | 'base64';
  truncated: boolean;
  bodyBytes: number;
}

export function ResponseViewer(props: ResponseViewerProps) {
  const decodedBody = createMemo(() => {
    if (!props.body) return '';
    if (props.encoding === 'base64') {
      try {
        return atob(props.body);
      } catch {
        return props.body;
      }
    }
    return props.body;
  });

  const formattedBody = createMemo(() => {
    const body = decodedBody();
    const type = detectContentType(body, props.contentType);

    if (type === 'json') {
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return body;
      }
    }

    return body;
  });

  const contentType = createMemo(() => {
    return detectContentType(decodedBody(), props.contentType);
  });

  const typeClasses = createMemo(() => {
    const type = contentType();
    const base = 'font-mono text-[0.625rem] font-semibold px-1.5 py-0.5 rounded uppercase';
    switch (type) {
      case 'json':
        return `${base} bg-http-put/15 text-http-put`;
      case 'html':
        return `${base} bg-http-delete/15 text-http-delete`;
      case 'xml':
        return `${base} bg-http-post/15 text-http-post`;
      default:
        return `${base} bg-treq-border-light text-treq-text-muted dark:bg-treq-dark-border-light dark:text-treq-dark-text-muted`;
    }
  });

  return (
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between px-3 py-2 border-b border-treq-border-light bg-treq-bg dark:border-treq-dark-border-light dark:bg-treq-dark-bg">
        <span class={typeClasses()}>
          {contentType().toUpperCase()}
        </span>
        <span class="font-mono text-xs text-treq-text-muted dark:text-treq-dark-text-muted">
          {formatBytes(props.bodyBytes)}
          {props.truncated && ' (truncated)'}
        </span>
      </div>
      <pre class="flex-1 m-0 p-4 overflow-auto font-mono text-xs leading-relaxed bg-treq-bg whitespace-pre-wrap break-all dark:bg-treq-dark-bg">
        <code class="text-treq-text-strong dark:text-treq-dark-text-strong">
          <Show when={contentType() === 'json'} fallback={formattedBody()}>
            <JsonHighlighter json={formattedBody()} />
          </Show>
        </code>
      </pre>
    </div>
  );
}

function JsonHighlighter(props: { json: string }) {
  const highlighted = createMemo(() => {
    const json = props.json;

    const escaped = json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped
      .replace(/"([^"\\]|\\.)*"/g, (match) => {
        return `<span class="json-string">${match}</span>`;
      })
      .replace(/\b(-?\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, '<span class="json-number">$1</span>')
      .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
      .replace(/\bnull\b/g, '<span class="json-null">null</span>');
  });

  return <span innerHTML={highlighted()} />;
}

function detectContentType(body: string, contentTypeHeader?: string): string {
  if (contentTypeHeader) {
    const lower = contentTypeHeader.toLowerCase();
    if (lower.includes('json')) return 'json';
    if (lower.includes('html')) return 'html';
    if (lower.includes('xml')) return 'xml';
    if (lower.includes('javascript')) return 'javascript';
    if (lower.includes('css')) return 'css';
    if (lower.includes('text/plain')) return 'text';
  }

  const trimmed = body.trim();

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return 'html';
  }

  if (trimmed.startsWith('<?xml')) {
    return 'xml';
  }

  return 'text';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
