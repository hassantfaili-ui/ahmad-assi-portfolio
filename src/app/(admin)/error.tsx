'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * The backstop for anything that gets past a try block.
 *
 * Without it, one rejection anywhere in the editing area replaces the entire
 * screen with Next's bare "Application error: a client side exception has
 * occurred", which tells Ahmad nothing and looks like the site is broken.
 *
 * The message says the one thing he needs to know, which is whether he has lost
 * anything, and reset re-renders the segment rather than reloading, so state
 * held above the failure survives where it can.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('The editing area hit an error it could not handle', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">Something went wrong on this screen</h1>

      <p className="mt-3 text-sm text-neutral-600">
        Nothing was saved just now, so nothing that was already saved has changed. Anything you had
        typed and not yet saved is gone from this screen, which is worth knowing before you try
        again.
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <a href="/admin">Back to the projects</a>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-6 text-xs text-neutral-400">
          If you need to report this, the reference is {error.digest}.
        </p>
      )}
    </div>
  );
}
