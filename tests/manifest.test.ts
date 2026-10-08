/**
 * NFR-06 permission audit as a test: the manifest must declare EXACTLY
 * storage + tabs + scripting + *.digikala.com. Anything more fails CI,
 * not review. ("scripting" was added for D-16 - main-world fetch
 * execution via chrome.scripting.executeScript; see the decision log.)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestSource } from '../src/manifest';

describe('manifest permissions (NFR-06)', () => {
  it('declares exactly the allowed permissions', () => {
    expect(manifestSource.permissions).toEqual(['storage', 'tabs', 'scripting']);
  });

  it('declares only the digikala host permission', () => {
    expect(manifestSource.host_permissions).toEqual(['https://*.digikala.com/*']);
  });

  it('is manifest_version 3 with no remote code surface', () => {
    expect(manifestSource.manifest_version).toBe(3);
  });
});

describe('built artifact permission audit (runs when dist/ exists)', () => {
  const distManifestPath = new URL('../dist/manifest.json', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1',
  );
  let distExists = false;
  try {
    readFileSync(distManifestPath, 'utf8');
    distExists = true;
  } catch {
    distExists = false;
  }

  it.skipIf(!distExists)('matches the source manifest exactly', () => {
    const built = JSON.parse(readFileSync(distManifestPath, 'utf8')) as {
      permissions?: string[];
      host_permissions?: string[];
    };
    expect(built.permissions).toEqual(['storage', 'tabs', 'scripting']);
    expect(built.host_permissions).toEqual(['https://*.digikala.com/*']);
  });
});
