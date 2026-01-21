// ============================================================================
// Error Taxonomy - OpenCode NamedError pattern
// ============================================================================

/**
 * Base error class for all t-req errors.
 * Provides consistent error structure with code and message.
 */
export class TreqError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'TreqError';
  }

  toObject() {
    return { error: { code: this.code, message: this.message } };
  }
}

// ============================================================================
// Specific Error Types
// ============================================================================

export class PathOutsideWorkspaceError extends TreqError {
  constructor(path: string) {
    super('PATH_OUTSIDE_WORKSPACE', `Path '${path}' is outside workspace`);
    this.name = 'PathOutsideWorkspaceError';
  }
}

export class SessionNotFoundError extends TreqError {
  constructor(id: string) {
    super('SESSION_NOT_FOUND', `Session '${id}' not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionLimitReachedError extends TreqError {
  constructor(limit: number) {
    super('SESSION_LIMIT_REACHED', `Maximum session limit (${limit}) reached`);
    this.name = 'SessionLimitReachedError';
  }
}

export class ValidationError extends TreqError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class ParseError extends TreqError {
  constructor(message: string) {
    super('PARSE_ERROR', message);
    this.name = 'ParseError';
  }
}

export class ExecuteError extends TreqError {
  constructor(message: string) {
    super('EXECUTE_ERROR', message);
    this.name = 'ExecuteError';
  }
}

export class RequestNotFoundError extends TreqError {
  constructor(identifier: string) {
    super('REQUEST_NOT_FOUND', `No request found with ${identifier}`);
    this.name = 'RequestNotFoundError';
  }
}

export class RequestIndexOutOfRangeError extends TreqError {
  constructor(index: number, max: number) {
    super('REQUEST_INDEX_OUT_OF_RANGE', `Request index ${index} out of range (0-${max})`);
    this.name = 'RequestIndexOutOfRangeError';
  }
}

export class NoRequestsFoundError extends TreqError {
  constructor() {
    super('NO_REQUESTS_FOUND', 'No valid requests found in content');
    this.name = 'NoRequestsFoundError';
  }
}

export class ContentOrPathRequiredError extends TreqError {
  constructor() {
    super('CONTENT_OR_PATH_REQUIRED', 'Exactly one of "content" or "path" must be provided');
    this.name = 'ContentOrPathRequiredError';
  }
}

export class FlowNotFoundError extends TreqError {
  constructor(id: string) {
    super('FLOW_NOT_FOUND', `Flow '${id}' not found`);
    this.name = 'FlowNotFoundError';
  }
}

export class ExecutionNotFoundError extends TreqError {
  constructor(flowId: string, reqExecId: string) {
    super('EXECUTION_NOT_FOUND', `Execution '${reqExecId}' not found in flow '${flowId}'`);
    this.name = 'ExecutionNotFoundError';
  }
}

export class FileNotFoundError extends TreqError {
  constructor(path: string) {
    super('FILE_NOT_FOUND', `File '${path}' not found`);
    this.name = 'FileNotFoundError';
  }
}

// ============================================================================
// Status Code Mapping - OpenCode pattern
// ============================================================================

// Valid HTTP status codes for Hono responses
type HttpStatusCode = 400 | 403 | 404 | 429 | 500;

/**
 * Map errors to HTTP status codes .
 *
 */
export function getStatusForError(err: Error): HttpStatusCode {
  if (err instanceof SessionNotFoundError) return 404;
  if (err instanceof RequestNotFoundError) return 404;
  if (err instanceof FlowNotFoundError) return 404;
  if (err instanceof ExecutionNotFoundError) return 404;
  if (err instanceof FileNotFoundError) return 404;
  if (err instanceof PathOutsideWorkspaceError) return 403;
  if (err instanceof SessionLimitReachedError) return 429;
  if (err instanceof ValidationError) return 400;
  if (err instanceof ContentOrPathRequiredError) return 400;
  if (err instanceof RequestIndexOutOfRangeError) return 400;
  if (err instanceof NoRequestsFoundError) return 400;
  if (err instanceof ParseError) return 400;
  if (err instanceof ExecuteError) return 400;
  if (err instanceof TreqError) return 400;
  return 500;
}
