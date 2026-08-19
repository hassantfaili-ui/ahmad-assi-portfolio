'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Whether there is unsaved work, tracked so a save cannot clear it for
 * something it never sent.
 *
 * The naive version sets a boolean on edit and clears it when the save comes
 * back ok, and it loses work. A save builds its payload, goes over the network,
 * and comes back: the inputs stay live the whole time. Type a sentence during
 * that round trip and the server answers ok for the payload from before it, the
 * flag is cleared anyway, the badge goes out and the guard disarms. Those
 * characters then exist only in the DOM. On the slow connection this whole
 * mechanism was written for, the window is seconds wide.
 *
 * So every edit bumps a counter. A save records the counter when it builds its
 * payload, and only clears the flag if the counter has not moved since. If it
 * has, the save genuinely did not cover everything on screen and the flag is
 * still telling the truth.
 */
export interface SaveFlag {
  /** True while there is work on screen that has not been saved. */
  dirty: boolean;
  /** Call from every setter that changes something savable. */
  markDirty: () => void;
  /** Call when building the payload. Hand the result to settle. */
  snapshot: () => number;
  /** Call on success. Clears the flag only if nothing changed in the meantime. */
  settle: (at: number) => void;
  /** Force the flag on or off, for a load or a discard. */
  reset: (dirty?: boolean) => void;
}

export function useSaveFlag(initial = false): SaveFlag {
  const [dirty, setDirty] = useState(initial);
  const edits = useRef(0);

  const markDirty = useCallback(() => {
    edits.current += 1;
    setDirty(true);
  }, []);

  const snapshot = useCallback(() => edits.current, []);

  const settle = useCallback((at: number) => {
    if (edits.current === at) setDirty(false);
  }, []);

  const reset = useCallback((next = false) => {
    edits.current += 1;
    setDirty(next);
  }, []);

  return { dirty, markDirty, snapshot, settle, reset };
}
