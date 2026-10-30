import { describe, expect, it } from 'vitest';

import {
  extractedFileName,
  isPhotoWorthOffering,
  renderScale,
  toRgba,
} from './pdf-pictures';

describe('isPhotoWorthOffering', () => {
  it('keeps a render sized image', () => {
    expect(isPhotoWorthOffering({ width: 1920, height: 1080 })).toBe(true);
  });

  it('keeps a portrait photograph', () => {
    expect(isPhotoWorthOffering({ width: 800, height: 1200 })).toBe(true);
  });

  it('drops a logo', () => {
    expect(isPhotoWorthOffering({ width: 300, height: 120 })).toBe(false);
  });

  it('drops something whose shorter side is under 320 px even when it is long', () => {
    expect(isPhotoWorthOffering({ width: 4000, height: 300 })).toBe(false);
  });

  it('drops a banner wider than six to one', () => {
    expect(isPhotoWorthOffering({ width: 4000, height: 400 })).toBe(false);
  });

  it('drops a small square that clears the shorter side but not the area', () => {
    expect(isPhotoWorthOffering({ width: 400, height: 400 })).toBe(false);
  });

  it('drops nonsense dimensions', () => {
    expect(isPhotoWorthOffering({ width: 0, height: 900 })).toBe(false);
    expect(isPhotoWorthOffering({ width: Number.NaN, height: 900 })).toBe(false);
  });
});

describe('extractedFileName', () => {
  it('names a page after the PDF with a padded page number', () => {
    expect(extractedFileName('Lincoln Beach.pdf', 'page', 3, 12)).toBe(
      'Lincoln-Beach-page-03.jpg',
    );
  });

  it('names a photo the same way', () => {
    expect(extractedFileName('boards.PDF', 'photo', 1, 4)).toBe('boards-photo-01.jpg');
  });

  it('pads to the width the count needs', () => {
    expect(extractedFileName('set.pdf', 'page', 7, 120)).toBe('set-page-007.jpg');
  });

  it('keeps the name readable but safe', () => {
    expect(extractedFileName('  Assi / Boards (final)!.pdf', 'page', 1, 1)).toBe(
      'Assi-Boards-final-page-01.jpg',
    );
  });

  it('falls back to a word when nothing readable is left', () => {
    expect(extractedFileName('???.pdf', 'photo', 2, 2)).toBe('pdf-photo-02.jpg');
    expect(extractedFileName('', 'page', 1, 1)).toBe('pdf-page-01.jpg');
  });
});

describe('renderScale', () => {
  it('scales the long edge up to the target', () => {
    expect(renderScale({ width: 800, height: 600 }, 3200, 16_000_000)).toBe(4);
  });

  it('never scales a page beyond the area cap', () => {
    // 4 would give 3200 x 3200 = 10.24 MP, over a 4 MP cap. sqrt(4M / 640000) = 2.5
    expect(renderScale({ width: 800, height: 800 }, 3200, 4_000_000)).toBeCloseTo(2.5, 5);
  });

  it('scales down when the source is already past the target', () => {
    expect(renderScale({ width: 9600, height: 6400 }, 4800, 16_000_000)).toBe(0.5);
  });

  it('returns 1 for a degenerate size rather than infinity', () => {
    expect(renderScale({ width: 0, height: 0 }, 3200, 16_000_000)).toBe(1);
  });
});

describe('toRgba', () => {
  it('passes RGBA through untouched', () => {
    const src = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = toRgba(3, src, 2, 1);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('adds an opaque alpha to RGB', () => {
    const src = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const out = toRgba(2, src, 2, 1);
    expect(Array.from(out)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it('unpacks one bit grey with rows padded to a byte, one as white', () => {
    // Two rows of three pixels: 1,0,1 then 0,1,0. Each row is one byte, high bit first.
    const src = new Uint8Array([0b10100000, 0b01000000]);
    const out = toRgba(1, src, 3, 2);
    expect(Array.from(out)).toEqual([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
    ]);
  });

  it('refuses a kind it does not know', () => {
    expect(() => toRgba(9 as 1, new Uint8Array(4), 1, 1)).toThrow(/kind/);
  });
});
