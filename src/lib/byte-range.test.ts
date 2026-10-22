import { describe, expect, it } from 'vitest';

import { parseRange } from '@/lib/byte-range';

describe('parseRange', () => {
  it('reads an open ended range to the last byte', () => {
    expect(parseRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999 });
  });

  it('reads a closed range and clamps it to the file', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('reads a suffix range as the last bytes', () => {
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('refuses a range that starts past the end', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=500-400', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
  });

  it('serves the whole file for no header or one it does not understand', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-9', 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
  });
});
