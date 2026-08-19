/**
 * What may be uploaded, and how big.
 *
 * This module is imported by the dropzone in the browser and by the presign and
 * complete routes on the server, and both must reach the same verdict. So it is
 * deliberately pure: no 'server-only', no node builtins, no process.env, nothing
 * that would break the moment it is pulled into a client component. The client
 * check exists to give an answer instantly; the server check exists because the
 * client one can be skipped.
 */

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/**
 * Matches the MediaKind enum in prisma/schema.prisma.
 *
 * validateUpload never returns 'poster'. A poster is a frame the browser pulls
 * out of a video during transcode, not a file anyone selects, so it arrives at
 * R2 already classified. It belongs in the union because the Media row can hold
 * it, not because a picker can produce it.
 */
export type MediaKind = 'image' | 'video' | 'poster' | 'document';

/**
 * 64MB, and the generosity is the point.
 *
 * The largest file Ahmad has sent is a 39.6MB site map at 7200x4800, and the
 * entire reason for this rebuild is that he stops having to think about file
 * size before he sends something. Cloudflare Image Transformations serve the
 * derivative, so a large master costs a visitor nothing: the phone downloads a
 * 900px AVIF either way. Set this at 8MB and the only thing achieved is Ahmad
 * opening Photoshop to fight a number.
 */
export const MAX_IMAGE_BYTES = 64 * MB;

/**
 * 4GB, which sounds absurd until you remember where the ceiling applies.
 *
 * Video is transcoded in the browser, to a 1440p and a 720p MP4, before a byte
 * leaves the machine. So this limits what he selects in the file picker, not
 * what gets stored: a 3GB ProRes walkthrough off a camera becomes something in
 * the tens of megabytes by the time R2 sees it.
 */
export const MAX_VIDEO_BYTES = 4 * GB;

/** 32MB. A CV or a portfolio PDF past this has uncompressed images in it. */
export const MAX_DOCUMENT_BYTES = 32 * MB;

/**
 * Extension to the content type R2 should be told to store.
 *
 * The extension is the authority rather than the browser's reported type,
 * because the reported type is the unreliable half: Windows derives it from the
 * extension anyway, and both Chrome and Safari hand back an empty string or
 * application/octet-stream for anything they do not recognise, which in practice
 * means AVIF, M4V and TIFF.
 */
const EXTENSIONS: Record<string, { kind: MediaKind; contentType: string }> = {
  jpg: { kind: 'image', contentType: 'image/jpeg' },
  jpeg: { kind: 'image', contentType: 'image/jpeg' },
  png: { kind: 'image', contentType: 'image/png' },
  webp: { kind: 'image', contentType: 'image/webp' },
  avif: { kind: 'image', contentType: 'image/avif' },
  gif: { kind: 'image', contentType: 'image/gif' },
  tiff: { kind: 'image', contentType: 'image/tiff' },
  tif: { kind: 'image', contentType: 'image/tiff' },

  mp4: { kind: 'video', contentType: 'video/mp4' },
  mov: { kind: 'video', contentType: 'video/quicktime' },
  m4v: { kind: 'video', contentType: 'video/x-m4v' },
  webm: { kind: 'video', contentType: 'video/webm' },

  pdf: { kind: 'document', contentType: 'application/pdf' },
};

/**
 * Types that are wrong but common enough to fix rather than argue with.
 * image/jpg has never been a registered type and Windows reports it constantly.
 */
const TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/x-tiff': 'image/tiff',
};

/**
 * Written out rather than derived from EXTENSIONS, because to a human JPG and
 * JPEG are one format and TIFF and TIF are one format, and a generated list
 * would say both. Keep it in step with EXTENSIONS by hand.
 */
const ACCEPTED_SUMMARY =
  'Images (JPG, PNG, WebP, AVIF, GIF, TIFF), video (MP4, MOV, M4V, WebM) and PDF are accepted.';

const LIMITS: Record<MediaKind, number> = {
  image: MAX_IMAGE_BYTES,
  video: MAX_VIDEO_BYTES,
  poster: MAX_IMAGE_BYTES,
  document: MAX_DOCUMENT_BYTES,
};

/**
 * What to do about a file that is over its ceiling, phrased for the person who
 * has the original open in front of them rather than for a log.
 */
const OVERSIZE_ADVICE: Record<MediaKind, string> = {
  image: 'Export it again at a smaller pixel size, or save it as JPEG or WebP rather than TIFF.',
  video: 'Trim it, or export it again at a lower resolution.',
  poster: 'Export it again at a smaller pixel size.',
  document: 'Export it again with the images downsampled, or split it into parts.',
};

/**
 * Sizes as Ahmad would say them: 39.6 MB, 4 GB, never 39.60 MB and never
 * 41523609 bytes.
 *
 * The units are binary, 1024 to the step, so that "the limit is 64 MB" is
 * literally MAX_IMAGE_BYTES and not a rounded stand in for it. Finder counts in
 * 1000s and will show a slightly larger number for the same file, which is
 * worth knowing before someone reports it as a bug.
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 bytes';
  if (n < KB) {
    const whole = Math.round(n);
    return `${whole} ${whole === 1 ? 'byte' : 'bytes'}`;
  }

  const [value, unit]: [number, string] =
    n >= GB ? [n / GB, 'GB'] : n >= MB ? [n / MB, 'MB'] : [n / KB, 'KB'];

  // One decimal where there is one, none where there is not: 39.6 MB reads as a
  // real measurement, 64.0 MB reads as a machine talking.
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${unit}`;
}

/** The extension, lower cased, or '' when the name carries none. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  // A leading dot is a hidden file, not an extension: '.hidden' has none.
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).trim().toLowerCase();
}

/** The reported type, lower cased, with any parameters such as charset dropped. */
function normaliseType(type: string): string {
  const bare = type.split(';')[0].trim().toLowerCase();
  return TYPE_ALIASES[bare] ?? bare;
}

/**
 * The kind a reported MIME type implies, or null when the browser told us
 * nothing usable. Matching on the prefix rather than an exact list is what keeps
 * an unfamiliar but honest type, image/heic say, from reading as a contradiction.
 */
function kindOfType(type: string): MediaKind | null {
  if (!type) return null;
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type === 'application/pdf') return 'document';
  return null;
}

export type UploadVerdict =
  | { ok: true; kind: MediaKind; contentType: string; extension: string }
  | { ok: false; error: string };

/**
 * Every message here is read by Ahmad, who is an architect. So each one names
 * the file, says what the limit actually is, and ends with the thing to do
 * about it. None of them describe the check that failed.
 */
export function validateUpload(args: {
  name: string;
  size: number;
  type: string;
}): UploadVerdict {
  const name = args.name.trim();

  if (!name) {
    return { ok: false, error: 'That file has no name. Rename it and drop it again.' };
  }

  const extension = extensionOf(name);
  if (!extension) {
    return {
      ok: false,
      error: `${name} has no file extension, so there is no way to tell what it is. Add one, .jpg for example, and drop it again.`,
    };
  }

  const accepted = EXTENSIONS[extension];
  if (!accepted) {
    return {
      ok: false,
      error: `.${extension} files cannot be uploaded. ${ACCEPTED_SUMMARY}`,
    };
  }

  if (!Number.isFinite(args.size) || args.size <= 0) {
    return {
      ok: false,
      error: `${name} is empty. If it is still copying, downloading, or syncing from iCloud or Dropbox, wait for that to finish and drop it again.`,
    };
  }

  const type = normaliseType(args.type);
  const reportedKind = kindOfType(type);
  // Only a reported kind that is both recognised and different is a real
  // contradiction. A PNG named .jpg is still an image and is waved through: it
  // costs a visitor nothing, and refusing it would be a refusal with no reason
  // behind it that Ahmad could see.
  if (reportedKind && reportedKind !== accepted.kind) {
    return {
      ok: false,
      error: `${name} is named as ${article(accepted.kind)} ${accepted.kind} but the file itself is ${reportedKind}. Rename it to match what it is, or export it again in the format you wanted.`,
    };
  }

  const limit = LIMITS[accepted.kind];
  if (args.size > limit) {
    return {
      ok: false,
      error: `${name} is ${formatBytes(args.size)}. The limit for ${accepted.kind === 'document' ? 'a PDF' : `${accepted.kind} files`} is ${formatBytes(limit)}. ${OVERSIZE_ADVICE[accepted.kind]}`,
    };
  }

  // The extension decides the content type, always, never the browser's report.
  //
  // The report used to win when it merely agreed on the kind, which let a file
  // named .jpg be stored and served as image/svg+xml. An SVG is a document that
  // executes script, and served from the media domain under a content type that
  // says so, it is a stored cross site scripting vector rather than a picture.
  // The extension is the part that has already been checked against an allow
  // list, so it is the part that gets to decide.
  return { ok: true, kind: accepted.kind, contentType: accepted.contentType, extension };
}

function article(kind: MediaKind): string {
  return kind === 'image' ? 'an' : 'a';
}
