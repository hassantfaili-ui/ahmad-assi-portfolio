import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({
  video: { displayWidth: 2560, displayHeight: 1440, codec: null, getCodecParameterString: async () => null },
  getVideo: vi.fn(),
  dispose: vi.fn(),
  init: vi.fn(),
  getCanvas: vi.fn(),
  native: vi.fn(),
}));

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  BufferTarget: class { buffer = new ArrayBuffer(16); },
  Mp4OutputFormat: class {},
  Output: class { constructor(public options: { target: unknown }) {} get target() { return this.options.target; } },
  Input: class {
    getPrimaryVideoTrack = media.getVideo;
    computeDuration = async () => 10;
    dispose = media.dispose;
  },
  Conversion: { init: media.init },
  CanvasSink: class { getCanvas = media.getCanvas; },
}));

vi.mock('./transcode-native', () => ({ transcodeNativeVideo: media.native }));

import { transcodeVideo } from './transcode';

function conversion({ video = true, valid = true, reason = 'no_encodable_target_codec' } = {}) {
  const result = {
    isValid: valid,
    utilizedTracks: video ? [media.video] : [],
    discardedTracks: video ? [] : [{ track: media.video, reason }],
    state: 'idle',
    execute: vi.fn(async () => { result.state = 'done'; }),
    cancel: vi.fn(async () => { result.state = 'canceled'; }),
  };
  return result;
}

const file = new File(['video'], 'phone-film.mp4', { type: 'video/mp4' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { VideoEncoder() {}, VideoDecoder() {} });
  media.video.displayHeight = 1440;
  media.getVideo.mockResolvedValue(media.video);
  media.getCanvas.mockResolvedValue({ canvas: { convertToBlob: async () => new Blob(['poster']) } });
  media.init.mockImplementation(async () => conversion());
});

afterEach(() => vi.unstubAllGlobals());

describe('film conversion on phones', () => {
  it('falls back to 720p when the phone rejects the 1440p output', async () => {
    const unsupported = conversion({ video: false, valid: false });
    const supported = conversion();
    media.init.mockResolvedValueOnce(unsupported).mockResolvedValueOnce(supported);

    const result = await transcodeVideo(file, { profile: 'hero' });

    expect(result.encodes.map(({ height }) => height)).toEqual([720]);
    expect(unsupported.execute).not.toHaveBeenCalled();
    expect(unsupported.cancel).toHaveBeenCalledOnce();
    expect(supported.execute).toHaveBeenCalledOnce();
    expect(result.poster.size).toBeGreaterThan(0);
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('rejects audio-only conversions even when the container is valid', async () => {
    const audioOnly = conversion({ video: false });
    media.init.mockResolvedValueOnce(audioOnly);

    const result = await transcodeVideo(file);

    expect(result.encodes.map(({ height }) => height)).toEqual([720]);
    expect(audioOnly.execute).not.toHaveBeenCalled();
  });

  it('keeps both renditions on a browser that supports them', async () => {
    const result = await transcodeVideo(file);
    expect(result.encodes.map(({ height }) => height)).toEqual([1440, 720]);
    expect(media.init.mock.calls[0][0].tracks).toBe('primary');
  });

  it('explains unsupported encoding without executing an invalid conversion', async () => {
    const unsupported = conversion({ video: false, valid: false });
    media.init.mockResolvedValue(unsupported);

    await expect(transcodeVideo(file)).rejects.toThrow('even at 720p');
    expect(unsupported.execute).not.toHaveBeenCalled();
    expect(media.getCanvas).not.toHaveBeenCalled();
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('uses native phone playback when WebCodecs cannot decode the source', async () => {
    const undecodable = conversion({ video: false, valid: false, reason: 'undecodable_source_codec' });
    media.init.mockResolvedValue(undecodable);

    media.native.mockResolvedValue({ encodes: [{ height: 720 }], poster: new Blob(['poster']) });
    const result = await transcodeVideo(file, { profile: 'hero' });
    expect(result.encodes.map(({ height }) => height)).toEqual([720]);
    expect(media.native).toHaveBeenCalledWith(file, expect.objectContaining({ keepAudio: false, bitrate: 1_100_000 }));
    expect(undecodable.execute).not.toHaveBeenCalled();
    expect(media.init).toHaveBeenCalledOnce();
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('keeps the soundtrack when native playback handles an unknown source codec', async () => {
    media.init.mockResolvedValue(conversion({ video: false, valid: false, reason: 'unknown_source_codec' }));
    media.native.mockResolvedValue({ encodes: [{ height: 720 }] });

    await transcodeVideo(file, { profile: 'walkthrough' });

    expect(media.native).toHaveBeenCalledWith(file, expect.objectContaining({ keepAudio: true, bitrate: 2_500_000 }));
  });

  it('releases the input when native playback cannot read the file either', async () => {
    media.init.mockResolvedValue(conversion({ video: false, valid: false, reason: 'undecodable_source_codec' }));
    media.native.mockRejectedValue(new Error('Export it as an H.264 MP4'));

    await expect(transcodeVideo(file)).rejects.toThrow('Export it as an H.264 MP4');
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('does not upscale a small source to 720p', async () => {
    media.video.displayHeight = 480;
    await transcodeVideo(file);
    expect(media.init).toHaveBeenCalledOnce();
    expect(media.init.mock.calls[0][0].video.height).toBe(480);
  });

  it('releases the input if reading fails', async () => {
    media.getVideo.mockRejectedValue(new Error('Cannot read file'));
    await expect(transcodeVideo(file)).rejects.toThrow('Cannot read file');
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('cancels the active encoder when the upload is cancelled', async () => {
    const controller = new AbortController();
    const active = conversion();
    active.execute.mockImplementation(async () => { controller.abort(); });
    media.init.mockResolvedValue(active);

    await expect(transcodeVideo(file, { signal: controller.signal })).rejects.toThrow();
    expect(active.cancel).toHaveBeenCalled();
    expect(media.getCanvas).not.toHaveBeenCalled();
    expect(media.dispose).toHaveBeenCalledOnce();
  });
});
