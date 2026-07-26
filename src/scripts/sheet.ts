/**
 * Sheet behaviour. No framework: five small features, each one listener deep.
 *  1. print type (bond / blueline), persisted
 *  2. sheet index overlay on narrow screens
 *  3. grid bubbles that track the section in view
 *  4. scroll reveal
 *  5. full screen drawing viewer
 *  6. project filter on the work index
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------- 1. print type --- */

const PRINTS = ['bond', 'blueline'] as const;
type Print = (typeof PRINTS)[number];
const LABEL: Record<Print, string> = { bond: 'Bond', blueline: 'Blueline' };

function currentPrint(): Print {
  const set = document.documentElement.dataset.print as Print | undefined;
  if (set && PRINTS.includes(set)) return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'blueline' : 'bond';
}

function applyPrint(p: Print) {
  document.documentElement.dataset.print = p;
  try {
    localStorage.setItem('print-type', p);
  } catch {
    /* private browsing: the choice simply does not persist */
  }
  document.querySelectorAll<HTMLElement>('[data-print-label]').forEach((el) => {
    el.textContent = LABEL[p];
  });
}

applyPrint(currentPrint());

document.querySelectorAll<HTMLButtonElement>('[data-print-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyPrint(currentPrint() === 'bond' ? 'blueline' : 'bond');
  });
});

/* --------------------------------------------------------- 2. index --- */

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

/* -------------------------------------------------- 3. grid bubbles --- */

const bubbles = Array.from(document.querySelectorAll<HTMLAnchorElement>('.bubble'));
const marked = bubbles
  .map((b) => document.querySelector<HTMLElement>(b.getAttribute('href') || ''))
  .filter((el): el is HTMLElement => Boolean(el));

if (marked.length && 'IntersectionObserver' in window) {
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const i = marked.indexOf(e.target as HTMLElement);
        bubbles.forEach((b, j) =>
          j === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'),
        );
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  marked.forEach((el) => spy.observe(el));
}

/* ------------------------------------------------------- 4. reveals --- */

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
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
  );
  reveals.forEach((el) => io.observe(el));
}

/* -------------------------------------------------- 5. drawing viewer --- */

const view = document.querySelector<HTMLElement>('[data-zoom-view]');
const stage = view?.querySelector<HTMLElement>('[data-zoom-stage]');
const viewLabel = view?.querySelector<HTMLElement>('[data-zoom-label]');
let lastOpener: HTMLElement | null = null;

function closeView() {
  if (!view) return;
  view.removeAttribute('open');
  document.body.style.overflow = '';
  stage?.classList.remove('is-zoomed');
  lastOpener?.focus();
}

document.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!view || !stage) return;
    const svg = btn.querySelector('svg');
    if (!svg) return;
    stage.replaceChildren(svg.cloneNode(true));
    if (viewLabel) viewLabel.textContent = svg.getAttribute('aria-label') || 'Drawing';
    lastOpener = btn;
    view.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    view.querySelector<HTMLButtonElement>('[data-zoom-close]')?.focus();
  });
});

view?.querySelector<HTMLButtonElement>('[data-zoom-close]')?.addEventListener('click', closeView);
stage?.addEventListener('click', () => stage.classList.toggle('is-zoomed'));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (view?.hasAttribute('open')) closeView();
  else if (menu?.hasAttribute('open')) setMenu(false);
});

/* --------------------------------------------------------- 6. filter --- */

const filters = document.querySelectorAll<HTMLButtonElement>('[data-filter]');
const items = document.querySelectorAll<HTMLElement>('[data-category]');
const tally = document.querySelector<HTMLElement>('[data-tally]');

if (filters.length && items.length) {
  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      const want = btn.dataset.filter || 'all';
      filters.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      items.forEach((item) => {
        const match = want === 'all' || item.dataset.category === want;
        item.hidden = !match;
        if (match) shown++;
      });
      if (tally) {
        tally.textContent = `${shown} ${shown === 1 ? 'project' : 'projects'}${
          want === 'all' ? '' : ` in ${want.toLowerCase()}`
        }`;
      }
    });
  });
}
