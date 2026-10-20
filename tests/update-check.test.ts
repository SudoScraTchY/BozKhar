import { describe, expect, it, vi } from 'vitest';
import {
  handleUpdateCheck,
  isNewerVersion,
  isUpdateCheckRequest,
  parseVersion,
  RELEASES_URL,
} from '../src/shared/update';

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('version parsing', () => {
  it('accepts plain and v-prefixed releases', () => {
    expect(parseVersion('0.6.0')).toEqual([0, 6, 0]);
    expect(parseVersion('v0.6.0')).toEqual([0, 6, 0]);
    expect(parseVersion(' 12.34.56 ')).toEqual([12, 34, 56]);
  });

  it('rejects anything that is not a plain x.y.z', () => {
    expect(parseVersion('0.6')).toBeNull();
    expect(parseVersion('v0.6.0-beta')).toBeNull();
    expect(parseVersion('release-0.6.0')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('newer version', () => {
  it('compares numerically, not as strings', () => {
    expect(isNewerVersion('0.7.0', '0.6.0')).toBe(true);
    expect(isNewerVersion('0.6.10', '0.6.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('v0.7.0', '0.6.0')).toBe(true);
  });

  it('is false for the same or an older version', () => {
    expect(isNewerVersion('0.6.0', '0.6.0')).toBe(false);
    expect(isNewerVersion('0.5.9', '0.6.0')).toBe(false);
    expect(isNewerVersion('junk', '0.6.0')).toBe(false);
  });
});

describe('update/check request guard', () => {
  it('accepts exactly the documented kind', () => {
    expect(isUpdateCheckRequest({ kind: 'update/check' })).toBe(true);
    expect(isUpdateCheckRequest({ kind: 'capture/pdp' })).toBe(false);
    expect(isUpdateCheckRequest(null)).toBe(false);
  });
});

describe('handleUpdateCheck', () => {
  it('reports a newer release and a safe release-page URL', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      response({ tag_name: 'v9.1.0' }),
    );
    const result = await handleUpdateCheck(fetchFn, '0.6.0');

    expect(result).toEqual({
      ok: true,
      kind: 'update/check',
      current: '0.6.0',
      latest: '9.1.0',
      updateAvailable: true,
      url: RELEASES_URL,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call = fetchFn.mock.calls[0];
    expect(call?.[0]).toBe('https://api.github.com/repos/SudoScraTchY/BozKhar/releases/latest');
    expect(call?.[1]?.credentials).toBe('omit');
    expect(call?.[1]?.referrerPolicy).toBe('no-referrer');
    expect(call?.[1]?.cache).toBe('no-store');
  });

  it('does not announce the running version as an update', async () => {
    const result = await handleUpdateCheck(async () => response({ tag_name: 'v0.6.0' }), '0.6.0');
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBe('0.6.0');
  });

  it('never uses a URL supplied by the response', async () => {
    const result = await handleUpdateCheck(
      async () => response({ tag_name: 'v0.7.0', html_url: 'https://evil.example/x' }),
      '0.6.0',
    );
    expect(result.url).toBe(RELEASES_URL);
  });

  it('maps failures to a typed error instead of throwing', async () => {
    expect(await handleUpdateCheck(async () => response({}, false), '0.6.0')).toMatchObject({
      ok: false,
      error: 'http',
    });
    expect(
      await handleUpdateCheck(async () => response({ tag_name: 'nope' }), '0.6.0'),
    ).toMatchObject({ ok: false, error: 'parse' });
    expect(
      await handleUpdateCheck(async () => {
        throw new Error('offline');
      }, '0.6.0'),
    ).toMatchObject({ ok: false, error: 'network' });
  });
});
