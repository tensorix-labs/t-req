/**
 * TUI SDK - HTTP client for workspace APIs only.
 * Architecture constraint: no direct filesystem access, all data via server.
 */

// Types matching server schemas exactly
export interface WorkspaceFile {
  path: string;
  name: string;
  requestCount: number;
  lastModified: number;
}

export interface ListWorkspaceFilesResponse {
  files: WorkspaceFile[];
  workspaceRoot: string;
}

export interface WorkspaceRequest {
  index: number;
  name?: string;
  method: string;
  url: string;
}

export interface ListWorkspaceRequestsResponse {
  path: string;
  requests: WorkspaceRequest[];
}

export interface HealthResponse {
  healthy: boolean;
  version: string;
}

export interface SDK {
  serverUrl: string;
  token?: string;
  health(): Promise<HealthResponse>;
  listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse>;
  listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse>;
}

export class SDKError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'SDKError';
  }
}

// Type for fetch response to work around type conflicts
interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/**
 * Create an SDK instance for communicating with the treq server.
 */
export function createSDK(serverUrl: string, token?: string): SDK {
  // Normalize URL: remove trailing slash
  const baseUrl = serverUrl.replace(/\/+$/, '');

  async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = new URL(endpoint, baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = (await fetch(url.toString(), {
      ...options,
      headers: {
        ...headers,
        ...options?.headers
      }
    })) as unknown as FetchResponse;

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorCode: string | undefined;

      try {
        const errorBody = (await response.json()) as {
          error?: { message?: string; code?: string };
        };
        if (errorBody.error) {
          errorMessage = errorBody.error.message || errorMessage;
          errorCode = errorBody.error.code;
        }
      } catch {
        // Ignore JSON parse errors for error response
      }

      throw new SDKError(errorMessage, response.status, errorCode);
    }

    return (await response.json()) as T;
  }

  return {
    serverUrl: baseUrl,
    token,

    async health(): Promise<HealthResponse> {
      return request<HealthResponse>('/health');
    },

    async listWorkspaceFiles(): Promise<ListWorkspaceFilesResponse> {
      return request<ListWorkspaceFilesResponse>('/workspace/files');
    },

    async listWorkspaceRequests(path: string): Promise<ListWorkspaceRequestsResponse> {
      const encodedPath = encodeURIComponent(path);
      return request<ListWorkspaceRequestsResponse>(`/workspace/requests?path=${encodedPath}`);
    }
  };
}
