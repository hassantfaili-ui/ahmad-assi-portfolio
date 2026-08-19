import { describe, it, expect, afterEach } from 'vitest';
import { canTranscode, posterTimestamp, TranscodeUnsupportedError } from './transcode';

type Windowish = { VideoEncoder?: unknown; VideoDecoder?: unknown };

function setWindow(value: Windowish | undefined) {
  (globalThis as { window?: unknown }).window = value;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('canTranscode', () => {
  it('is false when there is no window at all, as on the server', () => {
    setWindow(undefined);
    expect(canTranscode()).toBe(false);
  });

  it('is false in a browser without VideoEncoder, which is Firefox', () => {
    setWindow({ VideoDecoder: function () {} });
    expect(canTranscode()).toBe(false);
  });

  it('is false when it can decode but not encode', () => {
    setWindow({ VideoDecoder: function () {}, VideoEncoder: undefined });
    expect(canTranscode()).toBe(false);
  });

  it('is true only when both encoder and decoder are constructors', () => {
    setWindow({ VideoEncoder: function () {}, VideoDecoder: function () {} });
    expect(canTranscode()).toBe(true);
  });

  it('is false when the names exist but are not callable', () => {
    setWindow({ VideoEncoder: {}, VideoDecoder: {} });
    expect(canTranscode()).toBe(false);
  });
});

describe('TranscodeUnsupportedError', () => {
  it('names the browsers that do work, because the message is read by Ahmad', () => {
    const error = new TranscodeUnsupportedError();
    expect(error.message).toContain('Chrome');
    expect(error.message).toContain('Safari');
    expect(error.name).toBe('TranscodeUnsupportedError');
  });
});

describe('posterTimestamp', () => {
  it('takes two seconds in for anything of a normal length', () => {
    expect(posterTimestamp(67)).toBe(2);
    expect(posterTimestamp(4)).toBe(2);
  });

  it('takes the midpoint of a clip shorter than four seconds', () => {
    expect(posterTimestamp(3)).toBe(1.5);
    expect(posterTimestamp(1)).toBe(0.5);
  });

  it('never returns a timestamp past the end of the film', () => {
    for (const duration of [0.5, 1, 2, 3, 3.9, 4, 10]) {
      expect(posterTimestamp(duration)).toBeLessThan(duration);
    }
  });

  it('returns zero rather than NaN for a duration it cannot read', () => {
    expect(posterTimestamp(0)).toBe(0);
    expect(posterTimestamp(-1)).toBe(0);
    expect(posterTimestamp(Number.NaN)).toBe(0);
    expect(posterTimestamp(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
