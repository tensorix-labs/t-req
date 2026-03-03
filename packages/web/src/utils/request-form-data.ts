import type { RequestBodyField } from './request-details';

function normalizeOptional(value: string | undefined): string {
  return value ?? '';
}

function normalizeFilePath(path: string | undefined): string {
  const rawPath = normalizeOptional(path).trim();
  if (!rawPath) {
    return './';
  }

  const withoutAtPrefix = rawPath.startsWith('@') ? rawPath.slice(1) : rawPath;
  if (withoutAtPrefix.startsWith('./') || withoutAtPrefix.startsWith('{{')) {
    return withoutAtPrefix;
  }
  if (withoutAtPrefix.startsWith('/')) {
    return `.${withoutAtPrefix}`;
  }
  return `./${withoutAtPrefix}`;
}

function serializeFormDataField(field: RequestBodyField): string | undefined {
  const name = field.name.trim();
  if (!name) {
    return undefined;
  }

  if (!field.isFile) {
    return `${name} = ${field.value}`;
  }

  const normalizedPath = normalizeFilePath(field.path);
  const base = `${name} = @${normalizedPath}`;
  const filename = normalizeOptional(field.filename).trim();
  return filename ? `${base} | ${filename}` : base;
}

export function cloneFormDataFields(fields: RequestBodyField[]): RequestBodyField[] {
  return fields.map((field) => ({ ...field }));
}

export function serializeFormDataBody(fields: RequestBodyField[]): string {
  return fields
    .map((field) => serializeFormDataField(field))
    .filter((line): line is string => line !== undefined)
    .join('\n');
}
