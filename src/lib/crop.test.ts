import { describe, expect, it } from 'vitest';

import {
  CENTRE,
  clampFocus,
  cropFrame,
  cropRect,
  croppedSrc,
  isRatio,
  objectPosition,
  parseCroppedSrc,
  ratioValue,
  toRatio,
} from './crop';

const landscape = { width: 7200, height: 4800 };
const portrait = { width: 3000, height: 4000 };

describe('ratios', () => {
  it('reads a shape as width over height', () => {
    expect(ratioValue('16:9')).toBeCloseTo(16 / 9);
    expect(ratioValue('1:1')).toBe(1);
    expect(ratioValue('9:16')).toBeCloseTo(9 / 16);
  });

  it('knows its own shapes and nothing else', () => {
    expect(isRatio('16:9')).toBe(true);
    expect(isRatio('16x9')).toBe(false);
    expect(isRatio(null)).toBe(false);
    expect(isRatio(1.78)).toBe(false);
    expect(toRatio('4:3')).toBe('4:3');
    expect(toRatio('auto')).toBeNull();
  });
});

describe('cropFrame', () => {
  it('keeps the full height of a picture wider than the shape', () => {
    expect(cropFrame(landscape, '1:1')).toEqual({ width: 4800, height: 4800 });
  });

  it('keeps the full width of a picture taller than the shape', () => {
    expect(cropFrame(landscape, '16:9')).toEqual({ width: 7200, height: 4050 });
    expect(cropFrame(portrait, '1:1')).toEqual({ width: 3000, height: 3000 });
  });

  /* The whole point: a 7200 wide master cut to 16:9 is still 7200 wide. */
  it('never shrinks the master, only cuts it', () => {
    const frame = cropFrame(landscape, '21:9');
    expect(frame.width).toBe(7200);
    expect(frame.height).toBe(Math.floor(7200 / (21 / 9)));
  });

  it('is the master itself with no shape chosen', () => {
    expect(cropFrame(landscape, null)).toEqual(landscape);
  });

  it('assumes the size the page assumes when the master was never measured', () => {
    expect(cropFrame({ width: null, height: null }, null)).toEqual({ width: 1600, height: 1067 });
    expect(cropFrame({ width: 0, height: 0 }, '1:1')).toEqual({ width: 1067, height: 1067 });
  });
});

describe('cropRect', () => {
  it('is nothing when the picture is shown whole', () => {
    expect(cropRect(landscape, null, CENTRE)).toBeNull();
  });

  it('is nothing when the picture already has the shape', () => {
    expect(cropRect({ width: 1600, height: 900 }, '16:9', CENTRE)).toBeNull();
  });

  it('cuts evenly from both sides at the centre', () => {
    expect(cropRect(landscape, '1:1', CENTRE)).toEqual({
      left: 1200, top: 0, width: 4800, height: 4800, right: 1200, bottom: 0,
    });
    expect(cropRect(landscape, '16:9', CENTRE)).toEqual({
      left: 0, top: 375, width: 7200, height: 4050, right: 0, bottom: 375,
    });
  });

  it('accounts for every pixel of the master between the window and the edges', () => {
    const rect = cropRect(landscape, '21:9', { x: 0.3, y: 0.8 })!;
    expect(rect.left + rect.width + rect.right).toBe(landscape.width);
    expect(rect.top + rect.height + rect.bottom).toBe(landscape.height);
  });

  it('keeps the edge the focus points at', () => {
    expect(cropRect(landscape, '1:1', { x: 0, y: 0.5 })).toMatchObject({ left: 0 });
    expect(cropRect(landscape, '1:1', { x: 1, y: 0.5 })).toMatchObject({ left: 2400 });
    expect(cropRect(landscape, '16:9', { x: 0.5, y: 1 })).toMatchObject({ top: 750 });
  });

  it('never reaches past an edge, whatever the focus says', () => {
    const rect = cropRect(landscape, '1:1', { x: 7, y: -3 })!;
    expect(rect.left + rect.width).toBeLessThanOrEqual(landscape.width);
    expect(rect.top).toBe(0);
  });
});

describe('clampFocus', () => {
  it('holds a stray value to the edge and a missing one to the middle', () => {
    expect(clampFocus({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    expect(clampFocus(null)).toEqual(CENTRE);
    expect(clampFocus({ x: Number.NaN, y: 0.25 })).toEqual({ x: 0.5, y: 0.25 });
  });
});

describe('the crop inside a src', () => {
  it('rides as a query string the loader can strip, edges in the order Cloudflare takes them', () => {
    const rect = cropRect(landscape, '1:1', CENTRE);
    const src = croppedSrc('projects/a/b.jpg', rect);
    expect(src).toBe('projects/a/b.jpg?trim=0,1200,0,1200');
    expect(parseCroppedSrc(src)).toEqual({
      key: 'projects/a/b.jpg',
      trim: { top: 0, right: 1200, bottom: 0, left: 1200 },
    });
  });

  it('is the bare key with nothing to cut', () => {
    expect(croppedSrc('projects/a/b.jpg', null)).toBe('projects/a/b.jpg');
    expect(parseCroppedSrc('projects/a/b.jpg')).toEqual({ key: 'projects/a/b.jpg', trim: null });
  });

  it('ignores edges it cannot read rather than serving a broken URL', () => {
    expect(parseCroppedSrc('a.jpg?trim=1,2')).toEqual({ key: 'a.jpg', trim: null });
    expect(parseCroppedSrc('a.jpg?trim=1,-2,0,4')).toEqual({ key: 'a.jpg', trim: null });
    expect(parseCroppedSrc('a.jpg?trim=x,2,3,4')).toEqual({ key: 'a.jpg', trim: null });
    expect(parseCroppedSrc('a.jpg?trim=0,0,0,0')).toEqual({ key: 'a.jpg', trim: null });
    expect(parseCroppedSrc('a.jpg?other=1')).toEqual({ key: 'a.jpg', trim: null });
  });
});

describe('objectPosition', () => {
  it('turns the focus into the CSS that keeps the same window', () => {
    expect(objectPosition(CENTRE)).toBe('50% 50%');
    expect(objectPosition({ x: 0, y: 1 })).toBe('0% 100%');
    expect(objectPosition({ x: 1 / 3, y: 0.5 })).toBe('33.33% 50%');
  });
});
