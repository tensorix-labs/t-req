import { slugify } from '../normalize';
import type { Importer, ImportResult } from '../types';
import { CURL_IMPORT_RESULT_NAME, createDiagnostic, failureResult } from './diagnostics';
import {
  type CurlConvertOptions,
  CurlConvertOptionsSchema,
  resolveCurlConvertOptions
} from './options';
import { parseCurlTokens } from './parse';
import { applyGetDataToUrl, buildSerializableRequest, resolveMethod } from './request';
import { tokenizeCurlCommand } from './tokenize';

export { type CurlConvertOptions, CurlConvertOptionsSchema };

export function convertCurlCommand(command: string, options?: CurlConvertOptions): ImportResult {
  const resolvedOptions = resolveCurlConvertOptions(options);
  if (!resolvedOptions.ok) {
    return failureResult(resolvedOptions.diagnostics);
  }

  const tokenized = tokenizeCurlCommand(command);
  const parsed = parseCurlTokens(tokenized.tokens);
  const diagnostics = [...tokenized.diagnostics, ...parsed.diagnostics];

  if (!parsed.url) {
    diagnostics.push(
      createDiagnostic('missing-url', 'error', 'Could not find a request URL in the curl command.')
    );
    return failureResult(diagnostics);
  }

  const method = resolveMethod(parsed);
  const url = applyGetDataToUrl(parsed, parsed.url, diagnostics);
  const request = buildSerializableRequest(parsed, resolvedOptions.value.requestName, method, url);
  const relativePath = `${slugify(resolvedOptions.value.fileName)}.http`;

  return {
    name: CURL_IMPORT_RESULT_NAME,
    files: [
      {
        relativePath,
        document: {
          requests: [request]
        }
      }
    ],
    variables: {},
    diagnostics,
    stats: {
      requestCount: 1,
      fileCount: 1,
      diagnosticCount: diagnostics.length
    }
  };
}

export function createCurlImporter(): Importer<CurlConvertOptions> {
  return {
    source: 'curl',
    optionsSchema: CurlConvertOptionsSchema as import('zod').ZodType<CurlConvertOptions>,
    convert: convertCurlCommand
  };
}
