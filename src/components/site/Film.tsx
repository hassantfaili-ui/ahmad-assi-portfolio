'use client';

/**
 * A project walkthrough, from either the media bucket or YouTube.
 *
 * The YouTube path deliberately does NOT drop an iframe into the page. A live
 * embed pulls over a megabyte of script and sets tracking cookies on load, even
 * for a visitor who never presses play. Instead the poster frame is shown with a
 * play control, and the iframe is created only on click. That keeps the page
 * fast and means nothing is sent to Google until the visitor asks for it.
 *
 * youtube-nocookie.com is used for the same reason.
 *
 * The self hosted path is click to play for the same kind of reason: preload is
 * "none" so an 11MB film is only fetched by somebody who actually wants it.
 */

import { useEffect, useRef, useState } from 'react';

import { extractYouTubeId } from '@/lib/youtube-id';

import Reveal from './Reveal';

import styles from './Film.module.css';

export interface FilmProps {
  /** One entry per encode. Already built URLs, not object keys. */
  sources: { height: number; url: string }[];
  youtubeId?: string | null;
  poster: string;
  caption?: string | null;
}

export default function Film({ sources, youtubeId: youtube, poster, caption }: FilmProps) {
  /* The extractor returns null for a string no shape matches, so a junk id
     saved before validation refused them falls through to the uploaded
     sources, or to nothing, rather than to an iframe that can never play. */
  const id = youtube ? extractYouTubeId(youtube) : null;

  /* Nothing is requested from Google until this flips. */
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  /* The facade the visitor just pressed is gone once the player is in, so focus
     has to be moved into the player or a keyboard visitor is left at the top of
     the document. The Astro version did this straight after replaceWith. */
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  if (id) {
    return (
      <Reveal className="film-frame">
        {playing ? (
          <iframe
            ref={frameRef}
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title="Project walkthrough"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: '100%', aspectRatio: '16/9', border: 0, display: 'block' }}
          />
        ) : (
          /* data-youtube is kept so the rendered markup still matches the Astro
             site, but it is no longer a selector for a global script: the
             handler is bound here. Do not add a document wide listener for it
             or the player will be created twice. */
          <button
            className={`film-facade ${styles['film-facade']}`}
            type="button"
            data-youtube={id}
            aria-label="Play the walkthrough film"
            onClick={() => setPlaying(true)}
          >
            {/* A plain img, not next/image: the poster arrives as a finished URL
                and the image loader wants an R2 object key, so there is nothing
                for it to work with here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poster} alt="" loading="lazy" decoding="async" />
            <span className={`film-play ${styles['film-play']}`} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
        {caption && <p className={`film-caption ${styles['film-caption']}`}>{caption}</p>}
        <p className={`film-note ${styles['film-note']}`}>
          Plays from YouTube. Nothing is loaded from Google until you press play.
        </p>
      </Reveal>
    );
  }

  if (!sources.length) return null;

  /* Largest first. With no type attribute to go on the browser takes the first
     source it can play, and by the time anything is fetched at all the visitor
     has pressed play and asked for the best copy we hold. */
  const encodes = [...sources].sort((a, b) => b.height - a.height);

  return (
    <Reveal as="figure" className="film-frame">
      <video controls preload="none" playsInline poster={poster}>
        {encodes.map((s) => (
          <source key={s.url} src={s.url} />
        ))}
      </video>
      {caption && <figcaption>{caption}</figcaption>}
    </Reveal>
  );
}
