'use client';

/**
 * The last backstop.
 *
 * Every other error boundary in the application is nested inside a layout, so
 * none of them can catch a throw from a root layout, which is the thing that
 * owns html and body. Without this, that case falls through to Next's built in
 * page, which says nothing useful and looks like the site is broken rather than
 * one screen being.
 *
 * It renders its own html and body because at this point nothing else has.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-CA">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#ffffff',
          color: '#0b0b0b',
        }}
      >
        <main style={{ maxWidth: '32rem', padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Something went wrong</h1>
          <p style={{ color: '#555', lineHeight: 1.6 }}>
            The page could not be shown. Nothing you had already saved has changed.
          </p>
          <p>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '0.5rem 1.25rem',
                border: 0,
                borderRadius: '0.375rem',
                background: '#0b0b0b',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#999' }}>Reference {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
