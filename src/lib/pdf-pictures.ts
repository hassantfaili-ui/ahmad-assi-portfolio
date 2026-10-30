/**
 * The pure half of pulling pictures out of a PDF.
 *
 * Nothing here touches PDF.js, a canvas or the DOM, so all of it runs under
 * the plain node test environment and every decision that is a judgement
 * call, which embedded images are photographs and which are logos, what the
 * files are called, how big a page is rendered, has a test pinning it. The
 * browser only glue that feeds these lives in pdf-reader.ts.
 */

export interface PixelSize {
  width: number;
  height: number;
}

/**
 * The shorter side of a photograph worth offering. Under this it is a logo,
 * an icon, a north arrow or a scale bar, and offering those as pictures would
 * bury the three renders on a board under thirty tiles of decoration.
 */
const MIN_SHORT_SIDE = 320;

/** The area floor, so a 400 x 400 stamp does not qualify on its short side alone. */
const MIN_AREA = 250_000;

/** Wider than this and it is a rule, a banner or a title strip, not a photograph. */
const MAX_ASPECT = 6;

/** Whether an image embedded in a PDF is worth showing as a picture to use. */
export function isPhotoWorthOffering({ width, height }: PixelSize): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  return short >= MIN_SHORT_SIDE && width * height >= MIN_AREA && long / short <= MAX_ASPECT;
}

export type ExtractedKind = 'page' | 'photo';

/**
 * What the JPEG made from a page or a photo is called.
 *
 * The PDF's own name leads so a listing of the bucket still says where a
 * picture came from, and the number is padded to the width the count needs so
 * page-10 does not sort before page-2. The name is only kept readable here:
 * the server sanitises it again when it builds the object key.
 */
export function extractedFileName(
  pdfName: string,
  kind: ExtractedKind,
  index: number,
  total: number,
): string {
  const base =
    pdfName
      .replace(/\.pdf$/i, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pdf';
  const width = Math.max(2, String(Math.max(total, 1)).length);
  return `${base}-${kind}-${String(index).padStart(width, '0')}.jpg`;
}

/**
 * The factor to render a page or draw a photo at, so its long edge reaches
 * the target without the canvas ever exceeding the area cap.
 *
 * Both limits matter. A drawing set page at PDF points is small and wants
 * scaling up so the linework survives; a render on a board is already large
 * and wants scaling down. Safari refuses a canvas past roughly 16 million
 * pixels, silently, and the picture comes out blank, so the area cap is the
 * one that keeps this working on an iPad.
 */
export function renderScale(size: PixelSize, targetLongEdge: number, maxArea: number): number {
  const { width, height } = size;
  if (!(width > 0) || !(height > 0)) return 1;
  const byEdge = targetLongEdge / Math.max(width, height);
  const byArea = Math.sqrt(maxArea / (width * height));
  return Math.min(byEdge, byArea);
}

/**
 * PDF.js's three raw pixel layouts, as it numbers them in ImageKind.
 * 1 is one bit per pixel grey, rows padded to a byte; 2 is packed RGB; 3 is
 * RGBA already.
 */
export type RawPixelKind = 1 | 2 | 3;

/**
 * Raw image bytes from PDF.js as RGBA, ready for an ImageData.
 *
 * PDF.js only hands over raw bytes when it could not decode straight to an
 * ImageBitmap, so this is the fallback path, but it is the path every
 * lossless image in a drawing set takes.
 */
export function toRgba(
  kind: RawPixelKind,
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));

  if (kind === 3) {
    out.set(data.subarray(0, out.length));
    return out;
  }

  if (kind === 2) {
    const pixels = width * height;
    for (let p = 0, s = 0, d = 0; p < pixels; p++, s += 3, d += 4) {
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = 255;
    }
    return out;
  }

  if (kind === 1) {
    const bytesPerRow = Math.ceil(width / 8);
    let d = 0;
    for (let y = 0; y < height; y++) {
      const rowStart = y * bytesPerRow;
      for (let x = 0; x < width; x++) {
        const bit = (data[rowStart + (x >> 3)] >> (7 - (x & 7))) & 1;
        const value = bit ? 255 : 0;
        out[d++] = value;
        out[d++] = value;
        out[d++] = value;
        out[d++] = 255;
      }
    }
    return out;
  }

  throw new Error(`Unknown raw pixel kind ${String(kind)}`);
}
