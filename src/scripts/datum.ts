/**
 * Datum behaviour.
 *  1. the elevation readout at the waterline
 *  2. the sheet index on narrow screens
 *  3. filmstrip arrows
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

/* ------------------------------------------------------------ 2. index --- */

const menu = document.querySelector<HTMLElement>('[data-menu]');
const openers = document.querySelectorAll<HTMLButtonElement>('[data-menu-open]');
const closers = document.querySelectorAll<HTMLButtonElement>('[data-menu-close]');

function setMenu(open: boolean) {
  if (!menu) return;
  menu.toggleAttribute('open', open);
  openers.forEach((b) => b.setAttribute('aria-expanded', String(open)));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) menu.querySelector<HTMLAnchorElement>('a')?.focus();
  else openers[0]?.focus();
}

openers.forEach((b) => b.addEventListener('click', () => setMenu(true)));
closers.forEach((b) => b.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menu?.hasAttribute('open')) setMenu(false);
});

/* -------------------------------------------------------- 3. filmstrip --- */

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
