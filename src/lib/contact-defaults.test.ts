import { describe, expect, it } from 'vitest';

import { CONTACT_DEFAULTS } from './contact-defaults';

/**
 * The contact page falls back to these when Ahmad has left a box empty, and so
 * does the save. Both sides reading the same constant is the point: the page
 * showing one wording while the box under it is blank, and the save writing a
 * third, is how a heading ends up different from the heading he was shown.
 */
describe('what the contact page says when nothing has been written', () => {
  it('has words for every part of the page that used to be fixed', () => {
    expect(CONTACT_DEFAULTS.status.trim()).not.toBe('');
    expect(CONTACT_DEFAULTS.heading.trim()).not.toBe('');
    expect(CONTACT_DEFAULTS.blurb.trim()).not.toBe('');
  });

  it('keeps the wording the site launched with, so nothing on the page changes by itself', () => {
    expect(CONTACT_DEFAULTS.status).toBe('Available now');
    expect(CONTACT_DEFAULTS.heading).toBe('Write to me');
    expect(CONTACT_DEFAULTS.blurb).toMatch(/^Email is best, and it reaches me directly\./);
  });

  it('uses no dash characters, which the house style does not allow', () => {
    const all = Object.values(CONTACT_DEFAULTS).join(' ');
    expect(all).not.toMatch(/[–—]/);
  });
});
