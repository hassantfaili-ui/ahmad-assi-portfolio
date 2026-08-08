/**
 * Datum behaviour.
 *  1. theme switch
 *  2. the hero film
 *  3. the filmstrip: arrows, drag, and the wheel
 *  4. project expansions
 *  5. scroll reveals
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------- 1. theme --- */
/* Light by default. The choice persists so a visitor who prefers one keeps it. */

const root = document.documentElement;

function applyTheme(next: 'light' | 'dark') {
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* private browsing: the choice simply does not persist */
  }
  document.querySelectorAll<HTMLElement>('[data-theme-label]').forEach((el) => {
    el.textContent = next === 'dark' ? 'Light' : 'Dark';
  });
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(next === 'dark'));
    b.setAttribute('aria-label', next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');

document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) => {
  b.addEventListener('click', () =>
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'),
  );
});

/* --------------------------------------------------------- 2. hero film --- */
/* The source is attached here rather than in the markup so a narrow screen or a
   reduced-motion preference never downloads it. Those cases keep the poster. */

const film = document.querySelector<HTMLVideoElement>('[data-hero]');
if (film) {
  const wide = window.matchMedia('(min-width: 700px)').matches;
  const src = film.dataset.src;
  if (src && wide && !reduced) {
    film.src = src;
    film.play().catch(() => {
      /* a browser that blocks autoplay simply shows the poster */
    });
    // stop it while off screen rather than decoding video nobody can see
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) film.play().catch(() => {});
            else film.pause();
          });
        },
        { threshold: 0.05 },
      ).observe(film);
    }
  }
}

/* -------------------------------------------------------- 3. filmstrip --- */
/* Arrows, drag to move, and the wheel. Native scroll underneath all of it, so
   the works can still be moved with a trackpad, a touch swipe or the keyboard
   if none of this JavaScript runs. */

document.querySelectorAll<HTMLElement>('[data-strip-wrap]').forEach((wrap) => {
  const strip = wrap.querySelector<HTMLElement>('[data-strip]');
  const prev = wrap.querySelector<HTMLButtonElement>('[data-strip-prev]');
  const next = wrap.querySelector<HTMLButtonElement>('[data-strip-next]');
  if (!strip) return;

  const step = () => {
    const tile = strip.querySelector<HTMLElement>('.tile');
    if (!tile) return 310;
    const gap = parseFloat(getComputedStyle(strip).columnGap || '10');
    return tile.getBoundingClientRect().width + (Number.isNaN(gap) ? 10 : gap);
  };

  const sync = () => {
    const max = strip.scrollWidth - strip.clientWidth - 2;
    const overflows = max > 0;
    if (prev) prev.hidden = !overflows || strip.scrollLeft <= 2;
    if (next) next.hidden = !overflows || strip.scrollLeft >= max;
  };

  prev?.addEventListener('click', () => strip.scrollBy({ left: -step(), behavior: 'smooth' }));
  next?.addEventListener('click', () => strip.scrollBy({ left: step(), behavior: 'smooth' }));
  strip.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();

  /* Grab and move.

     Dragging starts lazily: the pointer is NOT captured on pointerdown, because
     capturing retargets the following click to the strip and the tile's own link
     never receives it, which silently breaks clicking the photos entirely.
     Capture is taken only once the pointer has actually moved past a threshold,
     so a plain click always reaches the link and a drag still works. */
  const DRAG_START = 5; // px of movement before this counts as a drag
  let pending = false;
  let dragging = false;
  let startX = 0;
  let startLeft = 0;
  let moved = 0;

  strip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pending = true;
    dragging = false;
    moved = 0;
    startX = e.clientX;
    startLeft = strip.scrollLeft;
  });

  strip.addEventListener('pointermove', (e) => {
    if (!pending && !dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));

    if (pending && moved > DRAG_START) {
      pending = false;
      dragging = true;
      try {
        strip.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the drag still works without it */
      }
      strip.classList.add('is-dragging');
    }

    if (dragging) strip.scrollLeft = startLeft - dx;
  });

  const endDrag = (e: PointerEvent) => {
    pending = false;
    if (!dragging) return;
    dragging = false;
    strip.classList.remove('is-dragging');
    if (strip.hasPointerCapture(e.pointerId)) strip.releasePointerCapture(e.pointerId);
    sync();
  };
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);

  /* Only a real drag suppresses the click, so moving the works never opens a
     project by accident and a click never gets eaten. */
  strip.addEventListener(
    'click',
    (e) => {
      if (moved > DRAG_START) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  /* a vertical wheel over the works moves them sideways, which is what people
     expect of a horizontal rail on a desktop */
  strip.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0) return;
      const atStart = strip.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = strip.scrollLeft >= max - 1 && e.deltaY > 0;
      if (atStart || atEnd) return; // let the page scroll on past the ends
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    },
    { passive: false },
  );
});

/* ------------------------------------------------------- 4. expansions --- */
/* Clicking a tile expands its project under the rail instead of navigating.
   The tile stays a real link, so this is an enhancement: with no JavaScript, or
   on a modified click (new tab, download), the link is left alone. */

const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));
const triggers = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-expand]'));

if (panels.length && triggers.length) {
  const stripEl = document.querySelector<HTMLElement>('[data-strip]');

  function closeAll() {
    panels.forEach((p) => p.setAttribute('hidden', ''));
    triggers.forEach((t) => {
      t.setAttribute('aria-expanded', 'false');
      t.closest('.tile')?.classList.remove('is-open');
    });
    stripEl?.classList.remove('has-open');
  }

  function open(id: string, focus: boolean) {
    const panel = panels.find((p) => p.dataset.panel === id);
    const trigger = triggers.find((t) => t.dataset.expand === id);
    if (!panel || !trigger) return;
    const already = trigger.getAttribute('aria-expanded') === 'true';
    closeAll();
    if (already) return; // clicking the open one closes it

    panel.removeAttribute('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    trigger.closest('.tile')?.classList.add('is-open');
    stripEl?.classList.add('has-open');

    if (focus) {
      // move focus to the heading so a keyboard reader lands inside the panel
      panel.querySelector<HTMLElement>('.panel-title')?.focus({ preventScroll: true });
      panel.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }

  triggers.forEach((t) => {
    t.addEventListener('click', (e) => {
      // let people open the real page in a new tab or window
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as MouseEvent).button !== 0) return;
      e.preventDefault();
      open(t.dataset.expand || '', true);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-panel-close]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.closest<HTMLElement>('[data-panel]')?.dataset.panel;
      closeAll();
      triggers.find((t) => t.dataset.expand === id)?.focus();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openTrigger = triggers.find((t) => t.getAttribute('aria-expanded') === 'true');
    if (!openTrigger) return;
    closeAll();
    openTrigger.focus();
  });

  // deep link: /architecture#panel-lincoln-beach-center opens that project
  const hash = location.hash.replace('#panel-', '');
  if (hash && panels.some((p) => p.dataset.panel === hash)) open(hash, false);
}

/* ---------------------------------------------------------- 5. reveals --- */

const reveals = document.querySelectorAll<HTMLElement>('.reveal');
if (reduced || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  );
  reveals.forEach((el) => io.observe(el));
}

/* Loaded as a module by the layout; the export keeps TypeScript treating it as
   one, so these top-level names stay scoped to this file. */
export {};
