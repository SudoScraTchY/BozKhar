/**
 * NFR-06 permission audit as a test: the manifest must declare EXACTLY
 * storage + tabs + scripting + *.digikala.com, plus the Torob API host
 * added by D-42 (the on-demand PDP comparison) and the GitHub releases
 * host added by D-44 (the popup's release check). Anything more fails CI,
 * not review. ("scripting" was added for D-16 - main-world fetch
 * execution via chrome.scripting.executeScript; see the decision log.)
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { manifestSource } from '../src/manifest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('manifest permissions (NFR-06)', () => {
  it('declares exactly the allowed permissions', () => {
    expect(manifestSource.permissions).toEqual(['storage', 'tabs', 'scripting']);
  });

  it('declares only the reviewed host permissions', () => {
    expect(manifestSource.host_permissions).toEqual([
      'https://*.digikala.com/*',
      'https://api.torob.com/*',
      'https://api.github.com/*',
    ]);
  });

  it('is manifest_version 3 with no remote code surface', () => {
    expect(manifestSource.manifest_version).toBe(3);
  });
});

describe('manifest version', () => {
  it('advertises the package version (the release tag is cut from it)', () => {
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { version: string };
    expect(manifestSource.version).toBe(pkg.version);
    // A store upload needs a plain x.y.z; the release workflow matches the
    // git tag `v<x.y.z>` against this same number.
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('manifest icons', () => {
  const icons = manifestSource.icons ?? {};
  const toolbar = (manifestSource.action?.default_icon ?? {}) as Record<string, string>;

  it('declares the mark set at every required size', () => {
    expect(Object.keys(icons).sort()).toEqual(['128', '16', '32', '48']);
    expect(Object.values(icons).every((p) => p.startsWith('icons/icon-'))).toBe(true);
  });

  it('uses the same mark for the toolbar (no separate glyph set)', () => {
    expect(Object.keys(toolbar).sort()).toEqual(['128', '16', '32', '48']);
    expect(toolbar).toEqual(icons);
  });

  it('references files crxjs can resolve (project root, then public dir)', () => {
    for (const path of [...Object.values(icons), ...Object.values(toolbar)]) {
      expect(existsSync(`${ROOT}${path}`) || existsSync(`${ROOT}public/${path}`)).toBe(true);
    }
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
    expect(built.host_permissions).toEqual([
      'https://*.digikala.com/*',
      'https://api.torob.com/*',
      'https://api.github.com/*',
    ]);
  });
});
