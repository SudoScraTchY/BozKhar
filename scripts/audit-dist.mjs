#!/usr/bin/env node
/**
 * Build-integrity gate (T06.4, NFR-06).
 *
 * `tests/manifest.test.ts` audits the manifest SOURCE; this audits the
 * artifact the bundler emits, after crxjs has rewritten it - the file a
 * store reviewer and the user's browser both read. It fails the build if
 * the shipped extension ever gains a capability the decision log has not
 * agreed to: a permission, a host match, an untracked manifest key, or a
 * version that does not match package.json (the release tag is cut from
 * that number).
 *
 * Usage: node scripts/audit-dist.mjs [distDir]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = process.argv[2] ?? join(ROOT, 'dist');

/** The audited surface: exactly what SDD 06 / NFR-06 grants. */
const EXPECTED_VERSION = 3;
const EXPECTED_PERMISSIONS = ['storage', 'tabs', 'scripting'];
const EXPECTED_HOST_PERMISSIONS = ['https://*.digikala.com/*', 'https://api.torob.com/*'];
/** Content scripts and web-accessible assets stay on Digikala only. */
const EXPECTED_CONTENT_ORIGINS = ['https://*.digikala.com/*'];
/**
 * Every top-level key the manifest is allowed to carry. Anything new -
 * `optional_permissions`, `externally_connectable`, `commands` - lands
 * here only after a decision-log entry, so it cannot slip in unreviewed.
 */
const ALLOWED_KEYS = [
  'manifest_version',
  'name',
  'short_name',
  'version',
  'description',
  'icons',
  'permissions',
  'host_permissions',
  'background',
  'options_ui',
  'content_scripts',
  'action',
  'web_accessible_resources',
];

const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} = ${JSON.stringify(actual)}`);
  if (!ok) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The distinct origins every entry of an MV3 matches-list grants. */
function originsOf(entries) {
  return [...new Set(entries.flatMap((entry) => entry.matches ?? []))].sort();
}

const manifestPath = join(DIST, 'manifest.json');
let manifest;
try {
  manifest = readJson(manifestPath);
} catch {
  console.error(`no built manifest at ${manifestPath} - run \`npm run build\` first`);
  process.exit(1);
}

console.log(`auditing ${manifestPath}\n`);
const { version } = readJson(join(ROOT, 'package.json'));

check('manifest_version', manifest.manifest_version, EXPECTED_VERSION);
check('version (package.json)', manifest.version, version);
check('permissions', manifest.permissions, EXPECTED_PERMISSIONS);
check('host_permissions', manifest.host_permissions, EXPECTED_HOST_PERMISSIONS);
check(
  'content_scripts matches',
  originsOf(manifest.content_scripts ?? []),
  EXPECTED_CONTENT_ORIGINS,
);
check(
  'web_accessible_resources matches',
  originsOf(manifest.web_accessible_resources ?? []),
  EXPECTED_CONTENT_ORIGINS,
);

const unknown = Object.keys(manifest).filter((key) => !ALLOWED_KEYS.includes(key));
check('untracked manifest keys', unknown, []);

if (failures.length > 0) {
  console.error(
    `\n${failures.length} violation(s): the build does not match the audited manifest` +
      ' (NFR-06 / SDD/00-decision-log.md). Amend the SDD first, then this allowlist.',
  );
  process.exit(1);
}
console.log('\nmanifest audit clean');
