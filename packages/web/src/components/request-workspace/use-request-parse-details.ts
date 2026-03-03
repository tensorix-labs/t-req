import { type PostParseResponses, type TreqClient, unwrap } from '@t-req/sdk/client';
import { createMemo, createResource } from 'solid-js';
import {
  findRequestBlock,
  type RequestBodySummary,
  type RequestDetailsRow,
  toRequestBodySummary,
  toRequestHeaders
} from '../../utils/request-details';

type ParseRequestDetailsResponse = PostParseResponses[200];

interface ParseRequestDetailsSource {
  client: TreqClient;
  path: string;
}

interface UseRequestParseDetailsOptions {
  client: () => TreqClient | null;
  path: () => string;
  requestIndex: () => number | undefined;
}

interface UseRequestParseDetailsReturn {
  headers: () => RequestDetailsRow[];
  bodySummary: () => RequestBodySummary;
  loading: () => boolean;
  error: () => string | undefined;
  refetch: (info?: unknown) => unknown;
}

const DEFAULT_PARSE_ERROR = 'Unable to load request details.';

export function useRequestParseDetails(
  options: UseRequestParseDetailsOptions
): UseRequestParseDetailsReturn {
  const source = createMemo<ParseRequestDetailsSource | null>(() => {
    const client = options.client();
    const path = options.path();
    if (!client || !path) {
      return null;
    }
    return {
      client,
      path
    };
  });

  const [parseResult, { refetch }] = createResource(
    source,
    async (current): Promise<ParseRequestDetailsResponse> => {
      return await unwrap(
        current.client.postParse({
          body: {
            path: current.path,
            includeDiagnostics: true,
            includeBodyContent: true
          }
        })
      );
    }
  );

  const requestBlock = createMemo(() => {
    const parsedRequestFile = parseResult();
    const requestIndex = options.requestIndex();
    if (!parsedRequestFile || requestIndex === undefined) {
      return undefined;
    }
    return findRequestBlock(parsedRequestFile.requests, requestIndex);
  });

  const headers = createMemo(() => {
    const request = requestBlock()?.request;
    if (!request) {
      return [];
    }
    return toRequestHeaders(request.headers);
  });

  const bodySummary = createMemo(() => toRequestBodySummary(requestBlock()?.request));

  const error = createMemo(() => {
    const fetchError = parseResult.error;
    if (!fetchError) {
      return undefined;
    }
    if (fetchError instanceof Error && fetchError.message) {
      return fetchError.message;
    }
    return DEFAULT_PARSE_ERROR;
  });

  return {
    headers,
    bodySummary,
    loading: () => parseResult.loading,
    error,
    refetch
  };
}
