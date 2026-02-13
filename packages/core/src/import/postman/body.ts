import type { SerializableRequest } from '../../serializer';
import type {
  PostmanBodyFile,
  PostmanBodyFormData,
  PostmanBodyUrlencoded,
  PostmanDescription,
  PostmanRequest,
  PostmanRequestBody
} from '../postman-types';
import { addDisabledDiagnostic, createDiagnostic, sourcePath } from './diagnostics';
import { asObjectArray, isObjectRecord } from './guards';
import { setHeaderIfMissing } from './headers';
import type { ConvertState } from './state';

const RAW_LANGUAGE_CONTENT_TYPE: Record<string, string> = {
  json: 'application/json',
  javascript: 'application/javascript',
  xml: 'application/xml',
  html: 'text/html',
  text: 'text/plain'
};

function normalizeFilePath(path: string): string {
  if (
    path.startsWith('./') ||
    path.startsWith('../') ||
    path.startsWith('/') ||
    path.startsWith('{{')
  ) {
    return path;
  }
  return `./${path}`;
}

function fileSourceToPath(file: PostmanBodyFile | undefined): string | undefined {
  const src = file?.src;
  if (typeof src === 'string' && src.trim()) {
    return normalizeFilePath(src.trim());
  }
  if (Array.isArray(src)) {
    const first = src.find((part) => part.trim() !== '');
    if (first) {
      return normalizeFilePath(first.trim());
    }
  }
  return undefined;
}

function languageToContentType(language: string | undefined): string | undefined {
  if (!language) {
    return undefined;
  }
  return RAW_LANGUAGE_CONTENT_TYPE[language.toLowerCase()];
}

function convertFormDataFieldSource(source: string | string[] | undefined): string | undefined {
  if (typeof source === 'string' && source.trim()) {
    return normalizeFilePath(source.trim());
  }
  if (Array.isArray(source)) {
    const first = source.find((part) => part.trim() !== '');
    if (first) {
      return normalizeFilePath(first.trim());
    }
  }
  return undefined;
}

export function descriptionToText(description: PostmanDescription | undefined): string | undefined {
  if (typeof description === 'string') {
    const value = description.trim();
    return value === '' ? undefined : value;
  }
  if (description && typeof description.content === 'string') {
    const value = description.content.trim();
    return value === '' ? undefined : value;
  }
  return undefined;
}

export function mapBody(
  state: ConvertState,
  request: PostmanRequest,
  sourceParts: string[],
  headers: Record<string, string>
): Pick<SerializableRequest, 'body' | 'bodyFile' | 'formData'> {
  const body = isObjectRecord(request.body) ? (request.body as PostmanRequestBody) : undefined;
  if (!body?.mode) {
    return {};
  }

  if (body.mode === 'raw') {
    const contentType = languageToContentType(body.options?.raw?.language);
    if (contentType) {
      setHeaderIfMissing(headers, 'Content-Type', contentType);
    }
    return body.raw !== undefined ? { body: body.raw } : {};
  }

  if (body.mode === 'urlencoded') {
    const fields = [];
    for (const item of asObjectArray<PostmanBodyUrlencoded>(body.urlencoded)) {
      if (item.disabled) {
        addDisabledDiagnostic(state, sourcePath(sourceParts), 'urlencoded field');
        continue;
      }
      if (!item.key) {
        continue;
      }
      fields.push({
        name: item.key,
        value: item.value ?? '',
        isFile: false as const
      });
    }
    return fields.length > 0 ? { formData: fields } : {};
  }

  if (body.mode === 'formdata') {
    const fields = [];
    for (const item of asObjectArray<PostmanBodyFormData>(body.formdata)) {
      if (item.disabled) {
        addDisabledDiagnostic(state, sourcePath(sourceParts), 'form-data field');
        continue;
      }

      if (!item.key) {
        continue;
      }

      if ((item.type ?? 'text') === 'file') {
        const filePath = convertFormDataFieldSource(item.src);
        if (!filePath) {
          state.diagnostics.push(
            createDiagnostic(
              'missing-file',
              'warning',
              'Postman form-data file field is missing a source path.',
              sourcePath(sourceParts),
              { field: item.key }
            )
          );
          fields.push({
            name: item.key,
            value: '',
            isFile: true as const,
            path: './file'
          });
          continue;
        }

        fields.push({
          name: item.key,
          value: '',
          isFile: true as const,
          path: filePath
        });
        continue;
      }

      fields.push({
        name: item.key,
        value: item.value ?? '',
        isFile: false as const
      });
    }

    return fields.length > 0 ? { formData: fields } : {};
  }

  if (body.mode === 'file') {
    const path = fileSourceToPath(body.file);
    if (path) {
      return { bodyFile: { path } };
    }
    state.diagnostics.push(
      createDiagnostic(
        'missing-file',
        'warning',
        'Postman file body is missing a source path.',
        sourcePath(sourceParts)
      )
    );
    return { bodyFile: { path: './file' } };
  }

  if (body.mode === 'graphql') {
    let variables: unknown = {};
    const rawVariables = body.graphql?.variables;

    if (typeof rawVariables === 'string' && rawVariables.trim() !== '') {
      try {
        variables = JSON.parse(rawVariables);
      } catch {
        state.diagnostics.push(
          createDiagnostic(
            'invalid-graphql-variables',
            'warning',
            'GraphQL variables were not valid JSON and were replaced with an empty object.',
            sourcePath(sourceParts)
          )
        );
      }
    } else if (rawVariables && typeof rawVariables === 'object') {
      variables = rawVariables;
    }

    setHeaderIfMissing(headers, 'Content-Type', 'application/json');
    return {
      body: JSON.stringify({
        query: body.graphql?.query ?? '',
        variables
      })
    };
  }

  return {};
}
