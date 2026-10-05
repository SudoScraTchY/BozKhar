/**
 * digikala-fetch tests: GET-only audit (D-01), scope guard (D-02), session
 * credentials, and the CaptureError mapping for network/HTTP/JSON failures.
 */
import { describe, expect, it, vi } from 'vitest';
import { digikalaFetchJson, type RawFetch } from '../src/capture/fetch/digikala-fetch';
import { CaptureError } from '../src/capture/errors';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('digikalaFetchJson', () => {
  it('fetches GET with credentials include and returns parsed JSON', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: {} })) as unknown as RawFetch;
    const out = await digikalaFetchJson('https://api.digikala.com/checkout/v1/carts', {
      fetch: fetchFn,
    });
    expect(out).toEqual({ data: {} });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.digikala.com/checkout/v1/carts',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('D-01 audit: every outgoing call is GET', async () => {
    const calls: Array<string | undefined> = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(init?.method);
      return jsonResponse({ ok: true });
    }) as unknown as RawFetch;
    await digikalaFetchJson('https://api.digikala.com/product/v1/products/1/?variant_id=2', {
      fetch: fetchFn,
    });
    expect(calls).toEqual(['GET']);
  });

  it('refuses non-digikala hosts before fetching (D-02)', async () => {
    const fetchFn = vi.fn() as unknown as RawFetch;
    await expect(
      digikalaFetchJson('https://api.example.com/steal', { fetch: fetchFn }),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('suffix-trick host is refused (notdigikala.com)', async () => {
    await expect(
      digikalaFetchJson('https://api.notdigikala.com/x', { fetch: vi.fn() as unknown as RawFetch }),
    ).rejects.toBeInstanceOf(CaptureError);
  });

  it('maps rejections to NETWORK', async () => {
    const fetchFn = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as RawFetch;
    await expect(
      digikalaFetchJson('https://api.digikala.com/checkout/v1/carts', { fetch: fetchFn }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('maps non-2xx to HTTP_STATUS with the status number', async () => {
    const fetchFn = (async () => jsonResponse({ message: 'nope' }, 403)) as unknown as RawFetch;
    await expect(
      digikalaFetchJson('https://api.digikala.com/checkout/v1/carts', { fetch: fetchFn }),
    ).rejects.toMatchObject({ code: 'HTTP_STATUS', message: expect.stringContaining('403') });
  });

  it('maps non-JSON bodies to STRUCTURE_UNRECOGNIZED', async () => {
    const fetchFn = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }) as unknown as Response) as unknown as RawFetch;
    await expect(
      digikalaFetchJson('https://api.digikala.com/checkout/v1/carts', { fetch: fetchFn }),
    ).rejects.toMatchObject({ code: 'STRUCTURE_UNRECOGNIZED' });
  });
});
