'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * The French half of an editing screen.
 *
 * Written for the project screen and named after it, and used by the resume
 * screen as it stands. Two screens inventing their own answer to this would be
 * two answers in front of the same person; renaming the file is the right move
 * if a third one wants it.
 *
 * THE TREATMENT, AND WHY IT IS THIS ONE.
 *
 * The project screen has around forty boxes already, and on a project with a
 * dozen photographs more than thirty of them can be translated. A French box
 * beside each one, always showing, would nearly double the height of a screen
 * that is two windows tall to begin with, and it would do that on every
 * ordinary edit, of which translating is a small fraction. So the French boxes
 * are revealed by one switch at the top and are out of the way the rest of the
 * time.
 *
 * Swapping the whole screen between the two languages was the other candidate
 * and it is worse for two reasons. Translating means reading the English while
 * writing the French, and a screen that shows one at a time hides the source
 * text at the moment it is needed. And this screen's entire history is work
 * that was typed, never sent, and never missed: hiding half of what the one
 * button saves behind a mode is how that happens again.
 *
 * So: revealed, not swapped. When they are showing, each French box sits
 * directly under the English one it belongs to, indented behind a blue rule,
 * marked Français, and carrying the English words as its grey placeholder. That
 * placeholder is the point. An empty French box shows, in the box itself, the
 * English that the French site will print until something is written there, so
 * "leaving it empty is fine" is not a sentence Ahmad has to be told and
 * remember, it is what he is looking at.
 *
 * Hiding the boxes never hides the work. The French lives in the screen's own
 * state with everything else and goes out in the same one press whether the
 * boxes are showing or not, and the strip at the top counts how many are
 * written, so there is no state of the screen where French exists and nothing
 * says so.
 */

const ShowingFrench = createContext(false);

/** Whether the French boxes are revealed. Presentation only: never a value. */
export function useShowingFrench(): boolean {
  return useContext(ShowingFrench);
}

export function FrenchBoxes({ showing, children }: { showing: boolean; children: ReactNode }) {
  return <ShowingFrench.Provider value={showing}>{children}</ShowingFrench.Provider>;
}

/**
 * The English that shows on the French site while a box is empty.
 *
 * Trimmed, because the long description runs to paragraphs and a placeholder
 * that long turns a box into a wall of grey text. The first line of it is
 * enough to say which words this box stands in for.
 */
function englishShowing(english: string): string {
  const clean = english.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Nothing written in English yet';
  return clean.length <= 80 ? clean : `${clean.slice(0, 79).trimEnd()}…`;
}

export interface FrenchBoxProps {
  /** The English box's label. This one is named after it, and says in French. */
  label: string;
  /** Its own id, so the label points at this box and not at the English one. */
  htmlFor: string;
  /** What the English box holds right now, shown greyed while this one is empty. */
  english: string;
  value: string;
  onChange: (value: string) => void;
  /** Given for the boxes whose English is a textarea, so the two match. */
  rows?: number;
}

/**
 * One French box, under the English box it translates.
 *
 * It renders nothing at all when the boxes are hidden, rather than being hidden
 * with a class. A box that is in the page but invisible is a box a screen reader
 * still reads out and the tab key still stops at, which would make the switch a
 * lie for exactly the people it would confuse most.
 */
export function FrenchBox({ label, htmlFor, english, value, onChange, rows }: FrenchBoxProps) {
  const showing = useShowingFrench();
  if (!showing) return null;

  const placeholder = englishShowing(english);

  return (
    <div className="mt-1.5 border-l-2 border-sky-300 pl-3">
      {/* Labelled rather than wrapped in a Field, because Field is built around
          a required mark and an error message and a French box has neither:
          nothing here is ever required, and nothing here can fail a save.
          The chip sits beside the label rather than inside it, so what a screen
          reader announces is the label and nothing else. It already ends in
          French; the chip saying so as well would only say it twice. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          aria-hidden="true"
          className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800"
        >
          Français
        </span>
        <Label htmlFor={htmlFor} className="text-xs text-sky-900">
          {label}, in French
        </Label>
      </div>

      {rows ? (
        <Textarea
          id={htmlFor}
          lang="fr"
          rows={rows}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1"
        />
      ) : (
        <Input
          id={htmlFor}
          lang="fr"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1"
        />
      )}
    </div>
  );
}
