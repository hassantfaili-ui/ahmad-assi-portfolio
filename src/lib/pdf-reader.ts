/**
 * Reading a PDF in the browser, for the picture picker.
 *
 * PDF.js does the work, and it is loaded the first time this is called rather
 * than with the page: the editing screens are opened a hundred times for
 * every PDF dropped on them, and a megabyte of PDF parser is a lot to carry
 * for the ordinary case of dropping a JPEG. Nothing here runs on the server.
 * The Worker cannot render a PDF and has a request body cap, so the file
 * never leaves the machine until it has become pictures.
 *
 * The judgement calls, which embedded images are photographs, what the files
 * are called, how big to render, live in pdf-pictures.ts where they are
 * tested. This file is the glue around a library and is verified by hand
 * against a real PDF.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

import {
  extractedFileName,
  isPhotoWorthOffering,
  renderScale,
  toRgba,
  type ExtractedKind,
  type RawPixelKind,
} from '@/lib/pdf-pictures';

/** The long edge of a thumbnail in the picker. */
const THUMBNAIL_LONG_EDGE = 320;

/** A chosen page is rendered to this long edge, which is more than the site serves. */
const PAGE_LONG_EDGE = 3200;

/** A chosen photograph keeps its own size up to this. */
const PHOTO_LONG_EDGE = 4800;

/**
 * Safari refuses a canvas over roughly 16.7 million pixels and gives back a
 * blank one rather than an error, so every canvas here stays under this.
 */
const MAX_CANVAS_AREA = 16_000_000;

/** How long to wait for PDF.js to hand over one image before giving up on it. */
const IMAGE_WAIT_MS = 20_000;

export interface PdfCandidate {
  id: string;
  kind: ExtractedKind;
  /** 1 based, within its kind: page 3, photo 2. */
  index: number;
  pageNumber: number;
  /** The size the export will have, so the tile can say so. */
  width: number;
  height: number;
  /** An object URL. Released by close(). */
  thumbnailUrl: string;
}

export interface OpenedPdf {
  name: string;
  pageCount: number;
  candidates: PdfCandidate[];
  /** The chosen page or photo as a JPEG file, ready for the upload queue. */
  exportAsFile(candidate: PdfCandidate): Promise<File>;
  /** Frees the thumbnails and the parsed document. */
  close(): void;
}

/** What PDF.js hands over for an image object, as much of it as is used here. */
interface ImageObject {
  width: number;
  height: number;
  kind?: RawPixelKind;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
}

interface ObjectStore {
  get(id: string, callback?: (data: unknown) => void): unknown;
}

/** Thrown when the file cannot be read at all, in words meant for Ahmad. */
export class PdfUnreadableError extends Error {
  constructor(name: string) {
    super(
      `${name} could not be read. If it opens in Preview, export it again as a PDF and drop it again.`,
    );
    this.name = 'PdfUnreadableError';
  }
}

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * The library, loaded once and with its worker started.
 *
 * The worker is handed over as a port rather than a URL string so the bundler
 * sees a `new Worker(new URL(...))` it knows how to ship as an asset. A URL
 * string would have to point at a copy of the worker kept in public/, which is
 * a megabyte to keep in step with the package by hand.
 */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
          { type: 'module' },
        );
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be encoded.'))),
      'image/jpeg',
      quality,
    );
  });
}

/** One image object from the page's store, or null when PDF.js never delivers it. */
function imageObject(page: PDFPageProxy, id: string): Promise<ImageObject | null> {
  const store = (id.startsWith('g_') ? page.commonObjs : page.objs) as unknown as ObjectStore;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), IMAGE_WAIT_MS);
    store.get(id, (data) => {
      clearTimeout(timer);
      const image = data as ImageObject | null;
      resolve(image && image.width > 0 && image.height > 0 ? image : null);
    });
  });
}

/** Draw an image object onto a canvas of the given size. */
function paintImage(image: ImageObject, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not draw the picture.');

  if (image.bitmap) {
    ctx.drawImage(image.bitmap, 0, 0, canvas.width, canvas.height);
    return;
  }

  if (image.data && image.kind) {
    const source = makeCanvas(image.width, image.height);
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) throw new Error('This browser could not draw the picture.');
    sourceCtx.putImageData(
      new ImageData(toRgba(image.kind, image.data, image.width, image.height), image.width, image.height),
      0,
      0,
    );
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return;
  }

  throw new Error('The picture came back empty.');
}

async function renderPage(page: PDFPageProxy, longEdge: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const scale = renderScale(base, longEdge, MAX_CANVAS_AREA);
  const viewport = page.getViewport({ scale });
  const canvas = makeCanvas(viewport.width, viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

function drawPhoto(image: ImageObject, longEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, renderScale(image, longEdge, MAX_CANVAS_AREA));
  const canvas = makeCanvas(image.width * scale, image.height * scale);
  paintImage(image, canvas);
  return canvas;
}

/** Every distinct image object painted on the page, in painting order. */
async function paintedImageIds(pdfjs: PdfJs, page: PDFPageProxy): Promise<string[]> {
  const ops = await page.getOperatorList();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintImageXObjectRepeat) continue;
    const id = ops.argsArray[i]?.[0];
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export interface OpenPdfOptions {
  /** Called as each page is looked through, so the dialog can say where it is. */
  onProgress?: (pagesDone: number, pageCount: number) => void;
  signal?: AbortSignal;
}

/**
 * Open a PDF and list everything in it that could become a picture: every
 * page, and every photograph embedded in one that is big enough to be a
 * photograph rather than a logo.
 */
export async function openPdf(file: File, options: OpenPdfOptions = {}): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch {
    void task.destroy();
    throw new PdfUnreadableError(file.name);
  }

  const urls: string[] = [];
  const candidates: PdfCandidate[] = [];
  const photos = new Map<string, { page: PDFPageProxy; id: string }>();
  const pages = new Map<string, PDFPageProxy>();
  const pageCount = doc.numPages;

  const close = () => {
    for (const url of urls) URL.revokeObjectURL(url);
    void task.destroy();
  };

  const thumbnailUrl = async (canvas: HTMLCanvasElement) => {
    const url = URL.createObjectURL(await toBlob(canvas, 0.8));
    urls.push(url);
    return url;
  };

  try {
    let photoIndex = 0;
    for (let number = 1; number <= pageCount; number++) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const page = await doc.getPage(number);
      pages.set(`page-${number}`, page);

      /* A page that will not render is left out rather than taking the whole
         PDF with it. The photographs on it are still looked for. */
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = renderScale(base, PAGE_LONG_EDGE, MAX_CANVAS_AREA);
        candidates.push({
          id: `page-${number}`,
          kind: 'page',
          index: number,
          pageNumber: number,
          width: Math.round(base.width * scale),
          height: Math.round(base.height * scale),
          thumbnailUrl: await thumbnailUrl(await renderPage(page, THUMBNAIL_LONG_EDGE)),
        });
      } catch (error) {
        console.warn(`Page ${number} of ${file.name} could not be rendered`, error);
      }

      try {
        for (const id of await paintedImageIds(pdfjs, page)) {
          const image = await imageObject(page, id);
          if (!image || !isPhotoWorthOffering(image)) continue;
          photoIndex += 1;
          const key = `photo-${photoIndex}`;
          photos.set(key, { page, id });
          const scale = Math.min(1, renderScale(image, PHOTO_LONG_EDGE, MAX_CANVAS_AREA));
          candidates.push({
            id: key,
            kind: 'photo',
            index: photoIndex,
            pageNumber: number,
            width: Math.round(image.width * scale),
            height: Math.round(image.height * scale),
            thumbnailUrl: await thumbnailUrl(drawPhoto(image, THUMBNAIL_LONG_EDGE)),
          });
        }
      } catch (error) {
        console.warn(`The pictures on page ${number} of ${file.name} could not be read`, error);
      }

      options.onProgress?.(number, pageCount);
    }
  } catch (error) {
    close();
    throw error;
  }

  const pageTotal = candidates.filter((c) => c.kind === 'page').length;
  const photoTotal = candidates.filter((c) => c.kind === 'photo').length;

  return {
    name: file.name,
    pageCount,
    candidates,
    async exportAsFile(candidate) {
      const name = extractedFileName(
        file.name,
        candidate.kind,
        candidate.index,
        candidate.kind === 'page' ? pageTotal : photoTotal,
      );

      let canvas: HTMLCanvasElement;
      if (candidate.kind === 'page') {
        const page = pages.get(candidate.id);
        if (!page) throw new Error(`Page ${candidate.index} is no longer open.`);
        canvas = await renderPage(page, PAGE_LONG_EDGE);
      } else {
        const found = photos.get(candidate.id);
        const image = found && (await imageObject(found.page, found.id));
        if (!image) throw new Error(`Photo ${candidate.index} could not be read again.`);
        canvas = drawPhoto(image, PHOTO_LONG_EDGE);
      }

      const blob = await toBlob(canvas, 0.92);
      return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    },
    close,
  };
}
