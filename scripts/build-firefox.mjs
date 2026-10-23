#!/usr/bin/env node
/**
 * Firefox package from the Chrome bundle (T06.6 / D-46).
 *
 * Firefox MV3 has no background service worker, so the only manifest
 * difference that cannot be expressed in the CRXJS source is the
 * background key: Firefox takes `background.scripts` (an event page)
 * where Chrome takes `background.service_worker`. Everything else in the
 * built bundle is already portable - the worker loader is an ESM import,
 * the content loader dynamically imports a moz-extension URL (Firefox 89+),
 * and the WAR object form is shared.
 *
 * So this copies the audited dist/ and rewrites only the manifest. No
 * second bundler pass: the Firefox package is the proven Chrome bundle
 * with a Firefox manifest, and every non-manifest file stays byte-equal
 * (scripts/audit-firefox-dist.mjs proves it).
 *
 * Usage:
 *   node scripts/build-firefox.mjs
 *   node scripts/build-firefox.mjs --dist dist --out dist-firefox
 */
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_COLLECTION_REQUIRED, GECKO_ID, STRICT_MIN_VERSION } from './lib/firefox-config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function fail(message) {
  console.error(`build-firefox: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let distArg;
let outArg;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg !== '--dist' && arg !== '--out') fail(`unexpected argument: ${arg}`);
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`${arg} needs a directory`);
  if (arg === '--dist') distArg = value;
  else outArg = value;
  index += 1;
}

const distDir = resolve(ROOT, distArg ?? 'dist');
const outDir = resolve(ROOT, outArg ?? 'dist-firefox');
if (distDir === outDir) fail('--dist and --out must be different directories');
if (dirname(outDir) === outDir) fail('refusing to use a filesystem root as --out');

const chromeManifestPath = join(distDir, 'manifest.json');
if (!existsSync(chromeManifestPath)) {
  fail(`no built manifest at ${chromeManifestPath} - run \`npm run build\` first`);
}

const chrome = JSON.parse(readFileSync(chromeManifestPath, 'utf8'));
if (chrome.manifest_version !== 3)
  fail(`expected manifest_version 3, got ${chrome.manifest_version}`);
if (chrome.browser_specific_settings) {
  fail('the Chrome manifest already has browser_specific_settings - keep the source Chrome-shaped');
}

const background = chrome.background;
if (
  !background ||
  typeof background.service_worker !== 'string' ||
  background.service_worker === ''
) {
  fail('expected background.service_worker in the built Chrome manifest (CRXJS output)');
}
if (background.type !== 'module') {
  fail(`expected background.type "module" for the Firefox event page, got ${background.type}`);
}

const { service_worker: worker, ...backgroundRest } = background;
const chromeWar = chrome.web_accessible_resources ?? [];
const firefoxWar = chromeWar.map((entry) => {
  const copy = { ...entry };
  delete copy.use_dynamic_url;
  return copy;
});

const firefox = {
  ...chrome,
  background: { ...backgroundRest, scripts: [worker] },
  ...(chrome.web_accessible_resources ? { web_accessible_resources: firefoxWar } : {}),
  browser_specific_settings: {
    gecko: {
      id: GECKO_ID,
      strict_min_version: STRICT_MIN_VERSION,
      data_collection_permissions: { required: [...DATA_COLLECTION_REQUIRED] },
    },
  },
};

rmSync(outDir, { recursive: true, force: true });
cpSync(distDir, outDir, { recursive: true });

function assertFile(path, label) {
  if (typeof path !== 'string' || path === '') fail(`${label} is not a path`);
  const absolute = join(outDir, path);
  if (!existsSync(absolute)) fail(`${label} -> ${path} does not exist in ${outDir}`);
  if (!statSync(absolute).isFile()) fail(`${label} -> ${path} is not a file`);
}

for (const script of firefox.background.scripts) assertFile(script, 'background script');
for (const entry of firefox.content_scripts ?? []) {
  for (const script of entry.js ?? []) assertFile(script, 'content script');
  for (const style of entry.css ?? []) assertFile(style, 'content stylesheet');
}
for (const [size, path] of Object.entries(firefox.icons ?? {})) assertFile(path, `icon ${size}`);
for (const [size, path] of Object.entries(firefox.action?.default_icon ?? {})) {
  assertFile(path, `action icon ${size}`);
}
if (firefox.action?.default_popup) assertFile(firefox.action.default_popup, 'action popup');
if (firefox.options_ui?.page) assertFile(firefox.options_ui.page, 'options page');
for (const [index, entry] of firefoxWar.entries()) {
  for (const resource of entry.resources ?? []) {
    // CRXJS emits exact paths. A glob would need an expansion rule here;
    // fail closed so a future manifest shape cannot ship unchecked.
    if (resource.includes('*')) fail(`WAR entry ${index} uses a glob resource: ${resource}`);
    assertFile(resource, `web_accessible_resources[${index}]`);
  }
}

writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(firefox, null, 2)}\n`);

console.log(`Firefox package: ${outDir}`);
console.log(`  version            ${firefox.version}`);
console.log(`  background         ${worker} (module, event page)`);
console.log(`  gecko id           ${GECKO_ID}`);
console.log(`  minimum Firefox    ${STRICT_MIN_VERSION}`);
console.log(`  data collection    ${DATA_COLLECTION_REQUIRED.join(', ')}`);
console.log(
  `  WAR resources      ${firefoxWar.reduce((n, e) => n + (e.resources?.length ?? 0), 0)}`,
);
