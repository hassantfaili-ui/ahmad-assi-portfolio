'use client';

import { useEffect, useRef } from 'react';
import type { ElementType, JSX, ReactNode } from 'react';

interface RevealProps {
  /** The tag to render. A section, a figure, a list item: the class does the work. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  children?: ReactNode;
  /**
   * For the one caller that has HTML rather than children: the project body,
   * which is markdown rendered to a string. It goes on this element rather than
   * a nested div so the DOM keeps the shape the stylesheet was written against,
   * where .prose is the direct parent of the headings and paragraphs.
   */
  dangerouslySetInnerHTML?: { __html: string };
}

/**
 * Fades its contents in the first time they reach the viewport.
 *
 * The class is added to the element directly rather than held in state: it is
 * a one way switch that never comes back off, so a re-render buys nothing, and
 * a stylesheet already owns everything the class means.
 *
 * The observer is dropped as soon as it has fired, since an element that has
 * arrived can never arrive again.
 */
export default function Reveal({
  as = 'div',
  className,
  children,
  dangerouslySetInnerHTML,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* Nothing to animate for someone who asked for less motion, and nothing to
       wait for in a browser without the observer: show it now in both cases,
       because the alternative is content stuck at opacity 0 forever. */
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      el.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          obs.unobserve(e.target);
        });
      },
      /* The bottom margin holds the reveal back until the element is properly
         in the frame rather than clipping its first pixel. */
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as ElementType;

  const revealClass = className ? `reveal ${className}` : 'reveal';

  if (dangerouslySetInnerHTML) {
    return (
      <Tag ref={ref} className={revealClass} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
    );
  }

  return (
    <Tag ref={ref} className={revealClass}>
      {children}
    </Tag>
  );
}
