'use client';

import { useEffect } from 'react';

/**
 * Warn before leaving a page with unsaved work on it.
 *
 * A badge reading "Not saved yet" is a label, not a guard. Ahmad can write ten
 * minutes of description, click Projects in the top bar out of habit, and lose
 * every word with nothing asking him first. Closing the tab and pressing back
 * do the same.
 *
 * This covers the browser level exits: closing, reloading, and navigating away
 * from the origin. In app navigation is handled separately by GuardedLink,
 * because the browser cannot intercept a client side route change.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      // Both, because browsers disagree about which one arms the dialog, and
      // the text itself has been ignored by every browser for years.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
