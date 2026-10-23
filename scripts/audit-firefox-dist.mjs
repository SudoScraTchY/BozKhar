#!/usr/bin/env node
/**
 * Firefox artifact audit (T06.6 / D-46).
 *
 * The Chrome audit (scripts/audit-dist.mjs) stays the authoritative gate
 * for permissions and origins. This one proves the Firefox package is the
 * same audited bundle with a Firefox manifest:
 *
 *   - shared manifest fields equal the Chrome artifact;
 *   - the background is `scripts` (module event page), not a worker;
 *   - no `use_dynamic_url`, no static-module content scripts, no extra keys;
 *   - the Gecko identity and data-collection declaration are exactly right;
 *   - every file the manifest names exists, and every chunk the content
 *     loader imports is web-accessible (a missing WAR entry would only
 *     fail at runtime, inside Firefox);
 *   - every non-manifest file is byte-identical to dist/.
 *
 * Usage:
 *   node scripts/audit-firefox-dist.mjs
 *   node scripts/audit-firefox-dist.mjs dist-firefox --chrome-dist dist
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { DATA_COLLECTION_REQUIRED, GECKO_ID, STRICT_MIN_VERSION } from './lib/firefox-config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const failures = [];

function fail(message) {
  console.error(`audit-firefox-dist: ${message}`);
  process.exit(1);
}

function check(label, actual, expected) {
  const ok = isDeepStrictEqual(actual, expected);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} = ${JSON.stringify(actual)}`);
  if (!ok) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  return ok;
}

function expect(label, condition, detail) {
  console.log(
    `${condition ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ` = ${detail}`}`,
  );
  if (!condition) failures.push(`${label}${detail === undefined ? '' : `: ${detail}`}`);
  return condition;
}

const args = process.argv.slice(2);
let distArg;
let chromeArg;
const positionals = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--chrome-dist') {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail('--chrome-dist needs a directory');
    chromeArg = value;
    index += 1;
  } else if (arg.startsWith('--')) {
    fail(`unexpected argument: ${arg}`);
  } else {
    positionals.push(arg);
  }
}
if (positionals.length > 1) fail('at most one positional Firefox dist directory');
distArg = positionals[0];

const firefoxDir = resolve(ROOT, distArg ?? 'dist-firefox');
const chromeDir = resolve(ROOT, chromeArg ?? 'dist');
const firefoxManifestPath = join(firefoxDir, 'manifest.json');
const chromeManifestPath = join(chromeDir, 'manifest.json');
if (!existsSync(firefoxManifestPath)) {
  fail(`no Firefox manifest at ${firefoxManifestPath} - run \`npm run build:firefox\` first`);
}
if (!existsSync(chromeManifestPath)) {
  fail(`no Chrome manifest at ${chromeManifestPath} - run \`npm run build\` first`);
}

const firefox = JSON.parse(readFileSync(firefoxManifestPath, 'utf8'));
const chrome = JSON.parse(readFileSync(chromeManifestPath, 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

console.log(`auditing ${firefoxManifestPath}\n`);

check('manifest_version (Firefox)', firefox.manifest_version, 3);
check('manifest_version (Chrome)', chrome.manifest_version, 3);
check('version (package.json)', firefox.version, pkg.version);
check('version matches the Chrome artifact', firefox.version, chrome.version);
check('permissions', firefox.permissions, chrome.permissions);
check('host_permissions', firefox.host_permissions, chrome.host_permissions);
check('content_scripts', firefox.content_scripts ?? [], chrome.content_scripts ?? []);
check(
  'content scripts do not use static ESM',
  (firefox.content_scripts ?? []).some((entry) => entry.type === 'module'),
  false,
);

const warProjection = (entries) =>
  (entries ?? []).map((entry) => ({
    resources: entry.resources ?? [],
    matches: entry.matches ?? [],
    ...(entry.extension_ids ? { extension_ids: entry.extension_ids } : {}),
  }));
check(
  'web_accessible_resources',
  warProjection(firefox.web_accessible_resources),
  warProjection(chrome.web_accessible_resources),
);
check(
  'no use_dynamic_url (unsupported in Firefox)',
  (firefox.web_accessible_resources ?? []).filter((entry) => 'use_dynamic_url' in entry).length,
  0,
);

const chromeWorker = chrome.background?.service_worker;
check('background.scripts', firefox.background?.scripts, [chromeWorker]);
check('background.type', firefox.background?.type, 'module');
check('background.service_worker removed', 'service_worker' in (firefox.background ?? {}), false);

check('browser_specific_settings.gecko', firefox.browser_specific_settings?.gecko, {
  id: GECKO_ID,
  strict_min_version: STRICT_MIN_VERSION,
  data_collection_permissions: { required: [...DATA_COLLECTION_REQUIRED] },
});
const geckoId = firefox.browser_specific_settings?.gecko?.id ?? '';
expect('Gecko id is AMO-shaped', /^[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+$/.test(geckoId), geckoId);
expect(
  'strict_min_version covers world:MAIN and the consent UI',
  Number.parseFloat(firefox.browser_specific_settings?.gecko?.strict_min_version ?? '0') >= 140,
);

const chromeKeys = Object.keys(chrome);
const firefoxKeys = Object.keys(firefox);
check(
  'shared top-level keys',
  firefoxKeys.filter((key) => key !== 'browser_specific_settings'),
  chromeKeys,
);
check(
  'Firefox-only keys',
  firefoxKeys.filter((key) => !chromeKeys.includes(key)),
  ['browser_specific_settings'],
);
expect('Chrome artifact has no Firefox keys', !('browser_specific_settings' in chrome));

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute, base));
    else if (entry.isFile()) out.push(relative(base, absolute).split(sep).join('/'));
  }
  return out.sort();
}

const firefoxFiles = walk(firefoxDir);
const chromeFiles = walk(chromeDir);
const manifestOnly = (files) => files.filter((file) => file !== 'manifest.json');
check('non-manifest file list', manifestOnly(firefoxFiles), manifestOnly(chromeFiles));

const changed = [];
for (const file of manifestOnly(chromeFiles)) {
  if (!firefoxFiles.includes(file)) continue;
  if (!readFileSync(join(chromeDir, file)).equals(readFileSync(join(firefoxDir, file)))) {
    changed.push(file);
  }
}
check('non-manifest files are byte-identical', changed, []);

const forbidden = firefoxFiles.filter((file) =>
  ['.map', '.pem', '.crx', '.xpi'].includes(extname(file).toLowerCase()),
);
check('no private keys, packs or sourcemaps', forbidden, []);

const missingFiles = [];
const addFile = (path, label) => {
  if (typeof path !== 'string' || path === '') {
    missingFiles.push(`${label} is not a path`);
    return;
  }
  const absolute = join(firefoxDir, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    missingFiles.push(`${label} -> ${path}`);
  }
};
for (const script of firefox.background?.scripts ?? []) addFile(script, 'background script');
for (const entry of firefox.content_scripts ?? []) {
  for (const script of entry.js ?? []) addFile(script, 'content script');
  for (const style of entry.css ?? []) addFile(style, 'content stylesheet');
}
for (const [size, path] of Object.entries(firefox.icons ?? {})) addFile(path, `icon ${size}`);
for (const [size, path] of Object.entries(firefox.action?.default_icon ?? {})) {
  addFile(path, `action icon ${size}`);
}
if (firefox.action?.default_popup) addFile(firefox.action.default_popup, 'action popup');
if (firefox.options_ui?.page) addFile(firefox.options_ui.page, 'options page');
for (const [index, entry] of (firefox.web_accessible_resources ?? []).entries()) {
  for (const resource of entry.resources ?? []) {
    if (resource.includes('*')) {
      failures.push(`web_accessible_resources[${index}] uses a glob: ${resource}`);
      continue;
    }
    addFile(resource, `web_accessible_resources[${index}]`);
  }
}
check('manifest-referenced files exist', missingFiles, []);

const warResources = new Set(
  (firefox.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? []),
);
const visited = new Set();
const missingImports = [];
const notAccessible = [];

function resolveSpecifier(importer, specifier) {
  return posix.normalize(posix.join(posix.dirname(importer), specifier));
}

/** Extension URLs and relative ESM imports the content script loads. */
function referencesOf(text, importer) {
  const references = [];
  for (const match of text.matchAll(/chrome\.runtime\.getURL\(\s*["']([^"']+)["']\s*\)/g)) {
    references.push({ path: match[1], mustBeAccessible: true });
  }
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    references.push({
      path: resolveSpecifier(importer, specifier),
      mustBeAccessible: specifier.endsWith('.js'),
    });
  }
  return references;
}

function scanContentModule(relativePath) {
  if (visited.has(relativePath)) return;
  visited.add(relativePath);
  const absolute = join(firefoxDir, relativePath);
  if (!existsSync(absolute)) {
    missingImports.push(`${relativePath} (entry)`);
    return;
  }
  const text = readFileSync(absolute, 'utf8');
  for (const reference of referencesOf(text, relativePath)) {
    const target = join(firefoxDir, reference.path);
    if (!existsSync(target) || !statSync(target).isFile()) {
      missingImports.push(`${relativePath} -> ${reference.path}`);
      continue;
    }
    if (reference.mustBeAccessible && !warResources.has(reference.path)) {
      notAccessible.push(`${relativePath} -> ${reference.path}`);
    }
    if (reference.path.endsWith('.js')) scanContentModule(reference.path);
  }
}

for (const entry of firefox.content_scripts ?? []) {
  for (const script of entry.js ?? []) scanContentModule(script);
}
check('content-loader imports resolve', missingImports, []);
check('content-loader imports are web-accessible', notAccessible, []);

const brokenHtml = [];
for (const file of firefoxFiles.filter((name) => name.endsWith('.html'))) {
  const text = readFileSync(join(firefoxDir, file), 'utf8');
  for (const match of text.matchAll(/(?:src|href)="(\/[^"#?]*)/g)) {
    const target = match[1].replace(/^\//, '');
    if (target === '') continue;
    if (!existsSync(join(firefoxDir, target))) brokenHtml.push(`${file} -> ${match[1]}`);
  }
}
check('root-absolute HTML references resolve', brokenHtml, []);

const chromeExtensionLiterals = [];
for (const file of firefoxFiles.filter((name) => name.endsWith('.js'))) {
  if (readFileSync(join(firefoxDir, file), 'utf8').includes('chrome-extension://')) {
    chromeExtensionLiterals.push(file);
  }
}
check('no chrome-extension:// literals', chromeExtensionLiterals, []);

if (failures.length > 0) {
  console.error(
    `\n${failures.length} violation(s): the Firefox package is not the audited Chrome bundle` +
      ' with a Firefox manifest (T06.6 / D-46).',
  );
  process.exit(1);
}
console.log('\nFirefox manifest audit clean');
