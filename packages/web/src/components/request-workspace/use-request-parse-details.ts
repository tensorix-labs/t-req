import { type PostParseResponses, type TreqClient, unwrap } from '@t-req/sdk/client';
import { createMemo, createResource } from 'solid-js';
import {
  findRequestBlock,
  type ParseRequestBlock,
  type RequestBodySummary,
  type RequestDetailsRow,
  toRequestBodySummary,
  toRequestHeaders
} from '../../utils/request-details';

type ParseRequestDetailsResponse = PostParseResponses[200];

interface ParseRequestDetailsSource {
  client: TreqClient;
  path: string;
  requestIndex: number;
}

interface ParseRequestDetailsResult {
  source: ParseRequestDetailsSource;
  response: ParseRequestDetailsResponse;
}

interface UseRequestParseDetailsOptions {
  client: () => TreqClient | null;
  path: () => string;
  requestIndex: () => number | undefined;
}

interface UseRequestParseDetailsReturn {
  requestBlock: () => ParseRequestBlock | undefined;
  headers: () => RequestDetailsRow[];
  bodySummary: () => RequestBodySummary;
  loading: () => boolean;
  error: () => string | undefined;
  refetch: () => void;
}

const DEFAULT_PARSE_ERROR = 'Unable to load request details.';

export function useRequestParseDetails(
  options: UseRequestParseDetailsOptions
): UseRequestParseDetailsReturn {
  const source = createMemo<ParseRequestDetailsSource | null>(() => {
    const client = options.client();
    const path = options.path();
    const requestIndex = options.requestIndex();
    if (!client || !path || requestIndex === undefined) {
      return null;
    }
    return {
      client,
      path,
      requestIndex
    };
  });

  const [parseResult, { refetch }] = createResource(
    source,
    async (current): Promise<ParseRequestDetailsResult> => {
      const response = await unwrap(
        current.client.postParse({
          body: {
            path: current.path,
            includeDiagnostics: true,
            includeBodyContent: true
          }
        })
      );

      return {
        source: current,
        response
      };
    }
  );

  const requestBlock = createMemo(() => {
    const result = parseResult();
    if (!result) {
      return undefined;
    }
    return findRequestBlock(result.response.requests, result.source.requestIndex);
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
    requestBlock,
    headers,
    bodySummary,
    loading: () => parseResult.loading,
    error,
    refetch
  };
}
