import { describe, it, expect, afterEach } from 'vitest';
import {
  audioOptions,
  canCopy,
  canTranscode,
  planRungs,
  posterTimestamp,
  TranscodeUnsupportedError,
  walkthroughBitrate,
  type SourceFacts,
} from './transcode';

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

/* The renders Ahmad sent on 2026-10-22, as ffprobe described them. */
const render = (facts: Partial<SourceFacts>): SourceFacts => ({
  width: 2560,
  height: 1440,
  codec: 'avc',
  codecString: 'avc1.640032',
  bitrate: 26_000_000,
  ...facts,
});

describe('canCopy', () => {
  it('copies an H.264 High export at a D5 or Lumion bitrate', () => {
    expect(canCopy(render({}))).toBe(true);
    expect(canCopy(render({ codecString: 'avc1.4d401f' }))).toBe(true);
    expect(canCopy(render({ codecString: 'avc1.42e01e' }))).toBe(true);
  });

  it('re-encodes HEVC, ProRes, or a codec it could not name', () => {
    expect(canCopy(render({ codec: 'hevc', codecString: 'hvc1.1.6.L150.B0' }))).toBe(false);
    expect(canCopy(render({ codec: null, codecString: null }))).toBe(false);
  });

  it('re-encodes the H.264 profiles a browser shows as a black frame', () => {
    expect(canCopy(render({ codecString: 'avc1.6e0033' }))).toBe(false);
    expect(canCopy(render({ codecString: 'avc1.f40033' }))).toBe(false);
  });

  it('re-encodes a file whose bitrate a phone should not pay for', () => {
    expect(canCopy(render({ bitrate: 80_000_000 }))).toBe(false);
    expect(canCopy(render({ bitrate: Number.NaN }))).toBe(false);
  });

  it('re-encodes anything taller than 4K', () => {
    expect(canCopy(render({ width: 7680, height: 4320, bitrate: 20_000_000 }))).toBe(false);
  });
});

describe('planRungs for a walkthrough', () => {
  it('keeps a 1440p export as it is, with a 720p beside it', () => {
    expect(planRungs('walkthrough', render({}))).toEqual([
      { height: 1440 },
      { height: 720, bitrate: 2_500_000 },
    ]);
  });

  it('keeps a widescreen render at its own height instead of dropping it to 720p', () => {
    const [top] = planRungs('walkthrough', render({ width: 2944, height: 1248 }));
    expect(top).toEqual({ height: 1248 });
  });

  it('re-encodes a 4K master that cannot be copied at 4K, not at 1440p', () => {
    const [top] = planRungs('walkthrough', render({ width: 3840, height: 2160, bitrate: 90_000_000 }));
    expect(top).toEqual({ height: 2160, bitrate: 30_000_000 });
  });

  it('brings an 8K master down to 4K', () => {
    const [top] = planRungs('walkthrough', render({ width: 7680, height: 4320, codec: 'hevc' }));
    expect(top.height).toBe(2160);
  });

  it('makes one copy of a source 720 tall or shorter', () => {
    expect(planRungs('walkthrough', render({ width: 1280, height: 720 }))).toEqual([{ height: 720 }]);
    expect(planRungs('walkthrough', render({ width: 854, height: 480 }))).toEqual([{ height: 480 }]);
  });
});

describe('planRungs for the hero', () => {
  it('still makes the 1440p and 720p it always made, never a copy', () => {
    expect(planRungs('hero', render({}))).toEqual([
      { height: 1440, bitrate: 4_000_000 },
      { height: 720, bitrate: 1_100_000 },
    ]);
  });

  it('drops the 1440p for a shorter source but always keeps the 720p', () => {
    expect(planRungs('hero', render({ width: 1920, height: 1080 }))).toEqual([
      { height: 720, bitrate: 1_100_000 },
    ]);
  });
});

describe('walkthroughBitrate', () => {
  it('is 16 Mbps at 1440p and stops at the ceiling for 4K', () => {
    expect(walkthroughBitrate(2560, 1440)).toBe(16_000_000);
    expect(walkthroughBitrate(3840, 2160)).toBe(30_000_000);
  });

  it('never drops below 12 Mbps for a smaller frame', () => {
    expect(walkthroughBitrate(1920, 1080)).toBe(12_000_000);
  });
});

describe('audioOptions', () => {
  it('always names AAC, so a sound that cannot be copied is never made into Opus', () => {
    expect(audioOptions(true, true)).toEqual({ codec: 'aac' });
    expect(audioOptions(true, false)).toEqual({ codec: 'aac', bitrate: 128_000 });
  });

  it('drops the sound of the hero, which plays muted', () => {
    expect(audioOptions(false, true)).toEqual({ discard: true });
    expect(audioOptions(false, false)).toEqual({ discard: true });
  });
});
