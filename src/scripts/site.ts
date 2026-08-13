/**
 * Client behaviour.
 *  1. theme switch
 *  2. the hero film
 *  3. project expansions
 *  4. the walkthrough film
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
  const src = film.dataset.src;

  /* Autoplay everywhere, by explicit request. Note this is deliberately not
     gated on prefers-reduced-motion: the client wants the film to run. Every
     other animation on the site still respects that preference. */
  if (src) {
    film.src = src;

    const start = () => film.play().catch(() => {});
    start();

    /* Some browsers refuse autoplay until the page has been interacted with.
       Rather than showing a button, retry quietly on the first interaction. */
    const retry = () => {
      if (film.paused) start();
      if (!film.paused) {
        ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) =>
          window.removeEventListener(e, retry),
        );
      }
    };
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((e) =>
      window.addEventListener(e, retry, { passive: true }),
    );

    /* Stop decoding video nobody can see once it is scrolled past. */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) start();
            else film.pause();
          });
        },
        { threshold: 0.05 },
      ).observe(film);
    }
  }
}

/* ------------------------------------------------------- 3. expansions --- */
/* Clicking a tile expands its project under the rail instead of navigating.
   The tile stays a real link, so this is an enhancement: with no JavaScript, or
   on a modified click (new tab, download), the link is left alone. */

const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));
const triggers = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-expand]'));

if (panels.length && triggers.length) {
  const gridEl = document.querySelector<HTMLElement>('[data-grid]');

  function closeAll() {
    panels.forEach((p) => p.setAttribute('hidden', ''));
    triggers.forEach((t) => {
      t.setAttribute('aria-expanded', 'false');
      t.closest('.card')?.classList.remove('is-open');
    });
    gridEl?.classList.remove('has-open');
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
    trigger.closest('.card')?.classList.add('is-open');
    gridEl?.classList.add('has-open');

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

/* ---------------------------------------------------------- 3b. the rail --- */
/* The strip of remaining projects scrolls natively, so a trackpad, a touch
   screen and a keyboard all work without any of this. The two buttons are for
   a mouse with no horizontal wheel, and they disable themselves at each end.
   Deliberately no drag-to-scroll: capturing the pointer to fake dragging is
   what stopped the cards being clickable the last time this was a rail. */

const rail = document.querySelector<HTMLElement>('[data-rail]');
if (rail) {
  const prev = document.querySelector<HTMLButtonElement>('[data-rail-prev]');
  const next = document.querySelector<HTMLButtonElement>('[data-rail-next]');

  /* One card plus its gap, so a press advances by whole cards. */
  const step = () => {
    const card = rail.querySelector<HTMLElement>('.card');
    if (!card) return rail.clientWidth * 0.8;
    const gap = parseFloat(getComputedStyle(rail).columnGap || '0') || 0;
    return Math.max(1, Math.round(card.getBoundingClientRect().width + gap));
  };

  const sync = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    if (prev) prev.disabled = rail.scrollLeft <= 1;
    if (next) next.disabled = rail.scrollLeft >= max - 1;
  };

  const nudge = (dir: number) =>
    rail.scrollBy({ left: dir * step(), behavior: reduced ? 'auto' : 'smooth' });

  prev?.addEventListener('click', () => nudge(-1));
  next?.addEventListener('click', () => nudge(1));
  rail.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  sync();
}

/* ------------------------------------------------------------- 4. film --- */
/* Swap the poster for the real player only when asked. Until then nothing has
   been requested from Google and no cookie has been set. */

document.querySelectorAll<HTMLButtonElement>('[data-youtube]').forEach((facade) => {
  facade.addEventListener('click', () => {
    const id = facade.dataset.youtube;
    if (!id) return;
    const frame = document.createElement('iframe');
    frame.src =
      `https://www.youtube-nocookie.com/embed/${id}` +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    frame.title = 'Project walkthrough';
    frame.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;display:block';
    facade.replaceWith(frame);
    frame.focus();
  });
});

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
