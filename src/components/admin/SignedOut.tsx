import Link from 'next/link';

/**
 * What an editing screen shows when there is no identity.
 *
 * Shared by the layout and by every page, because both need it: the layout
 * covers an ordinary visit, and the pages cover an RSC segment request, which
 * can render a page without re-rendering its layout and so skips the layout's
 * guard entirely. That gap leaked all 294 object keys in the bucket to an
 * anonymous request before it was found.
 */
export function SignedOut() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <main className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-neutral-900">You are not signed in</h1>
        <p className="mt-3 text-sm text-neutral-600">
          This is the editing area for ahmadassi.ca. It sits behind a sign in, and this browser does
          not have one. Open it from ahmadassi.ca/admin and Cloudflare will ask you for a code by
          email.
        </p>
        <p className="mt-6">
          <Link href="/" className="text-sm font-medium text-neutral-900 underline underline-offset-4">
            Back to the site
          </Link>
        </p>
      </main>
    </div>
  );
}
