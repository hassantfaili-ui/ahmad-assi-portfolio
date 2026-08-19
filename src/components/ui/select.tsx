'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A plain native select rather than the Radix one.
 *
 * Radix Select is the right choice when a control needs rich option markup or a
 * portal. Nothing in this administration area does: the choices are short lists
 * of words. A native select brings the platform's own keyboard handling, its
 * touch behaviour and its screen reader support for free, and none of that is
 * worth reimplementing to change how the arrow looks.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-red-500',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
