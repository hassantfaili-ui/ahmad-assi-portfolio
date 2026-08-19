import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  formatBytes,
  validateUpload,
  type MediaKind,
} from '@/lib/upload-policy';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** A whole File is never needed here, only the three fields the policy reads. */
const file = (name: string, size: number, type: string) => ({ name, size, type });

/**
 * Narrows for the accepted case so a test can read `.kind` without a cast, and
 * fails with the actual error rather than "undefined is not an object" when the
 * upload was rejected instead.
 */
function accept(args: { name: string; size: number; type: string }) {
  const result = validateUpload(args);
  if (!result.ok) throw new Error(`expected ${args.name} to be accepted, got: ${result.error}`);
  return result;
}

function reject(args: { name: string; size: number; type: string }) {
  const result = validateUpload(args);
  if (result.ok) throw new Error(`expected ${args.name} to be rejected, got kind ${result.kind}`);
  return result;
}

describe('the ceilings', () => {
  it('is 64MB for images, 4GB for video and 32MB for documents', () => {
    expect(MAX_IMAGE_BYTES).toBe(64 * MB);
    expect(MAX_VIDEO_BYTES).toBe(4 * GB);
    expect(MAX_DOCUMENT_BYTES).toBe(32 * MB);
  });

  it('leaves headroom over the largest file Ahmad has actually sent', () => {
    // The 39.6MB site map at 7200x4800 is the real case the ceiling was set for.
    expect(39.6 * MB).toBeLessThan(MAX_IMAGE_BYTES);
  });
});

describe('formatBytes', () => {
  it('renders MB without a pointless trailing zero', () => {
    expect(formatBytes(64 * MB)).toBe('64 MB');
    expect(formatBytes(70 * MB)).toBe('70 MB');
    expect(formatBytes(32 * MB)).toBe('32 MB');
  });

  it('renders one decimal when the number has one', () => {
    expect(formatBytes(39.6 * MB)).toBe('39.6 MB');
    expect(formatBytes(1.5 * GB)).toBe('1.5 GB');
  });

  it('renders GB once past a gigabyte', () => {
    expect(formatBytes(4 * GB)).toBe('4 GB');
    expect(formatBytes(5 * GB)).toBe('5 GB');
  });

  it('renders KB and bytes below a megabyte', () => {
    expect(formatBytes(500 * KB)).toBe('500 KB');
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(1)).toBe('1 byte');
  });

  it('does not render nonsense for zero or garbage', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(-5)).toBe('0 bytes');
    expect(formatBytes(Number.NaN)).toBe('0 bytes');
  });
});

describe('validateUpload, images', () => {
  it('accepts the 39.6MB site map', () => {
    const result = accept(file('site-map.jpg', 39.6 * MB, 'image/jpeg'));

    expect(result.kind).toBe<MediaKind>('image');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
  });

  it('rejects a 70MB JPEG and names the 64 MB limit', () => {
    const result = reject(file('render.jpg', 70 * MB, 'image/jpeg'));

    expect(result.error).toContain('64 MB');
    expect(result.error).toContain('70 MB');
  });

  it('accepts a file sitting exactly on the ceiling', () => {
    expect(accept(file('exact.png', MAX_IMAGE_BYTES, 'image/png')).kind).toBe('image');
  });

  it('accepts every image format the pipeline handles', () => {
    for (const [name, type, contentType] of [
      ['a.jpg', 'image/jpeg', 'image/jpeg'],
      ['a.jpeg', 'image/jpeg', 'image/jpeg'],
      ['a.png', 'image/png', 'image/png'],
      ['a.webp', 'image/webp', 'image/webp'],
      ['a.avif', 'image/avif', 'image/avif'],
      ['a.gif', 'image/gif', 'image/gif'],
      ['a.tiff', 'image/tiff', 'image/tiff'],
      ['a.tif', 'image/tiff', 'image/tiff'],
    ]) {
      const result = accept(file(name, 2 * MB, type));
      expect(result.kind).toBe('image');
      expect(result.contentType).toBe(contentType);
    }
  });

  it('reads the extension case insensitively, because cameras shout', () => {
    const result = accept(file('DSC_0431.JPG', 8 * MB, 'image/jpeg'));

    expect(result.kind).toBe('image');
    expect(result.extension).toBe('jpg');
  });

  it('normalises image/jpg, which Windows reports and which is not a real type', () => {
    expect(accept(file('a.jpg', 2 * MB, 'image/jpg')).contentType).toBe('image/jpeg');
  });
});

describe('validateUpload, video', () => {
  it('accepts a .mov as video', () => {
    const result = accept(file('walkthrough.mov', 900 * MB, 'video/quicktime'));

    expect(result.kind).toBe<MediaKind>('video');
    expect(result.contentType).toBe('video/quicktime');
    expect(result.extension).toBe('mov');
  });

  it('accepts every video container the encoder can read', () => {
    for (const [name, type] of [
      ['a.mp4', 'video/mp4'],
      ['a.mov', 'video/quicktime'],
      ['a.m4v', 'video/x-m4v'],
      ['a.webm', 'video/webm'],
    ]) {
      expect(accept(file(name, 200 * MB, type)).kind).toBe('video');
    }
  });

  it('accepts a 3GB video, because the browser transcodes it before upload', () => {
    expect(accept(file('site-tour.mov', 3 * GB, 'video/quicktime')).kind).toBe('video');
  });

  it('rejects a 5GB video and names the 4 GB limit', () => {
    const result = reject(file('raw.mov', 5 * GB, 'video/quicktime'));

    expect(result.error).toContain('4 GB');
    expect(result.error).toContain('5 GB');
  });
});

describe('validateUpload, documents', () => {
  it('accepts a PDF as a document', () => {
    const result = accept(file('Ahmad-Assi-CV.pdf', 4 * MB, 'application/pdf'));

    expect(result.kind).toBe<MediaKind>('document');
    expect(result.contentType).toBe('application/pdf');
    expect(result.extension).toBe('pdf');
  });

  it('rejects a 40MB PDF and names the 32 MB limit', () => {
    const result = reject(file('portfolio.pdf', 40 * MB, 'application/pdf'));

    expect(result.error).toContain('32 MB');
  });
});

describe('validateUpload, refusals', () => {
  it('rejects an executable and says what is accepted instead', () => {
    const result = reject(file('installer.exe', 4 * MB, 'application/x-msdownload'));

    expect(result.error).toContain('.exe');
    expect(result.error).toMatch(/JPG/i);
    expect(result.error).toMatch(/PDF/i);
  });

  it('rejects other plausible near misses', () => {
    for (const name of ['plan.dwg', 'model.rvt', 'drawing.svg', 'notes.txt', 'archive.zip']) {
      expect(validateUpload(file(name, 2 * MB, '')).ok).toBe(false);
    }
  });

  it('rejects a zero byte file and says it may still be syncing', () => {
    const result = reject(file('render.jpg', 0, 'image/jpeg'));

    expect(result.error).toMatch(/empty/i);
    expect(result.error).toMatch(/sync|copying|download/i);
  });

  it('rejects a negative or unreadable size rather than waving it through', () => {
    expect(validateUpload(file('render.jpg', -1, 'image/jpeg')).ok).toBe(false);
    expect(validateUpload(file('render.jpg', Number.NaN, 'image/jpeg')).ok).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(reject(file('   ', 2 * MB, 'image/jpeg')).error).toMatch(/name/i);
    expect(reject(file('', 2 * MB, 'image/jpeg')).error).toMatch(/name/i);
  });

  it('rejects a name with no extension at all', () => {
    expect(reject(file('site-map', 2 * MB, 'image/jpeg')).error).toMatch(/extension/i);
    expect(reject(file('.hidden', 2 * MB, 'image/jpeg')).error).toMatch(/extension/i);
  });

  it('rejects an extension and a MIME type that disagree', () => {
    const asVideo = reject(file('site-map.jpg', 2 * MB, 'video/mp4'));
    expect(asVideo.error).toContain('site-map.jpg');
    expect(asVideo.error).toMatch(/image/i);
    expect(asVideo.error).toMatch(/video/i);

    expect(validateUpload(file('brochure.pdf', 2 * MB, 'image/png')).ok).toBe(false);
    expect(validateUpload(file('clip.mp4', 2 * MB, 'application/pdf')).ok).toBe(false);
  });
});

describe('validateUpload, browsers that report a useless type', () => {
  it('trusts the extension when the browser reports nothing', () => {
    const result = accept(file('site-map.avif', 12 * MB, ''));

    expect(result.kind).toBe('image');
    expect(result.contentType).toBe('image/avif');
  });

  it('trusts the extension when the browser reports application/octet-stream', () => {
    const result = accept(file('clip.m4v', 200 * MB, 'application/octet-stream'));

    expect(result.kind).toBe('video');
    expect(result.contentType).toBe('video/x-m4v');
  });

  it('ignores a charset parameter and stray case on the reported type', () => {
    expect(accept(file('a.png', 2 * MB, ' IMAGE/PNG ')).contentType).toBe('image/png');
    expect(accept(file('a.pdf', 2 * MB, 'application/pdf; charset=binary')).contentType).toBe(
      'application/pdf',
    );
  });

  it('does not disagree over two formats of the same kind', () => {
    // A PNG that someone renamed .jpg is still an image, and rejecting it would
    // be a refusal with no visitor facing reason behind it.
    expect(accept(file('export.jpg', 2 * MB, 'image/png')).kind).toBe('image');
  });
});

/**
 * The content type is decided by the extension, never by the browser's report.
 *
 * Found by an adversarial review: the report used to win whenever it merely
 * agreed on the kind, so a file named .jpg could be stored and served as
 * image/svg+xml. An SVG is a document that executes script, and served from the
 * media domain under a content type that says so it is a stored cross site
 * scripting vector rather than a picture.
 */
describe('validateUpload, the content type it hands to R2', () => {
  const ok = (result: ReturnType<typeof validateUpload>) => {
    if (!result.ok) throw new Error(`expected acceptance, got: ${result.error}`);
    return result;
  };

  it('never lets a reported SVG type ride in on an image extension', () => {
    const result = ok(validateUpload({ name: 'logo.jpg', size: 2048, type: 'image/svg+xml' }));
    expect(result.contentType).toBe('image/jpeg');
  });

  it.each([
    ['render.jpg', 'image/svg+xml', 'image/jpeg'],
    ['render.jpg', 'image/png', 'image/jpeg'],
    ['plan.png', 'image/jpeg', 'image/png'],
    ['film.mp4', 'video/x-matroska', 'video/mp4'],
    ['sheet.pdf', 'application/pdf', 'application/pdf'],
    ['render.jpg', '', 'image/jpeg'],
    ['render.jpg', 'text/html', 'image/jpeg'],
  ])('%s reported as %s is stored as %s', (name, type, expected) => {
    const result = validateUpload({ name, size: 4096, type });
    if (result.ok) {
      expect(result.contentType).toBe(expected);
    } else {
      // A contradictory report may be refused outright, which is also correct.
      // What must never happen is acceptance with the reported type.
      expect(result.error).toBeTruthy();
    }
  });

  it('gives the same content type whatever the browser claims', () => {
    const types = ['image/jpeg', 'image/svg+xml', 'image/webp', '', 'application/octet-stream'];
    const results = types
      .map((type) => validateUpload({ name: 'a.jpg', size: 1024, type }))
      .filter((result) => result.ok)
      .map((result) => (result.ok ? result.contentType : ''));

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe('image/jpeg');
  });
});
