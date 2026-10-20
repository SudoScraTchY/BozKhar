/**
 * The popup's GitHub link and update pill are the two small affordances the
 * user asked for. The update pill must start hidden (showUpdateIfAny reveals
 * it only when GitHub reports a newer tag) and both links must point at the
 * repository/release permalink, not a version-pinned URL that rots.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELEASES_URL, REPO_URL } from '../src/shared/update';

const html = readFileSync(new URL('../src/popup/index.html', import.meta.url), 'utf8');

describe('popup GitHub link', () => {
  it('points the star icon at the repository', () => {
    expect(REPO_URL).toBe('https://github.com/SudoScraTchY/BozKhar');
    expect(html).toContain(`href="${REPO_URL}"`);
    expect(html).toContain('id="githubLink"');
  });

  it('opens in a new tab without a referrer or opener', () => {
    expect(html).toMatch(/id="githubLink"[\s\S]*?rel="noreferrer noopener"/);
    expect(html).toMatch(/id="githubLink"[\s\S]*?target="_blank"/);
  });

  it('has a localized accessible label', () => {
    expect(html).toContain('data-i18n-title="popupStarGithub"');
  });
});

describe('popup update notice', () => {
  it('starts hidden and points at the release permalink', () => {
    expect(RELEASES_URL).toBe('https://github.com/SudoScraTchY/BozKhar/releases/latest');
    expect(html).toContain(`href="${RELEASES_URL}"`);
    expect(html).toMatch(/id="updateLink"[\s\S]*?hidden/);
  });

  it('never pins a version in the link', () => {
    expect(html).not.toMatch(/releases\/download\/v?\d/);
  });
});
