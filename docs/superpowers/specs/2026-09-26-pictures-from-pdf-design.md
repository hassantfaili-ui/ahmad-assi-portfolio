# Pictures from a PDF

**Date:** 2026-09-26
**Status:** approved for implementation

## The ask

Ahmad sends drawing sets and presentation boards as PDFs. Today the project
editor takes only image files, so a PDF has to be opened, screenshotted or
exported page by page, and then dropped. He asked for PDFs to be accepted on
a project, and for the site to pull the pictures out of the PDF and ask him
which ones he wants.

## What changes for Ahmad

The three drop targets on a project (start a new group, add pictures to a
group, drawings) take PDFs as well as images. Dropping a PDF opens a dialog
titled after the file, "Pick pictures from Lincoln-Beach.pdf". It shows:

1. **Pages.** Every page of the PDF as a thumbnail, in order. This is what a
   drawing set wants: a plan, a section, an elevation, each a page.
2. **Photos inside.** Every photograph embedded in the PDF that is big enough
   to be a picture rather than a logo or an icon. This is what a presentation
   board wants: the renders, without the board's text and borders.

He ticks any number of tiles from either list and presses "Use 3 pictures".
Each tile becomes an ordinary JPEG upload through the same queue every image
goes through, so it lands in the bucket and in the form exactly as if he had
dropped the JPEG himself. "Never mind" closes the dialog and nothing is
uploaded.

The PDF itself is not stored. What he asked for was its pictures, and a
project has nowhere to show a PDF. The CV and portfolio PDFs on the Contact
screen keep working as they do today: those are documents, stored whole.

Images and PDFs can be dropped together. The images upload straight away;
the PDFs wait, one dialog at a time, in the order they were dropped.

## Limits and errors

- A PDF over 32 MB is refused with the existing document limit message.
- A PDF that cannot be opened (encrypted, corrupt, not really a PDF) shows a
  failed row in the upload list: "Lincoln-Beach.pdf could not be read. If it
  opens in Preview, export it again as a PDF and drop it again."
- A page that fails to render is left out of the pages list rather than
  failing the whole PDF.
- Extracted JPEGs go through validateUpload like any drop, so the 64 MB image
  ceiling still applies, though a rendered page cannot approach it.

## How it works

Everything runs in the browser. The PDF never reaches the Worker, which
cannot render it anyway and has a request body cap.

- **`pdfjs-dist`** (Mozilla's PDF.js, version 6) does the reading. It is
  imported dynamically the first time a PDF is dropped, so the editing screens
  do not carry a megabyte of PDF code for the ordinary case of dropping a JPEG.
  Its worker is started with `new Worker(new URL(...), { type: 'module' })`
  so the bundler ships it as an asset.
- **Pages** are rendered with `page.render` onto a canvas. Thumbnails render
  at 240 px wide. A chosen page renders again at 3200 px on its long edge,
  capped at 16 million pixels so Safari's canvas ceiling is never hit.
- **Photos inside** come from the page's operator list: every
  `paintImageXObject` and `paintImageXObjectRepeat` names an image object,
  fetched from `page.objs` (or `commonObjs` for names starting `g_`). The
  object carries either an `ImageBitmap` or raw pixels in one of three kinds
  (1 bit grey, RGB, RGBA), which are drawn to a canvas. A photo is kept when
  its shorter side is at least 320 px, its area at least 250,000 px, and its
  aspect ratio no wider than 6:1. The same object painted twice on a page is
  listed once. A chosen photo is exported at its own size, capped at 4800 px
  on the long edge and 16 million pixels.
- **Output files** are JPEG at quality 0.92, named
  `<pdf name>-page-03.jpg` and `<pdf name>-photo-02.jpg`, and handed to the
  existing `useUploads().add()`.

## Code

- `src/lib/pdf-pictures.ts`: pure helpers, unit tested. Which embedded
  images count as photos, the output file names, the render scale for a
  target long edge under an area cap, and raw pixel kinds to RGBA.
- `src/lib/pdf-reader.ts`: the PDF.js glue, browser only. Opens a file, lists
  pages and photos with thumbnails, exports a chosen page or photo as a JPEG
  File. Not unit tested; verified in the browser against Ahmad's own
  portfolio PDF.
- `src/components/admin/PdfPicker.tsx`: the dialog.
- `src/components/admin/Dropzone.tsx`: a new `accept="image-or-pdf"` value.
  In that mode a dropped PDF is routed to the picker instead of the queue.
  The picker's output goes into the queue. The three project dropzones in
  `MediaPanel.tsx` and `GroupEditor.tsx` switch to it.

## Not in scope

- Storing a PDF on a project for visitors to download.
- Pulling pictures from the CV or portfolio uploads on the Contact screen.
- Vector export or any format other than JPEG.
