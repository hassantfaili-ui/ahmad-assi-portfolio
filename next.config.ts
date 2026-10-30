import type { NextConfig } from 'next';

/**
 * The site runs on Cloudflare Workers through @opennextjs/cloudflare, not on a
 * Node host, which changes one thing that matters: the built in image optimiser
 * does not run there. So it is switched off and src/lib/media-url.ts supplies a
 * loader that targets Cloudflare Image Transformations on the media zone
 * instead. Same outcome for a visitor, responsive AVIF and WebP from a single
 * upload, and it stays inside the account that already holds the bucket.
 */
const nextConfig: NextConfig = {
  devIndicators: false,
  /* The Astro build wrote /resume/index.html, so every canonical it published
     carried a trailing slash and that is what has been indexed. Dropping it
     would point every canonical at a URL that disagrees with the one already in
     the index, which is a real change rather than a cosmetic one. */
  trailingSlash: true,
  images: {
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
  },
  /**
   * Prisma has to stay external so OpenNext can patch it.
   *
   * Without this the generated client is bundled by Turbopack, and OpenNext
   * never gets to rewrite the part that loads the query compiler. It then tries
   * to compile the WebAssembly at runtime, which Workers forbids outright:
   * every dynamic database query dies with "Wasm code generation disallowed by
   * embedder". The prerendered pages survive because they were rendered at
   * build time on a machine with no such restriction, so the site looks fine
   * and the entire editing area does not work.
   */
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  typescript: { ignoreBuildErrors: false },

  /* Nothing gains from announcing the framework, and it narrows the work for
     anyone probing for framework specific issues. */
  poweredByHeader: false,

  /**
   * Security headers.
   *
   * The site served none at all, which a check on the deployed worker found.
   * Without X-Frame-Options it can be framed for clickjacking, and without
   * nosniff a browser may guess at a content type rather than believe one.
   *
   * There is deliberately no Content-Security-Policy yet. Next's runtime relies
   * on inline bootstrap scripts, so a policy written from guesswork would
   * either break the page or be so loose it means nothing. It wants a
   * report-only pass against the real pages first, which is its own piece of
   * work rather than something to slip in here.
   */
  /**
   * Settings has moved to Home.
   *
   * Its only content was the film behind Ahmad's name, and that film is the
   * first thing on the home page, so it is now edited on the screen that holds
   * the home page top to bottom. The address stays alive because it is in a
   * browser history and quite possibly a bookmark, and a 404 would read as the
   * editing area having lost something.
   *
   * It lives here rather than as a page that calls redirect() so that every
   * file under (admin) is still a real screen that checks who is asking. That
   * rule is worth keeping absolute: a page exempt from it because it happens to
   * render nothing today is a page someone adds a query to tomorrow.
   *
   * Temporary, not permanent. A permanent redirect is cached by the browser
   * until it is cleared, so reviving this path later would keep sending Ahmad
   * to Home on a machine nothing could reach to fix.
   */
  async redirects() {
    return [{ source: '/admin/settings', destination: '/admin/home', permanent: false }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            /* Two years, subdomains included. media.ahmadassi.ca is already
               HTTPS only, so this costs nothing and forecloses a downgrade. */
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
