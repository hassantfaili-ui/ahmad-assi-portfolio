/**
 * Video encoding, in the browser, before anything is uploaded.
 *
 * This is the piece that lets Ahmad drag a 4K export straight out of D5 or
 * Lumion onto a page and have it work. Images have next/image and Cloudflare
 * Image Transformations to make derivatives after the fact; video has no
 * equivalent, and Workers cannot run ffmpeg, so if the file is not made smaller
 * here then every visitor downloads whatever he selected, at full size, forever.
 *
 * The parameters are not invented. They match what scripts/build-hero.sh and
 * scripts/build-walkthrough.sh produced by hand, so the encodes already on the
 * site and the ones Ahmad makes from now on are the same shape:
 *
 *   hero         1440p at 4 Mbps and 720p at 1.1 Mbps, audio discarded, because
 *                it is a muted background loop that autoplays on every visit and
 *                the size is spent from the visitor's data allowance
 *   walkthrough  1440p at 9 Mbps and 720p at 2.5 Mbps, audio kept, because it
 *                plays behind a click and the master has a real soundtrack
 *
 * Not 4K, in either case. Sixty seconds of watchable 4K is about 80MB. For the
 * hero that is downloaded before a word is read, behind a scrim, cropped to the
 * viewport. For the walkthrough, 1440p at a bitrate that fits was compared frame
 * for frame against 4K at matched display size and judged indistinguishable.
 */

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

export type TranscodeProfile = 'hero' | 'walkthrough';

export interface TranscodeEncode {
  height: 1440 | 720;
  blob: Blob;
}

export interface TranscodeResult {
  encodes: TranscodeEncode[];
  poster: Blob;
  durationSeconds: number;
  sourceWidth: number;
  sourceHeight: number;
}

export type TranscodeStage = 'reading' | 'encoding' | 'poster';

export interface TranscodeProgress {
  stage: TranscodeStage;
  /** 0 to 1 across the whole job, not within one encode. */
  fraction: number;
  label: string;
}

interface Rung {
  height: 1440 | 720;
  bitrate: number;
}

const PROFILES: Record<TranscodeProfile, { rungs: Rung[]; keepAudio: boolean }> = {
  hero: {
    rungs: [
      { height: 1440, bitrate: 4_000_000 },
      { height: 720, bitrate: 1_100_000 },
    ],
    keepAudio: false,
  },
  walkthrough: {
    rungs: [
      { height: 1440, bitrate: 9_000_000 },
      { height: 720, bitrate: 2_500_000 },
    ],
    keepAudio: true,
  },
};

/**
 * Whether this browser can encode video at all.
 *
 * Chrome, Edge and Safari 16.4 or newer can. Firefox can decode but not encode.
 * Where this is false the administration area must refuse the video and say
 * which browser to use, never fall back to uploading the original: that failure
 * is invisible until a visitor on a phone pays for it.
 */
export function canTranscode(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder === 'function' &&
    typeof window.VideoDecoder === 'function'
  );
}

export class TranscodeUnsupportedError extends Error {
  constructor() {
    super(
      'This browser cannot compress video. Use Chrome, Edge, or Safari 16.4 or newer to upload a film.',
    );
    this.name = 'TranscodeUnsupportedError';
  }
}

/**
 * Where to take the poster frame.
 *
 * Two seconds in, or the midpoint of anything shorter. The first frame is
 * frequently black or a fade in, and a black poster reads as a broken video.
 */
export function posterTimestamp(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return durationSeconds < 4 ? durationSeconds / 2 : 2;
}

async function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read the poster frame.'))),
      'image/jpeg',
      0.85,
    );
  });
}

export async function transcodeVideo(
  file: File,
  options: {
    profile?: TranscodeProfile;
    onProgress?: (progress: TranscodeProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<TranscodeResult> {
  if (!canTranscode()) throw new TranscodeUnsupportedError();

  const { profile = 'walkthrough', onProgress, signal } = options;
  const { rungs, keepAudio } = PROFILES[profile];

  const report = (stage: TranscodeStage, fraction: number, label: string) =>
    onProgress?.({ stage, fraction: Math.max(0, Math.min(1, fraction)), label });

  report('reading', 0, 'Reading the file');

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error('That file has no video in it.');
  }

  const durationSeconds = await input.computeDuration();
  const sourceWidth = videoTrack.displayWidth;
  const sourceHeight = videoTrack.displayHeight;

  /* Never upscale. A 720p export asked for at 1440p would be bigger, slower and
     no sharper, so a rung taller than the source is dropped. The shortest rung
     is always kept, otherwise a small source would produce no encode at all. */
  const applicable = rungs.filter((rung, index) => rung.height <= sourceHeight || index === rungs.length - 1);
  const wanted = applicable.length > 0 ? applicable : [rungs[rungs.length - 1]];

  /* The poster is cheap next to the encodes, so the encodes get almost all of
     the progress bar. Splitting it evenly would make the bar sit still for
     minutes and then jump, which reads as a hang. */
  const encodeShare = 0.92 / wanted.length;
  const encodes: TranscodeEncode[] = [];

  for (const [index, rung] of wanted.entries()) {
    signal?.throwIfAborted();

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        height: rung.height,
        fit: 'contain',
        codec: 'avc',
        bitrate: rung.bitrate,
        /* A keyframe every two seconds at 30fps. Seeking into a long
           walkthrough is unusable without them, and the size cost is small. */
        keyFrameInterval: 2,
      },
      audio: keepAudio ? { codec: 'aac', bitrate: 128_000 } : { discard: true },
    });

    const base = index * encodeShare;
    conversion.onProgress = (fraction) =>
      report('encoding', base + fraction * encodeShare, `Compressing to ${rung.height}p`);

    await conversion.execute();

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error(`The ${rung.height}p encode produced no data.`);

    encodes.push({ height: rung.height, blob: new Blob([buffer], { type: 'video/mp4' }) });
  }

  signal?.throwIfAborted();
  report('poster', 0.94, 'Taking the poster frame');

  const sink = new CanvasSink(videoTrack, { width: 1920, fit: 'contain' });
  const frame = await sink.getCanvas(posterTimestamp(durationSeconds));
  if (!frame) throw new Error('Could not read a poster frame from that film.');

  const poster = await canvasToBlob(frame.canvas);

  report('poster', 1, 'Done');

  return { encodes, poster, durationSeconds, sourceWidth, sourceHeight };
}
