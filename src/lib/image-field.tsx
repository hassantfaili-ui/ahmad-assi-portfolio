import { fields } from '@keystatic/core';
import type { AssetFormField, FormFieldInputProps } from '@keystatic/core';

/**
 * The image field the projects use, in place of fields.image.
 *
 * Two things are wrong with the built-in one for this site, and both of them
 * only show up once somebody who is not a developer is doing the editing.
 *
 *
 * ONE. IT RENAMES EVERY IMAGE ON EVERY SAVE.
 *
 * Keystatic serializes an entry with shouldSuggestFilenamePrefix set to true
 * (keystatic-core-ui.js:1908), which makes fields.image throw away the filename
 * and rebuild it from the field's position in the form:
 *
 *   const filename = args.suggestedFilenamePrefix
 *     ? args.suggestedFilenamePrefix + '.' + value.extension
 *     : value.filename;
 *
 * Position, not identity. So editing one word of one text field and pressing
 * save rewrites the whole project. Measured, not inferred: changing "Courtyard
 * landscape proposal" to "Courtyard landscape proposal." deleted all twelve
 * named images of The Eye and wrote them back as
 *
 *   public/media/the-eye/imageGroups/0/images/1/src.jpg
 *
 * That is bad in four separate ways. Every image in the project counts as new,
 * so all of them are re-uploaded inside the one commit that save makes, which
 * is the thing that runs into GitHub's 45MB per-request ceiling: Renewal Square
 * alone is 20.8MB of photographs before base64 inflates it by a third. The
 * repository grows by the whole project every time he fixes a typo. Reordering
 * or deleting one image renumbers every image after it, so the same storm
 * happens again for a change that should cost nothing. And every file ends up
 * called src.jpg, which quietly breaks scripts/build-portfolio.sh, since that
 * indexes public/media by basename and relies on basenames being unique.
 *
 * The fix is to drop the suggestion and let the field fall through to
 * value.filename. An image that has not been touched then serializes back to
 * the exact path it already had, so Keystatic's own sha comparison recognises it
 * and leaves it out of the commit entirely.
 *
 *
 * TWO. IT UPLOADS WHATEVER CAME OUT OF THE RENDERER.
 *
 * fields.image commits the file byte for byte, with no resizing anywhere in the
 * package. Ahmad's exports average 6.7MB and run to 39.6MB, and GitHub's limit
 * is on the whole request, so at full size roughly five photographs is a save.
 * Downscaling in the browser first, before the bytes are ever part of a commit,
 * turns that into something he will not hit.
 *
 * The build shrinks images too, in src/integrations/shrink-media.mjs, but that
 * only protects the visitor. It runs long after the upload that has to fit.
 *
 *
 * This overrides only Input and serialize. Everything else, parse, validate,
 * filename, reader and directory, is inherited, so what lands on disk is an
 * ordinary image in an ordinary folder and nothing else in the project knows
 * this file exists. If Keystatic ever withdraws custom fields, which its issue
 * #464 proposes, the repair is to call fields.image here again and re-migrate,
 * with no change to any content.
 */

type ImageValue = { data: Uint8Array; extension: string; filename: string } | null;

type Opts = Parameters<typeof fields.image>[0] & {
  /** Longest edge kept, in pixels. */
  maxEdge?: number;
  /** JPEG quality, 0 to 1. */
  quality?: number;
};

/** Vector and animated formats are destroyed by a canvas round trip. */
const PASS_THROUGH = new Set(['svg', 'gif']);

/** Ceiling for a PNG that has to stay a PNG because it really is transparent. */
const PNG_CAP = 4 * 1024 * 1024;

/** Six hex characters of the content hash, enough that two different images
    picked for the same project will not land on the same filename. */
async function digest(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', data as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(buf).slice(0, 3))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Does this image actually use its alpha channel?
 *
 * A render exported as a PNG is opaque and can become a JPEG at a tenth of the
 * size. A logo or a cut out drawing cannot: flattening it would put a black box
 * behind it. Every fourth pixel is enough to answer the question and keeps the
 * scan off the critical path for a large image.
 */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 16) if (data[i] < 255) return true;
  return false;
}

/** Draw the bitmap at a given scale and hand back the canvas and its context. */
function paint(bitmap: ImageBitmap, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

const encode = (canvas: HTMLCanvasElement, png: boolean, quality: number) =>
  new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', png ? undefined : quality),
  );

async function downscale(
  value: NonNullable<ImageValue>,
  maxEdge: number,
  quality: number,
): Promise<NonNullable<ImageValue>> {
  const ext = value.extension.toLowerCase();
  if (PASS_THROUGH.has(ext)) return value;

  const bitmap = await createImageBitmap(
    new Blob([value.data as unknown as BlobPart]),
  );

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const first = paint(bitmap, scale);
    if (!first.ctx) return value;

    const keepPng =
      ext === 'png' && hasTransparency(first.ctx, first.canvas.width, first.canvas.height);

    let blob = await encode(first.canvas, keepPng, quality);
    if (!blob) return value;

    /* A PNG kept for its alpha channel does not get the JPEG path, and lossless
       PNG of a large detailed image can still be many megabytes, which is the
       one remaining way to put a heavy file into a save. Flattening it is not
       the answer, since the whole reason it is still a PNG is that something is
       genuinely transparent and would land on a black rectangle. So: one more
       pass at fewer pixels, sized from how far over it came out. Once, not in a
       loop, and only for the rare file that needs it.

       This bounds the size rather than guaranteeing it, because PNG does not
       compress in proportion to pixel count. Hence the 0.9: without a margin,
       a worst case of pure noise landed at 4.04MB against a 4MB cap. Real
       drawings are nowhere near that, the one genuinely transparent file in
       Ahmad's export folders comes out at 0.31MB, and even the noise case is
       eight to a save. */
    if (keepPng && blob.size > PNG_CAP) {
      const tighter = Math.max(0.35, Math.sqrt(PNG_CAP / blob.size) * 0.9);
      const second = paint(bitmap, scale * tighter);
      const retry = second.ctx ? await encode(second.canvas, true, quality) : null;
      if (retry && retry.size < blob.size) blob = retry;
    }

    const data = new Uint8Array(await blob.arrayBuffer());

    /* A photograph that was already small and well compressed can come out of
       the canvas larger than it went in. Keeping the original is both smaller
       and one less generation of loss. */
    if (data.length >= value.data.length && scale === 1) return value;

    const extension = keepPng ? 'png' : 'jpg';
    /* Keep his own name for the file, tidied, so the media folder stays
       readable. The hash is what makes it safe: two different photographs
       chosen for the same project cannot collide, and choosing the same one
       twice is a no-op. */
    const stem =
      value.filename
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image';
    return { data, extension, filename: `${stem}-${await digest(data)}.${extension}` };
  } finally {
    bitmap.close();
  }
}

export function projectImage(opts: Opts): AssetFormField<ImageValue, ImageValue, string | null> {
  const { maxEdge = 2600, quality = 0.85, ...imageOpts } = opts;
  const base = fields.image(imageOpts);

  return {
    ...base,

    Input(props: FormFieldInputProps<ImageValue>) {
      /* fields.image spreads the caller's props after its own, so this onChange
         is the one that runs. Anything that goes wrong in the resize falls back
         to the file exactly as chosen: a photograph that will not downscale
         should still upload. */
      return (
        <base.Input
          {...props}
          onChange={(value: ImageValue) => {
            if (value === null) {
              props.onChange(null);
              return;
            }
            downscale(value, maxEdge, quality).then(props.onChange, () => props.onChange(value));
          }}
        />
      );
    },

    serialize(value, args) {
      /* The whole point. Without this the filename is rebuilt from the field's
         position and every image in the project moves on every save. */
      return base.serialize(value, { ...args, suggestedFilenamePrefix: undefined });
    },
  };
}
