import type { Metadata } from 'next';
import Link from 'next/link';

import { MediaLibrary } from '@/components/admin/MediaLibrary';
import { Button } from '@/components/ui/button';
import { listMedia } from '@/lib/admin-queries';
import { formatBytes } from '@/lib/upload-policy';

/**
 * The media library.
 *
 * Read fresh every time. A delete here removes the object from the bucket, and
 * MediaLibrary calls router.refresh() straight after, so a cached copy of this
 * page would come back still showing a file that no longer exists. There is no
 * authentication check in this file on purpose: (admin)/admin/layout.tsx is the
 * gate, and every page under it renders inside that layout.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Media, Ahmad Assi',
};

export default async function MediaPage() {
  const media = await listMedia();
  const totalBytes = media.reduce((total, item) => total + item.bytes, 0);

  return (
    <div className="grid gap-8">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Media</h1>
        {media.length > 0 ? (
          <p className="text-sm text-neutral-500">
            Everything you have uploaded, newest first.{' '}
            {media.length === 1 ? '1 file' : `${media.length} files`}, {formatBytes(totalBytes)} in
            total.
          </p>
        ) : null}
      </header>

      {media.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-neutral-800">Nothing has been uploaded yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            Files arrive here on their own once you add them to a project. Open a project, drop your
            renders, drawings or a walkthrough onto it, and they will be listed on this page.
          </p>
          <Button asChild className="mt-5">
            <Link href="/admin">Go to your projects</Link>
          </Button>
        </div>
      ) : (
        <MediaLibrary media={media} />
      )}
    </div>
  );
}
