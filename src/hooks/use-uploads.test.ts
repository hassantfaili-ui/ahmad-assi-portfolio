import { describe, expect, it } from 'vitest';

import { uploadLabel } from './use-uploads';

describe('uploadLabel', () => {
  it('says the connection dropped until the file is back past where it dropped', () => {
    const label = uploadLabel('Uploading 1440p');
    expect(label.progress(0.4)).toBe('Uploading 1440p');

    label.retry(2, 4);
    // The part that dropped starts again from its beginning, behind 0.4.
    expect(label.progress(0.32)).toBe('The connection dropped, sending it again (2 of 4)');
    expect(label.progress(0.4)).toBe('The connection dropped, sending it again (2 of 4)');

    expect(label.progress(0.41)).toBe('Uploading 1440p');
    expect(label.progress(0.9)).toBe('Uploading 1440p');
  });
});
