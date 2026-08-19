'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The strip of the remaining projects, and its two buttons.
 *
 * The strip is a native scroll container, so a trackpad, a touch screen and a
 * keyboard all scroll it with none of this code running. The buttons exist only
 * for a mouse with no horizontal wheel, and they disable themselves at each end
 * so they never look live when they cannot move.
 *
 * There is deliberately no drag to scroll, and there must not be one: capturing
 * the pointer to fake dragging is what stopped the cards being clickable the
 * last time this was a rail.
 *
 * The data hooks stay on the markup. They were the old script's handles and the
 * refs below have replaced them, but the published DOM is meant to be
 * indistinguishable from the Astro build's.
 */

export interface RailProps {
  /** How many projects are in the strip, shown beside the heading. */
  count: number;
  /** The cards. Rendered on the server and passed straight through. */
  children: ReactNode;
}

export function Rail({ count, children }: RailProps) {
  const railRef = useRef<HTMLUListElement>(null);

  /**
   * Both start enabled, which is what the server sends, so hydration finds the
   * markup it rendered. The first sync runs on mount and settles them before
   * anyone can press one.
   */
  const [atStart, setAtStart] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setAtStart(rail.scrollLeft <= 1);
    setAtEnd(rail.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    sync();
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    return () => {
      rail.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  /** One card plus its gap, so a press advances by whole cards. */
  const step = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return 0;
    const card = rail.querySelector<HTMLElement>('.card');
    if (!card) return rail.clientWidth * 0.8;
    const gap = parseFloat(getComputedStyle(rail).columnGap || '0') || 0;
    return Math.max(1, Math.round(card.getBoundingClientRect().width + gap));
  }, []);

  const nudge = useCallback(
    (direction: number) => {
      const rail = railRef.current;
      if (!rail) return;
      // Read per press rather than once, so changing the system setting mid
      // visit takes effect without a reload.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      rail.scrollBy({ left: direction * step(), behavior: reduced ? 'auto' : 'smooth' });
    },
    [step],
  );

  return (
    <>
      {count > 0 && (
        <div className="rail-head">
          <p className="rail-label">
            The rest of the set <span className="rail-count">{count}</span>
          </p>
          <div className="rail-nav">
            <button
              type="button"
              className="rail-btn"
              data-rail-prev=""
              aria-label="Scroll projects left"
              disabled={atStart}
              onClick={() => nudge(-1)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H6M13 5.5 6.5 12 13 18.5" />
              </svg>
            </button>
            <button
              type="button"
              className="rail-btn"
              data-rail-next=""
              aria-label="Scroll projects right"
              disabled={atEnd}
              onClick={() => nudge(1)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <ul className="rail" data-rail="" ref={railRef}>
        {children}
      </ul>
    </>
  );
}

export default Rail;
