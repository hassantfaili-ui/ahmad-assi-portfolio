/**
 * next.config.ts points `images.loaderFile` here. It has to be a module with a
 * default export, which is why this is separate from src/lib/media-url.ts
 * rather than living beside the rest of the URL building.
 */
import { imageLoader, type ImageLoaderArgs } from './media-url';

export default function loader(args: ImageLoaderArgs): string {
  return imageLoader(args);
}
