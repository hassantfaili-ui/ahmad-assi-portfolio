'use client';

/**
 * The closing film: a second walkthrough behind About and Get in touch at the
 * foot of the home page, so the page ends on moving footage the way it opens
 * on it.
 *
 * This is not HeroFilm with a different class name, and every difference is
 * deliberate.
 *
 * WHEN IT LOADS. The hero is the first thing on the page and autoplays on every
 * visit, so it fetches straight away. This band is the last thing on the page
 * and plenty of visitors never reach it, so nothing is fetched until it is near
 * the viewport. A second film downloading alongside the first would double what
 * the home page costs a visitor for footage they had not scrolled to yet.
 *
 * REDUCED MOTION. Autoplaying regardless of the setting was asked for
 * explicitly, and that request was about the hero. Background motion under two
 * columns of body prose is the case the setting exists for, so someone who has
 * asked for less motion gets the poster and no video is requested at all.
 *
 * WHICH ENCODE. Identical to the hero, and imported from it rather than copied.
 * The 1200 pixel threshold has already been got wrong twice, and there should
 * be one place left where it can be got wrong again.
 *
 * The chosen source is attached in the effect and never in the markup, so
 * nothing starts downloading before the right encode has been picked.
 */

import { useEffect, useRef } from 'react';

/* The hero's decision, not a hero specific one: viewport width, save-data and
   2G all point at the same encode wherever the film is on the page. Renamed on
   the way in because "hero" is the wrong word down here. */
import { chooseHeroEncode as chooseEncode, type HeroSources } from './HeroFilm';

export interface ClosingFilmProps {
  /** Already built URLs, not object keys: the caller runs them through mediaUrl. */
  sources: HeroSources;
  poster: string | null;
}

export default function ClosingFilm({ sources, poster }: ClosingFilmProps) {
  const filmRef = useRef<HTMLVideoElement>(null);
  const { large, small } = sources;

  useEffect(() => {
    const film = filmRef.current;
    if (!film) return;

    /* Asked for less motion: the poster stays and no encode is ever requested.
       Read once rather than watched, because a visitor who changes the setting
       mid-page is not worth a listener that outlives the band. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const src = chooseEncode({
      large: film.dataset.srcLarge ?? large,
      small: film.dataset.srcSmall ?? small,
    });

    /* No encode uploaded yet: the poster stays and nothing is fetched. */
    if (!src) return;

    /* The whole point of the gate below. Until this is true the file has not
       been asked for, and it is also what keeps the observer from pausing a
       video that has never played: an IntersectionObserver fires once as soon
       as it starts observing, and that first callback can report isIntersecting
       false while layout is still settling. That is what made the hero's
       autoplay look intermittent before it grew a guard of its own. */
    let attached = false;

    const start = () => {
      if (!attached) {
        attached = true;
        /* muted as a property as well as in the markup: React applies it on the
           client, and a video that is not muted at the moment play() runs is
           simply refused autoplay. autoplay is set here rather than in the
           markup so nothing can download before the band is worth loading. */
        film.muted = true;
        film.autoplay = true;
        film.src = src;
      }
      void film.play().catch(() => {});
    };

    /* Some browsers refuse autoplay until the page has been interacted with.
       Rather than showing a button, retry quietly on the first interaction, and
       only once the band has actually asked for the file: an interaction that
       happens at the top of the page must not pull the closing film down. */
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    const retry = () => {
      if (!attached) return;
      if (film.paused) start();
      if (!film.paused) events.forEach((e) => window.removeEventListener(e, retry));
    };
    events.forEach((e) => window.addEventListener(e, retry, { passive: true }));

    /* One observer does both jobs: it decides when the file is worth fetching
       and it stops decoding video nobody can see. The margin is generous on
       purpose. It gives the first frames time to arrive before the band is
       read, and it keeps a band that is only just off screen playing rather
       than pausing and resuming on every small scroll. */
    let observer: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) start();
            else if (attached) film.pause();
          });
        },
        { rootMargin: '300px 0px', threshold: 0 },
      );
      observer.observe(film);
    } else {
      /* Without an observer there is no way to tell when the band arrives, and
         a poster that never becomes a film is worse than an early download. */
      start();
    }

    /* An effect can run more than once, twice on mount in development alone, so
       the listeners and the observer have to be torn down or each run leaves a
       set behind calling play() on a band nobody is looking at. */
    return () => {
      events.forEach((e) => window.removeEventListener(e, retry));
      observer?.disconnect();
    };
  }, [large, small]);

  return (
    <div className="closing-film" aria-hidden="true">
      <video
        ref={filmRef}
        className="closing-film-media"
        /* The two encodes are named in the markup, exactly as the hero names
           them, even though the effect above is what sets src. They are the
           only record in the served HTML that these files exist. The effect
           reads them from here rather than from the props, so the markup and
           the behaviour cannot describe different files. */
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
    </div>
  );
}
