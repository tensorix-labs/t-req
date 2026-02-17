import { describe, expect, test } from 'bun:test';
import {
  ContentOrPathRequiredError,
  ExecuteError,
  getStatusForError,
  NoRequestsFoundError,
  ParseError,
  PathOutsideWorkspaceError,
  RequestIndexOutOfRangeError,
  RequestNotFoundError,
  SessionLimitReachedError,
  SessionNotFoundError,
  TreqError,
  ValidationError,
  WsReplayGapError,
  WsSessionLimitReachedError,
  WsSessionNotFoundError
} from '../../src/server/errors';

describe('TreqError base class', () => {
  test('should have correct code and message', () => {
    const error = new TreqError('TEST_CODE', 'Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('TreqError');
  });

  test('should serialize to object correctly', () => {
    const error = new TreqError('TEST_CODE', 'Test message');
    expect(error.toObject()).toEqual({
      error: { code: 'TEST_CODE', message: 'Test message' }
    });
  });
});

describe('error types have correct codes', () => {
  test('PathOutsideWorkspaceError has correct code', () => {
    const error = new PathOutsideWorkspaceError('/etc/passwd');
    expect(error.code).toBe('PATH_OUTSIDE_WORKSPACE');
    expect(error.message).toContain('/etc/passwd');
    expect(error.name).toBe('PathOutsideWorkspaceError');
  });

  test('SessionNotFoundError has correct code', () => {
    const error = new SessionNotFoundError('abc123');
    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(error.message).toContain('abc123');
    expect(error.name).toBe('SessionNotFoundError');
  });

  test('SessionLimitReachedError has correct code', () => {
    const error = new SessionLimitReachedError(100);
    expect(error.code).toBe('SESSION_LIMIT_REACHED');
    expect(error.message).toContain('100');
    expect(error.name).toBe('SessionLimitReachedError');
  });

  test('ValidationError has correct code', () => {
    const error = new ValidationError('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid input');
    expect(error.name).toBe('ValidationError');
  });

  test('ParseError has correct code', () => {
    const error = new ParseError('Syntax error');
    expect(error.code).toBe('PARSE_ERROR');
    expect(error.message).toBe('Syntax error');
    expect(error.name).toBe('ParseError');
  });

  test('ExecuteError has correct code', () => {
    const error = new ExecuteError('Request failed');
    expect(error.code).toBe('EXECUTE_ERROR');
    expect(error.message).toBe('Request failed');
    expect(error.name).toBe('ExecuteError');
  });

  test('RequestNotFoundError has correct code', () => {
    const error = new RequestNotFoundError("name 'login'");
    expect(error.code).toBe('REQUEST_NOT_FOUND');
    expect(error.message).toContain("name 'login'");
    expect(error.name).toBe('RequestNotFoundError');
  });

  test('RequestIndexOutOfRangeError has correct code', () => {
    const error = new RequestIndexOutOfRangeError(5, 2);
    expect(error.code).toBe('REQUEST_INDEX_OUT_OF_RANGE');
    expect(error.message).toContain('5');
    expect(error.message).toContain('0-2');
    expect(error.name).toBe('RequestIndexOutOfRangeError');
  });

  test('NoRequestsFoundError has correct code', () => {
    const error = new NoRequestsFoundError();
    expect(error.code).toBe('NO_REQUESTS_FOUND');
    expect(error.name).toBe('NoRequestsFoundError');
  });

  test('ContentOrPathRequiredError has correct code', () => {
    const error = new ContentOrPathRequiredError();
    expect(error.code).toBe('CONTENT_OR_PATH_REQUIRED');
    expect(error.name).toBe('ContentOrPathRequiredError');
  });

  test('WsSessionNotFoundError has correct code', () => {
    const error = new WsSessionNotFoundError('ws_123');
    expect(error.code).toBe('WS_SESSION_NOT_FOUND');
    expect(error.message).toContain('ws_123');
    expect(error.name).toBe('WsSessionNotFoundError');
  });

  test('WsSessionLimitReachedError has correct code', () => {
    const error = new WsSessionLimitReachedError(5);
    expect(error.code).toBe('WS_SESSION_LIMIT_REACHED');
    expect(error.message).toContain('5');
    expect(error.name).toBe('WsSessionLimitReachedError');
  });

  test('WsReplayGapError has correct code', () => {
    const error = new WsReplayGapError('ws_123', 1, 10);
    expect(error.code).toBe('WS_REPLAY_GAP');
    expect(error.message).toContain('ws_123');
    expect(error.name).toBe('WsReplayGapError');
  });
});

describe('getStatusForError status code mapping', () => {
  test('should return 404 for SessionNotFoundError', () => {
    const error = new SessionNotFoundError('test');
    expect(getStatusForError(error)).toBe(404);
  });

  test('should return 404 for WsSessionNotFoundError', () => {
    const error = new WsSessionNotFoundError('ws_123');
    expect(getStatusForError(error)).toBe(404);
  });

  test('should return 404 for RequestNotFoundError', () => {
    const error = new RequestNotFoundError('test');
    expect(getStatusForError(error)).toBe(404);
  });

  test('should return 403 for PathOutsideWorkspaceError', () => {
    const error = new PathOutsideWorkspaceError('/path');
    expect(getStatusForError(error)).toBe(403);
  });

  test('should return 429 for SessionLimitReachedError', () => {
    const error = new SessionLimitReachedError(10);
    expect(getStatusForError(error)).toBe(429);
  });

  test('should return 429 for WsSessionLimitReachedError', () => {
    const error = new WsSessionLimitReachedError(10);
    expect(getStatusForError(error)).toBe(429);
  });

  test('should return 400 for WsReplayGapError', () => {
    const error = new WsReplayGapError('ws_123', 0, 10);
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for ValidationError', () => {
    const error = new ValidationError('test');
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for ContentOrPathRequiredError', () => {
    const error = new ContentOrPathRequiredError();
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for RequestIndexOutOfRangeError', () => {
    const error = new RequestIndexOutOfRangeError(5, 2);
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for NoRequestsFoundError', () => {
    const error = new NoRequestsFoundError();
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for ParseError', () => {
    const error = new ParseError('test');
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for ExecuteError', () => {
    const error = new ExecuteError('test');
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 400 for generic TreqError', () => {
    const error = new TreqError('UNKNOWN', 'test');
    expect(getStatusForError(error)).toBe(400);
  });

  test('should return 500 for non-TreqError', () => {
    const error = new Error('Generic error');
    expect(getStatusForError(error)).toBe(500);
  });

  test('should return 500 for TypeError', () => {
    const error = new TypeError('type error');
    expect(getStatusForError(error)).toBe(500);
  });
});
