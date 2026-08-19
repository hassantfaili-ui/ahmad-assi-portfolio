'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

/**
 * The theme switch.
 *
 * Light by default. The choice persists so a visitor who prefers one keeps it.
 *
 * The current theme is read from the document rather than held in React state,
 * through useSyncExternalStore, and that is the point rather than a flourish.
 * The document is genuinely the source of truth here: the inline script in the
 * layout has already set data-theme before first paint, which is what stops the
 * page flashing the wrong colours. Mirroring that into state inside an effect
 * means writing state during hydration, which React rejects with
 * react-hooks/set-state-in-effect, and it would be a second copy of a value the
 * DOM already holds.
 *
 * The server snapshot is light, which matches what the inline script has not
 * yet had a chance to change, so hydration agrees with the served markup.
 */

const THEME_EVENT = 'ahmadassi:themechange';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function serverTheme(): Theme {
  return 'light';
}

function apply(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* private browsing: the choice simply does not persist */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  const flip = useCallback(() => {
    apply(readTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  return (
    /* No aria-label. One was added during the port and it was a regression, not
       an improvement: an aria-label replaces the accessible name, so the button
       announced "Switch to dark theme" while reading "Dark". That breaks the
       WCAG label in name match the original satisfied, and it leaves anyone
       using voice control unable to say what they can see.

       The data attributes are kept so the rendered markup still matches the
       Astro build byte for byte. */
    <button className="theme" type="button" data-theme-toggle aria-pressed={theme === 'dark'} onClick={flip}>
      {/* The label names the theme the press would give you, not the one you
          are in, which is why it reads Dark while the page is light. */}
      <span data-theme-label>{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  );
}
