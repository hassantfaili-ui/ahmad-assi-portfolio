'use client';

/**
 * The front hero: the Lincoln Beach Center walkthrough, with Ahmad's
 * introduction over it.
 *
 * This was once a crossfaded slideshow of stills. It is now the real film,
 * which is a better first impression and is unambiguously his work.
 *
 * TWO ENCODES, chosen at runtime. The hero autoplays on every visit, so the file
 * size is spent out of the visitor's data allowance rather than ours. The large
 * encode goes to viewports 1200 CSS pixels and wider, the small one to
 * everything narrower, to anyone on a slow connection, and to anyone who has
 * asked their browser to save data.
 *
 * True 4K is deliberately not offered. Sixty seconds of watchable 4K is about
 * 80MB, which every visitor would download before reading a word, for a film
 * that is scrimmed, cropped to the viewport and playing behind text.
 *
 * It autoplays everywhere, including on a phone and with reduced motion set,
 * because that was asked for explicitly. Be aware what that means: a phone
 * visitor downloads the small encode whether they wanted moving pictures or not.
 * Every other animation on the site still honours prefers-reduced-motion, so do
 * not "fix" this one to match them.
 *
 * The chosen source is attached in the effect below and never in the markup, so
 * nothing starts downloading before the right encode has been picked.
 */

import Link from 'next/link';
import { useEffect, useRef, type CSSProperties } from 'react';

export interface HeroSources {
  large: string | null;
  small: string | null;
}

/**
 * Which encode this visitor gets. Exported so the threshold can be exercised
 * directly: it is the one decision here that has already been got wrong twice.
 *
 * Call it from an effect only. It reads the layout viewport, which does not
 * exist while the page is being rendered on the server.
 */
export function chooseHeroEncode({ large, small }: HeroSources): string | null {
  /* navigator.connection is Chromium only, so the width check below has to
     stand on its own everywhere else. */
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  const thrifty = conn?.saveData === true || /(^|-)2g$/.test(conn?.effectiveType ?? '');

  /* innerWidth can be 0 when this runs in a tab that has never been fronted,
     and 0 would silently hand the small file to every desktop visitor, so
     screen.width stands in when there is no layout viewport to read.

     It has to be a fallback and not a floor. Taking the widest of the three
     instead, which is what this once did, let a handset's own screen dimension
     override the real viewport: screen.width follows the current orientation,
     so a phone turned sideways reported 852 and a tablet 820.

     Judged in CSS pixels, deliberately not multiplied by devicePixelRatio. That
     multiplication was here to keep a retina laptop on the large file, but a
     1440px laptop clears the threshold on its own, so the only thing it really
     did was push small high density screens the wrong way: 820 x 2 and 852 x 3
     both sailed past the old 1600 mark and pulled 42.8MB onto a tablet or a
     phone, usually over cellular. The film is a scrimmed background loop behind
     text, which is the last thing on the page that needs the extra detail. */
  const layout = window.innerWidth || document.documentElement?.clientWidth || 0;
  const vw = layout || window.screen?.width || 0;

  /* 1200 puts laptops and desktops on the large file and every phone, plus a
     tablet held either way, on the small one. */
  return thrifty || vw < 1200 ? small || large : large || small;
}

export interface HeroFilmProps {
  eyebrow: string;
  name: string;
  surname: string;
  intro: string;
  ctaLabel: string;
  ctaHref: string;
  /** Already built URLs, not object keys: the caller runs them through mediaUrl. */
  sources: HeroSources;
  poster: string | null;
}

export default function HeroFilm({
  eyebrow,
  name,
  surname,
  intro,
  ctaLabel,
  ctaHref,
  sources,
  poster,
}: HeroFilmProps) {
  const filmRef = useRef<HTMLVideoElement>(null);
  const { large, small } = sources;

  useEffect(() => {
    const film = filmRef.current;
    if (!film) return;

    const src = chooseHeroEncode({
      large: film.dataset.srcLarge ?? large,
      small: film.dataset.srcSmall ?? small,
    });

    /* No encode uploaded yet: the poster stays and nothing is fetched. */
    if (!src) return;

    /* Autoplay everywhere, by explicit request. Deliberately not gated on
       prefers-reduced-motion, unlike every other animation on the site.

       muted is set as a property as well as in the markup because React applies
       it as a property on the client and a video that is not muted at the moment
       play() runs will simply be refused autoplay.

       autoplay is set here rather than in the markup so it can never start
       downloading before the variant is chosen. Setting the attribute as well as
       calling play() matters: a single play() can land before the browser will
       honour it and then reject silently, whereas the attribute means the
       browser starts as soon as it is willing to. */
    film.muted = true;
    film.autoplay = true;
    film.src = src;

    const start = () => {
      void film.play().catch(() => {});
    };
    start();

    /* Some browsers refuse autoplay until the page has been interacted with.
       Rather than showing a button, retry quietly on the first interaction. */
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    const retry = () => {
      if (film.paused) start();
      if (!film.paused) events.forEach((e) => window.removeEventListener(e, retry));
    };
    events.forEach((e) => window.addEventListener(e, retry, { passive: true }));

    /* Stop decoding video nobody can see once it is scrolled past.

       The `seen` guard is load bearing. An IntersectionObserver fires once as
       soon as it starts observing, and that first callback can report
       isIntersecting false while layout is still settling, even for an element
       filling the top of the viewport. Without the guard it paused the hero
       microseconds after start() had begun playing it, which is what made
       autoplay look intermittent: play, playing, pause, all at t=0. Never pause
       something that has not been visible yet. */
    let observer: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      let seen = false;
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              seen = true;
              start();
            } else if (seen) {
              film.pause();
            }
          });
        },
        { threshold: 0.05 },
      );
      observer.observe(film);
    }

    /* The Astro version was a one shot module script and never had to clean up.
       An effect can run more than once, twice on mount in development alone, so
       the listeners and the observer have to be torn down or each run leaves a
       set behind that keeps calling play() on a hero nobody is looking at. */
    return () => {
      events.forEach((e) => window.removeEventListener(e, retry));
      observer?.disconnect();
    };
  }, [large, small]);

  return (
    <section className="film">
      <video
        ref={filmRef}
        className="film-media"
        data-hero=""
        /* The two encodes are named in the markup, exactly as the Astro build
           named them, even though the effect below is what sets src. They are
           the only record in the served HTML that these files exist: without
           them a visitor with JavaScript off, or a reader looking at the page
           source, sees a video element that declares no source at all. The
           effect reads them from here rather than from the props, so the markup
           and the behaviour cannot describe different files. */
        data-src-large={sources.large ?? undefined}
        data-src-small={sources.small ?? undefined}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="film-scrim" aria-hidden="true"></div>
      <div className="film-body load">
        <p className="eyebrow" style={{ '--i': 0 } as CSSProperties}>
          {eyebrow}
        </p>
        <h1 style={{ '--i': 1 } as CSSProperties}>
          {name}
          <br />
          <span className="thin">{surname}</span>
        </h1>
        <p className="film-intro" style={{ '--i': 2 } as CSSProperties}>
          {intro}
        </p>
        <p style={{ '--i': 3, margin: '2.25rem 0 0' } as CSSProperties}>
          <Link className="btn" href={ctaHref}>
            {ctaLabel}{' '}
            <span className="i" aria-hidden="true">
              &rarr;
            </span>
          </Link>
        </p>
      </div>

      <p className="film-credit" aria-hidden="true">
        Lincoln Beach Center &nbsp;/&nbsp; Walkthrough
      </p>
    </section>
  );
}
