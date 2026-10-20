/**
 * Release check for the GitHub-distributed extension (D-44).
 *
 * The extension is not in a store, so Chrome's requestUpdateCheck() cannot
 * see new builds. The popup asks the worker for the latest GitHub release
 * when it opens; nothing polls, nothing runs in the background, and the
 * only value read from the response is the tag name. The download link is
 * constructed here, never taken from the response.
 */

const REPO = 'SudoScraTchY/BozKhar';
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;

const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const TIMEOUT_MS = 8_000;

export interface UpdateCheckRequest {
  kind: 'update/check';
}

export interface UpdateCheckResponse {
  ok: boolean;
  kind: 'update/check';
  current?: string;
  latest?: string;
  updateAvailable?: boolean;
  url?: string;
  error?: 'network' | 'http' | 'parse';
}

export function isUpdateCheckRequest(raw: unknown): raw is UpdateCheckRequest {
  return (
    typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === 'update/check'
  );
}

export function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(latest: string, current: string): boolean {
  const next = parseVersion(latest);
  const now = parseVersion(current);
  if (!next || !now) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== now[index]) return (next[index] as number) > (now[index] as number);
  }
  return false;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function handleUpdateCheck(
  fetchFn: FetchFn,
  currentVersion: string,
): Promise<UpdateCheckResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchFn(LATEST_RELEASE_API, {
      headers: { accept: 'application/vnd.github+json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, kind: 'update/check', error: 'http' };

    const data = (await response.json()) as { tag_name?: unknown };
    const parsed = typeof data.tag_name === 'string' ? parseVersion(data.tag_name) : null;
    if (!parsed) return { ok: false, kind: 'update/check', error: 'parse' };

    const latest = parsed.join('.');
    return {
      ok: true,
      kind: 'update/check',
      current: currentVersion,
      latest,
      updateAvailable: isNewerVersion(latest, currentVersion),
      url: RELEASES_URL,
    };
  } catch {
    return { ok: false, kind: 'update/check', error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
