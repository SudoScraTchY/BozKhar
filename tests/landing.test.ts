/**
 * The landing page (docs/, served by GitHub Pages) is the only download path
 * a stranger has. Its link must stay the release permalink: a branch-archive
 * link ships the SOURCE, which contains no built extension at all (dist/ is
 * gitignored), and a version-pinned asset link rots on every release (D-37).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

describe('landing page download link', () => {
  it('points at the stable release asset', () => {
    expect(html).toContain('releases/latest/download/bozkhar-latest.zip');
  });

  it('never links the source archive (it has no built extension in it)', () => {
    expect(html).not.toContain('archive/refs/heads/');
  });

  it('never pins a version in the link - that is what would rot', () => {
    expect(html).not.toMatch(/releases\/download\/v?\d/);
  });

  it('tells the user to load the extracted folder, where manifest.json lives', () => {
    expect(html).toContain('manifest.json');
  });
});
