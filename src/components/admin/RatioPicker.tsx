'use client';

import { Scan } from 'lucide-react';

import { RATIOS, ratioValue, type Ratio } from '@/lib/crop';
import { cn } from '@/lib/utils';

/**
 * The shape a picture is cut to: its own, or one of the preset ratios.
 *
 * A row of small frames rather than a drop down, because the choice is a
 * visual one and a word like 21:9 means less than the shape it names. The
 * first frame is the picture's own shape, which is where every picture
 * starts and what "Auto" in the reference design meant.
 *
 * A radio group under the hood, so arrow keys move between the shapes and a
 * screen reader hears which one is pressed.
 */

export interface RatioPickerProps {
  value: Ratio | null;
  onChange: (value: Ratio | null) => void;
  /** Names the group for assistive technology, "Shape of the courtyard picture" say. */
  label: string;
  className?: string;
}

const CHOICES: { value: Ratio | null; label: string }[] = [
  { value: null, label: 'Auto' },
  ...RATIOS.map((ratio) => ({ value: ratio, label: ratio })),
];

/** A little frame of the shape, drawn to fit a 20 by 14 box. */
function Frame({ ratio }: { ratio: Ratio }) {
  const value = ratioValue(ratio);
  const width = value >= 1 ? 18 : Math.round(12 * value);
  const height = value >= 1 ? Math.round(18 / value) : 12;
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5" aria-hidden="true">
      <rect
        x={(20 - width) / 2}
        y={(14 - height) / 2}
        width={width}
        height={height}
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function RatioPicker({ value, onChange, label, className }: RatioPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex flex-wrap gap-0.5 rounded-md bg-neutral-100 p-0.5', className)}
    >
      {CHOICES.map((choice) => {
        const pressed = choice.value === value;
        return (
          <button
            key={choice.label}
            type="button"
            role="radio"
            aria-checked={pressed}
            onClick={() => onChange(choice.value)}
            className={cn(
              'flex min-w-10 flex-col items-center gap-0.5 rounded px-1.5 py-1 text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900',
              pressed
                ? 'bg-white font-semibold text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800',
            )}
          >
            {choice.value ? (
              <Frame ratio={choice.value} />
            ) : (
              <Scan className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
