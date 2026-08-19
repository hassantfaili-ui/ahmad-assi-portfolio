import { afterEach, describe, expect, it, vi } from 'vitest';

import { MEDIA_ORIGIN, imageLoader, mediaUrl } from './media-url';

/**
 * MEDIA_ORIGIN is read once at module load, so the tests that care about a
 * different origin have to load a fresh copy of the module rather than set a
 * variable and call again.
 */
async function loadWithOrigin(origin: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_MEDIA_ORIGIN', origin);
  vi.stubEnv('MEDIA_ORIGIN', '');
  return import('./media-url');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('MEDIA_ORIGIN', () => {
  it('defaults to the media zone in front of the bucket', () => {
    expect(MEDIA_ORIGIN).toBe('https://media.ahmadassi.ca');
  });

  it('takes NEXT_PUBLIC_MEDIA_ORIGIN when it is set', async () => {
    const { MEDIA_ORIGIN: origin } = await loadWithOrigin('https://cdn.example.test');
    expect(origin).toBe('https://cdn.example.test');
  });

  /**
   * The whole point of stripping here rather than at every call site: a trailing
   * slash pasted into an environment variable is the classic way to end up with
   * https://host//projects/a.jpg, which some caches treat as a different object.
   */
  it('strips trailing slashes off the configured origin', async () => {
    const { MEDIA_ORIGIN: origin, mediaUrl: url } = await loadWithOrigin('https://cdn.example.test///');
    expect(origin).toBe('https://cdn.example.test');
    expect(url('projects/a.jpg')).toBe('https://cdn.example.test/projects/a.jpg');
  });
});

describe('mediaUrl', () => {
  it('joins the origin and the key without doubling the slash', () => {
    expect(mediaUrl('projects/a.jpg')).toBe('https://media.ahmadassi.ca/projects/a.jpg');
    expect(mediaUrl('/projects/a.jpg')).toBe('https://media.ahmadassi.ca/projects/a.jpg');
  });

  it('keeps the rest of the key exactly as stored', () => {
    expect(mediaUrl('projects/lincoln/1755561600000-render.jpg')).toBe(
      'https://media.ahmadassi.ca/projects/lincoln/1755561600000-render.jpg',
    );
  });

  it('returns an empty string for an empty key', () => {
    expect(mediaUrl('')).toBe('');
  });

  /**
   * Rows store keys, but the migration and the resume both carry a few absolute
   * URLs that are not ours to rewrite. Passing them through means a caller never
   * has to ask which kind of value it is holding.
   *
   * The protocol relative form is checked because it wins over the leading
   * slash trim, and it has to: a value beginning // is a host, not a key. No key
   * buildObjectKey produces can begin with a slash, so nothing collides.
   */
  it('passes an absolute URL through untouched', () => {
    expect(mediaUrl('https://img.youtube.com/vi/abc/hq.jpg')).toBe(
      'https://img.youtube.com/vi/abc/hq.jpg',
    );
    expect(mediaUrl('http://example.test/a.png')).toBe('http://example.test/a.png');
    expect(mediaUrl('data:image/gif;base64,R0lGOD')).toBe('data:image/gif;base64,R0lGOD');
    expect(mediaUrl('//example.test/a.png')).toBe('//example.test/a.png');
  });
});

describe('imageLoader', () => {
  it('builds a Cloudflare Image Transformations URL', () => {
    expect(imageLoader({ src: 'projects/a.jpg', width: 1600 })).toBe(
      'https://media.ahmadassi.ca/cdn-cgi/image/width=1600,format=auto,quality=82/projects/a.jpg',
    );
  });

  it('defaults quality to 82 and honours an explicit one', () => {
    expect(imageLoader({ src: 'projects/a.jpg', width: 640, quality: 60 })).toBe(
      'https://media.ahmadassi.ca/cdn-cgi/image/width=640,format=auto,quality=60/projects/a.jpg',
    );
  });

  it('asks for format=auto so the browser decides between AVIF and WebP', () => {
    expect(imageLoader({ src: 'projects/a.jpg', width: 320 })).toContain('format=auto');
  });

  it('does not double the slash when the key arrives with a leading one', () => {
    expect(imageLoader({ src: '/projects/a.jpg', width: 800 })).toBe(
      'https://media.ahmadassi.ca/cdn-cgi/image/width=800,format=auto,quality=82/projects/a.jpg',
    );
  });

  it('carries every width next/image asks for straight through', () => {
    for (const width of [16, 640, 1080, 1920, 3840]) {
      expect(imageLoader({ src: 'projects/a.jpg', width })).toContain(`width=${width},`);
    }
  });

  it('follows the configured origin, not a hard coded one', async () => {
    const { imageLoader: loader } = await loadWithOrigin('https://cdn.example.test');
    expect(loader({ src: 'projects/a.jpg', width: 1600 })).toBe(
      'https://cdn.example.test/cdn-cgi/image/width=1600,format=auto,quality=82/projects/a.jpg',
    );
  });
});
