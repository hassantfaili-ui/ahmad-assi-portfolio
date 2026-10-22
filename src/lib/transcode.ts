/**
 * Video encoding, in the browser, before anything is uploaded.
 *
 * This is the piece that lets Ahmad drag a 4K export straight out of D5 or
 * Lumion onto a page and have it work. Images have next/image and Cloudflare
 * Image Transformations to make derivatives after the fact; video has no
 * equivalent, and Workers cannot run ffmpeg, so if the file is not made smaller
 * here then every visitor downloads whatever he selected, at full size, forever.
 *
 * The hero's parameters are not invented. They match what scripts/build-hero.sh
 * produced by hand:
 *
 *   hero         1440p at 4 Mbps and 720p at 1.1 Mbps, audio discarded, because
 *                it is a muted background loop that autoplays on every visit and
 *                the size is spent from the visitor's data allowance
 *   walkthrough  the film at its own resolution, and a 720p at 2.5 Mbps beside
 *                it, audio kept, because it plays behind a click and the master
 *                has a real soundtrack
 *
 * The walkthrough used to be squeezed into a 1440p at 9 Mbps, like the one
 * scripts/build-walkthrough.sh made for Lincoln Beach. That undid the reason
 * for exporting at high quality in the first place: a 1440p export at 26 Mbps
 * came out at a third of its bitrate, and anything shorter than 1440 pixels,
 * a 2944x1248 widescreen render say, had its top copy dropped and was shown at
 * 720p. So a walkthrough that is already H.264 at a sane bitrate is now copied
 * into the MP4 untouched, frame for frame, and only re-encoded when it has to
 * be: a ProRes master, an HEVC file from a phone, a 4K export at 100 Mbps.
 * Even then it keeps its own resolution, up to 4K, never squeezed to 1440.
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
  /** The encode's own height in pixels: 720, 1440, or a walkthrough's own. */
  height: number;
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

/**
 * One encode to make. A rung with no bitrate is the source copied across as it
 * is, which is only ever planned for a walkthrough that is already fit to play.
 */
export interface Rung {
  height: number;
  bitrate?: number;
}

const HERO_RUNGS: Rung[] = [
  { height: 1440, bitrate: 4_000_000 },
  { height: 720, bitrate: 1_100_000 },
];

/** The copy beside a walkthrough for a phone, or a browser the big one fails in. */
const WALKTHROUGH_SMALL: Rung = { height: 720, bitrate: 2_500_000 };

/**
 * Past this a walkthrough is re-encoded rather than copied, even when it is
 * already H.264. A D5 or Lumion export at "high" lands between 18 and 28 Mbps,
 * which is comfortably under it; a 4K export at 80 Mbps is not, and a visitor
 * who presses play on a phone would pay for every bit of that.
 */
export const COPY_MAX_BITRATE = 30_000_000;

/** Nothing is kept taller than 4K. An 8K master is made into a 4K copy. */
export const MAX_HEIGHT = 2160;

/**
 * The H.264 profiles every browser that plays MP4 can decode: Baseline, Main
 * and High. High 10 and the 4:2:2 and 4:4:4 profiles are what a colour graded
 * export can carry, and Chrome and Safari show a black frame for them.
 */
const PLAYABLE_AVC_PROFILES = new Set([0x42, 0x4d, 0x64]);

export interface SourceFacts {
  width: number;
  height: number;
  /** Mediabunny's name for the codec, 'avc' for H.264, or null if unknown. */
  codec: string | null;
  /** The full codec string, avc1.640033 say, which carries the profile. */
  codecString: string | null;
  /** The whole file's average, bits per second. */
  bitrate: number;
}

/** Whether the source can go on the page as it is, without being re-encoded. */
export function canCopy(source: SourceFacts): boolean {
  if (source.codec !== 'avc' || !source.codecString) return false;

  const profile = parseInt(source.codecString.split('.')[1]?.slice(0, 2) ?? '', 16);
  return (
    PLAYABLE_AVC_PROFILES.has(profile) &&
    source.height <= MAX_HEIGHT &&
    Number.isFinite(source.bitrate) &&
    source.bitrate > 0 &&
    source.bitrate <= COPY_MAX_BITRATE
  );
}

/**
 * The bitrate for a walkthrough that has to be re-encoded at its own size.
 *
 * 16 Mbps for 2560x1440, scaled by the pixel count, so 4K lands on the 30 Mbps
 * ceiling and 1080p on the 12 Mbps floor. The floor is there because a small
 * frame at a proportionally small bitrate is exactly the soft picture this
 * replaced.
 */
export function walkthroughBitrate(width: number, height: number): number {
  const scaled = 16_000_000 * ((width * height) / (2560 * 1440));
  return Math.round(Math.min(COPY_MAX_BITRATE, Math.max(12_000_000, scaled)));
}

/**
 * Which encodes to make of a source, largest first.
 *
 * Never upscale. A 720p export asked for at 1440p would be bigger, slower and
 * no sharper, so a rung taller than the source is dropped. The shortest rung is
 * always kept, otherwise a small source would produce no encode at all.
 */
export function planRungs(profile: TranscodeProfile, source: SourceFacts): Rung[] {
  if (profile === 'hero') {
    const applicable = HERO_RUNGS.filter(
      (rung, index) => rung.height <= source.height || index === HERO_RUNGS.length - 1,
    );
    return applicable.length > 0 ? applicable : [HERO_RUNGS[HERO_RUNGS.length - 1]];
  }

  const height = Math.min(source.height, MAX_HEIGHT);
  const width = Math.round(source.width * (height / source.height));
  const top: Rung = canCopy(source)
    ? { height: source.height }
    : { height, bitrate: walkthroughBitrate(width, height) };

  /* A source 720 tall or shorter is its own small copy. Two rungs of one
     height would also collide in FilmSource, which allows one per height. */
  return top.height > WALKTHROUGH_SMALL.height ? [top, WALKTHROUGH_SMALL] : [top];
}

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
  const keepAudio = profile === 'walkthrough';

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

  const wanted = planRungs(profile, {
    width: sourceWidth,
    height: sourceHeight,
    codec: videoTrack.codec,
    codecString: await videoTrack.getCodecParameterString(),
    bitrate: durationSeconds > 0 ? (file.size * 8) / durationSeconds : Number.NaN,
  });
  const audioTrack = keepAudio ? await input.getPrimaryAudioTrack() : null;

  /* The poster is cheap next to the encodes, so the encodes get almost all of
     the progress bar. Splitting it evenly would make the bar sit still for
     minutes and then jump, which reads as a hang. */
  const encodeShare = 0.92 / wanted.length;
  const encodes: TranscodeEncode[] = [];

  for (const [index, rung] of wanted.entries()) {
    signal?.throwIfAborted();

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

    /* A copy rung gives no video options at all, which is what tells
       Mediabunny to move the encoded frames across rather than decode and
       encode them again. AAC sound is moved across the same way; anything
       else is made into AAC, which every browser plays. */
    const copy = rung.bitrate === undefined;
    const conversion = await Conversion.init({
      input,
      output,
      video: copy
        ? {}
        : {
            height: rung.height,
            fit: 'contain',
            codec: 'avc',
            bitrate: rung.bitrate,
            /* A keyframe every two seconds at 30fps. Seeking into a long
               walkthrough is unusable without them, and the size cost is small. */
            keyFrameInterval: 2,
          },
      audio: !keepAudio
        ? { discard: true }
        : copy && audioTrack?.codec === 'aac'
          ? {}
          : { codec: 'aac', bitrate: 128_000 },
    });

    const base = index * encodeShare;
    conversion.onProgress = (fraction) =>
      report(
        'encoding',
        base + fraction * encodeShare,
        copy ? `Preparing the ${rung.height}p original` : `Compressing to ${rung.height}p`,
      );

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
