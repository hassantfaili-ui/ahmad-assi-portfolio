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
  images: {
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
