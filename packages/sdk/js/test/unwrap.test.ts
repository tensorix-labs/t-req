import { describe, expect, test } from 'bun:test';
import { SDKError, unwrap } from '../src/client';

/** Helper: create a resolved SDK-style response. */
function ok<T>(data: T) {
  return Promise.resolve({
    data,
    error: undefined,
    response: new Response(null, { status: 200 })
  });
}

/** Helper: create a failed SDK-style response with an HTTP error. */
function httpError(status: number, body?: { error?: { message?: string; code?: string } }) {
  return Promise.resolve({
    data: undefined,
    error: body ?? { error: { message: `HTTP ${status}` } },
    response: new Response(null, { status })
  });
}

/** Helper: create a failed SDK-style response with no response (network error). */
function networkError(error: Error) {
  return Promise.resolve({
    data: undefined,
    error,
    response: undefined as unknown as Response
  });
}

/** Helper: assert unwrap rejects and return the SDKError for field checks. */
async function expectSDKError<T>(promise: Promise<T>): Promise<SDKError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SDKError);
    return error as SDKError;
  }
  throw new Error('Expected unwrap() to reject with SDKError');
}

describe('unwrap', () => {
  describe('success', () => {
    test('returns data from a successful response', async () => {
      const result = await unwrap(ok({ healthy: true, version: '1.0' }));
      expect(result).toEqual({ healthy: true, version: '1.0' });
    });

    test('returns empty object', async () => {
      const result = await unwrap(ok({}));
      expect(result).toEqual({});
    });

    test('returns array data', async () => {
      const result = await unwrap(ok([1, 2, 3]));
      expect(result).toEqual([1, 2, 3]);
    });

    test('returns null data', async () => {
      const result = await unwrap(ok(null));
      expect(result).toBeNull();
    });

    test('returns falsy number 0', async () => {
      const result = await unwrap(ok(0));
      expect(result).toBe(0);
    });

    test('returns empty string', async () => {
      const result = await unwrap(ok(''));
      expect(result).toBe('');
    });

    test('returns false', async () => {
      const result = await unwrap(ok(false));
      expect(result).toBe(false);
    });
  });

  describe('HTTP errors', () => {
    test('throws SDKError with status and message from error body', async () => {
      const err = await expectSDKError(
        unwrap(
          httpError(400, {
            error: { message: 'Invalid request', code: 'VALIDATION_ERROR' }
          })
        )
      );
      expect(err.message).toBe('Invalid request');
      expect(err.status).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.name).toBe('SDKError');
    });

    test('throws SDKError for 401 unauthorized', async () => {
      const err = await expectSDKError(
        unwrap(httpError(401, { error: { message: 'Unauthorized' } }))
      );
      expect(err.status).toBe(401);
      expect(err.message).toBe('Unauthorized');
    });

    test('throws SDKError for 404 not found', async () => {
      const err = await expectSDKError(
        unwrap(httpError(404, { error: { message: 'File not found' } }))
      );
      expect(err.status).toBe(404);
      expect(err.message).toBe('File not found');
    });

    test('falls back to HTTP status when error body has no message', async () => {
      const err = await expectSDKError(unwrap(httpError(500)));
      expect(err.status).toBe(500);
      expect(err.message).toBe('HTTP 500');
    });
  });

  describe('network errors', () => {
    test('throws SDKError with message from original error', async () => {
      const err = await expectSDKError(unwrap(networkError(new TypeError('Failed to fetch'))));
      expect(err.message).toBe('Failed to fetch');
      expect(err.status).toBeUndefined();
      expect(err.code).toBeUndefined();
    });

    test('does not crash when response is undefined', async () => {
      const err = await expectSDKError(unwrap(networkError(new Error('ECONNREFUSED'))));
      expect(err.message).toBe('ECONNREFUSED');
      expect(err.status).toBeUndefined();
    });
  });

  describe('missing data', () => {
    test('throws SDKError when data is undefined and no error', async () => {
      const err = await expectSDKError(
        unwrap(
          Promise.resolve({
            data: undefined,
            error: undefined,
            response: new Response(null, { status: 204 })
          })
        )
      );
      expect(err.message).toBe('No data returned from server');
      expect(err.status).toBeUndefined();
    });
  });
});

describe('SDKError', () => {
  test('has correct name', () => {
    const err = new SDKError('test');
    expect(err.name).toBe('SDKError');
  });

  test('is instanceof Error', () => {
    const err = new SDKError('test');
    expect(err).toBeInstanceOf(Error);
  });

  test('preserves status and code', () => {
    const err = new SDKError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  test('status and code are optional', () => {
    const err = new SDKError('something broke');
    expect(err.status).toBeUndefined();
    expect(err.code).toBeUndefined();
  });
});
