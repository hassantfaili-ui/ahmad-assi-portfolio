/**
 * Curated Works behaviour. Three small things: the mobile menu, the filmstrip
 * arrows, and scroll reveals. The strip itself is a native scroll container, so
 * it works with no JavaScript at all; the arrows only add a nicer way to drive it.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------- 1. menu --- */

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

/* -------------------------------------------------------- 2. filmstrip --- */

document.querySelectorAll<HTMLElement>('[data-strip-wrap]').forEach((wrap) => {
  const strip = wrap.querySelector<HTMLElement>('[data-strip]');
  const prev = wrap.querySelector<HTMLButtonElement>('[data-strip-prev]');
  const next = wrap.querySelector<HTMLButtonElement>('[data-strip-next]');
  if (!strip) return;

  // one tile plus one gap, read from the DOM rather than hard coded
  function step() {
    const tile = strip!.querySelector<HTMLElement>('.tile');
    if (!tile) return 310;
    const gap = parseFloat(getComputedStyle(strip!).columnGap || '10');
    return tile.getBoundingClientRect().width + (Number.isNaN(gap) ? 10 : gap);
  }

  function sync() {
    const max = strip!.scrollWidth - strip!.clientWidth - 2;
    const overflows = max > 0;
    if (prev) prev.hidden = !overflows || strip!.scrollLeft <= 2;
    if (next) next.hidden = !overflows || strip!.scrollLeft >= max;
  }

  prev?.addEventListener('click', () => strip.scrollBy({ left: -step(), behavior: 'smooth' }));
  next?.addEventListener('click', () => strip.scrollBy({ left: step(), behavior: 'smooth' }));
  strip.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();
});

/* ---------------------------------------------------------- 3. reveals --- */

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

/* This file is loaded as a module by the layout. The explicit export keeps
   TypeScript treating it as one, so its top-level names stay scoped to it. */
export {};
