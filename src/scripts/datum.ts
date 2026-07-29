/**
 * Datum behaviour.
 *  1. the elevation readout at the waterline
 *  2. the hero film
 *  3. the filmstrip: arrows, drag, and the wheel
 *  4. scroll reveals
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------- 1. elevation --- */
/* The top of the page is the high point and the foot of it is the water, so the
   number falls as you descend. Height is derived from the page's own length, so
   a short page reads a smaller range than a long one and it always ends at zero. */

const readout = document.querySelector<HTMLOutputElement>('[data-elev]');

if (readout) {
  const format = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  let frame = 0;

  function update() {
    frame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    // roughly three metres per screen of content, rounded to something plausible
    const top = Math.max(3, Math.round((scrollable / window.innerHeight) * 3.4 * 10) / 10);
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 1;
    readout!.textContent = format(top * (1 - progress));
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(update);
  }

  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}

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

  /* grab and move. Snapping is turned off while dragging or the strip fights
     the pointer, and a drag past a few pixels suppresses the click so moving
     the works never opens a project by accident. */
  let dragging = false;
  let startX = 0;
  let startLeft = 0;
  let moved = 0;

  strip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startLeft = strip.scrollLeft;
    strip.setPointerCapture(e.pointerId);
    strip.classList.add('is-dragging');
  });

  strip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    strip.scrollLeft = startLeft - dx;
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    strip.classList.remove('is-dragging');
    if (strip.hasPointerCapture(e.pointerId)) strip.releasePointerCapture(e.pointerId);
    sync();
  };
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);

  strip.addEventListener(
    'click',
    (e) => {
      if (moved > 6) {
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

/* ---------------------------------------------------------- 4. reveals --- */

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
