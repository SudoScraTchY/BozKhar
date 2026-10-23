/**
 * Firefox package build + audit (D-46), run against a CRXJS-shaped fixture.
 *
 * The real scripts are spawned so the test covers the actual CLI, the
 * manifest transform, and the artifact gate - not a reimplementation.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUILD = join(ROOT, 'scripts', 'build-firefox.mjs');
const AUDIT = join(ROOT, 'scripts', 'audit-firefox-dist.mjs');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };

function runNode(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    // The local workspace runs Node through the Qoder binary; harmless for
    // a normal node in CI.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 20_000,
  });
}

function writeFixture(): { root: string; dist: string } {
  const root = mkdtempSync(join(tmpdir(), 'bozkhar-ff-'));
  const dist = join(root, 'dist');
  for (const dir of ['assets', 'icons', 'src/popup', 'src/options']) {
    mkdirSync(join(dist, dir), { recursive: true });
  }

  const manifest = {
    manifest_version: 3,
    name: 'BozKhar test',
    short_name: 'BozKhar',
    version: pkg.version,
    description: 'fixture',
    icons: { 16: 'icons/icon-16.png' },
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['https://*.digikala.com/*'],
    background: { service_worker: 'service-worker-loader.js', type: 'module' },
    options_ui: { page: 'src/options/index.html', open_in_tab: true },
    content_scripts: [
      {
        matches: ['https://*.digikala.com/*'],
        js: ['assets/content-loader.js'],
        run_at: 'document_idle',
      },
    ],
    action: {
      default_icon: { 16: 'icons/icon-16.png' },
      default_popup: 'src/popup/index.html',
    },
    web_accessible_resources: [
      {
        resources: ['assets/chunk.js', 'assets/dep.js'],
        matches: ['https://*.digikala.com/*'],
        use_dynamic_url: true,
      },
    ],
  };

  writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dist, 'service-worker-loader.js'), "import './assets/worker.js';\n");
  writeFileSync(join(dist, 'assets', 'worker.js'), 'export {};\n');
  writeFileSync(
    join(dist, 'assets', 'content-loader.js'),
    'const chunk = chrome.runtime.getURL("assets/chunk.js");\nconsole.log(chunk);\n',
  );
  writeFileSync(join(dist, 'assets', 'chunk.js'), 'import "./dep.js";\nexport const x = 1;\n');
  writeFileSync(join(dist, 'assets', 'dep.js'), 'export const y = 2;\n');
  writeFileSync(join(dist, 'icons', 'icon-16.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(
    join(dist, 'src', 'popup', 'index.html'),
    '<!doctype html><script type="module" src="/assets/chunk.js"></script>\n',
  );
  writeFileSync(join(dist, 'src', 'options', 'index.html'), '<!doctype html><p>options</p>\n');

  return { root, dist };
}

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { root: string; dist: string } {
  const made = writeFixture();
  cleanups.push(made.root);
  return made;
}

function build(dist: string): string {
  const out = join(dirname(dist), 'dist-firefox');
  const result = runNode(BUILD, ['--dist', dist, '--out', out]);
  expect(result.status, result.stderr).toBe(0);
  return out;
}

describe('Firefox package build + audit (D-46)', () => {
  it('rewrites only the manifest and leaves every shared byte alone', () => {
    const { dist } = fixture();
    const chromeBefore = readFileSync(join(dist, 'manifest.json'), 'utf8');
    const out = build(dist);

    const firefox = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(firefox.background).toEqual({
      scripts: ['service-worker-loader.js'],
      type: 'module',
    });
    expect(firefox.browser_specific_settings).toEqual({
      gecko: {
        id: 'bozkhar@sudoscratchy.github.io',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['websiteContent'] },
      },
    });
    expect(firefox.web_accessible_resources[0]).not.toHaveProperty('use_dynamic_url');
    expect(firefox.permissions).toEqual(['storage', 'tabs', 'scripting']);

    // The Chrome source artifact is not mutated.
    expect(JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))).toEqual(
      JSON.parse(chromeBefore),
    );
    expect(readFileSync(join(out, 'assets', 'chunk.js'), 'utf8')).toBe(
      readFileSync(join(dist, 'assets', 'chunk.js'), 'utf8'),
    );

    const audit = runNode(AUDIT, [out, '--chrome-dist', dist]);
    expect(audit.status, audit.stderr).toBe(0);
    expect(audit.stdout).toContain('Firefox manifest audit clean');
  });

  it('refuses a manifest without a service worker', () => {
    const { dist } = fixture();
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    delete manifest.background;
    writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest));

    const out = join(dirname(dist), 'dist-firefox');
    const result = runNode(BUILD, ['--dist', dist, '--out', out]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('background.service_worker');
  });

  it('refuses a manifest that names a missing file', () => {
    const { dist } = fixture();
    rmSync(join(dist, 'icons', 'icon-16.png'));

    const out = join(dirname(dist), 'dist-firefox');
    const result = runNode(BUILD, ['--dist', dist, '--out', out]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });

  it('the audit catches a changed shared file', () => {
    const { dist } = fixture();
    const out = build(dist);
    writeFileSync(
      join(out, 'assets', 'chunk.js'),
      `${readFileSync(join(out, 'assets', 'chunk.js'), 'utf8')}// drift\n`,
    );

    const audit = runNode(AUDIT, [out, '--chrome-dist', dist]);
    expect(audit.status).not.toBe(0);
    expect(audit.stdout).toContain('non-manifest files are byte-identical');
  });

  it('the audit catches a restored use_dynamic_url and a missing WAR entry', () => {
    const { dist } = fixture();
    const out = build(dist);
    const manifestPath = join(out, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.web_accessible_resources[0].use_dynamic_url = true;
    manifest.web_accessible_resources[0].resources = ['assets/dep.js'];
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const audit = runNode(AUDIT, [out, '--chrome-dist', dist]);
    expect(audit.status).not.toBe(0);
    expect(audit.stdout).toContain('no use_dynamic_url');
    expect(audit.stdout).toContain('content-loader imports are web-accessible');
  });
});
