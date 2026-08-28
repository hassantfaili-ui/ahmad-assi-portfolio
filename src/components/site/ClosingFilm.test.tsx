/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

import ClosingFilm from './ClosingFilm';
import type { HeroSources } from './HeroFilm';

/**
 * What the closing film is allowed to download, and when.
 *
 * The band is the last thing on the home page, so the interesting behaviour is
 * all about restraint: it must not fetch a second walkthrough while the visitor
 * is still reading the first one, and it must not fetch one at all for someone
 * who asked for less motion. None of that is visible by looking at the page,
 * which is exactly why it is tested here: a regression would look like nothing
 * at all until it showed up on somebody's data bill.
 */

const LARGE = '/api/media-dev/closing-1440.mp4';
const SMALL = '/api/media-dev/closing-720.mp4';
const POSTER = '/api/media-dev/closing-poster.jpg';

interface FakeObserver {
  fire: (isIntersecting: boolean) => void;
  options: IntersectionObserverInit | undefined;
  disconnected: boolean;
}

let observers: FakeObserver[] = [];
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

/** jsdom's own matchMedia answers false to everything, so say so outright. */
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  observers = [];

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private record: FakeObserver;

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.record = {
          options,
          disconnected: false,
          fire: (isIntersecting) =>
            callback(
              [{ isIntersecting } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
        };
        observers.push(this.record);
      }

      observe() {}
      unobserve() {}
      disconnect() {
        this.record.disconnected = true;
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    },
  );

  /* jsdom has no media pipeline: play() throws "Not implemented" without this. */
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
    play as unknown as HTMLMediaElement['play'],
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);

  stubReducedMotion(false);
  window.innerWidth = 1024;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(sources: HeroSources = { large: LARGE, small: SMALL }, poster = POSTER) {
  const { container } = render(<ClosingFilm sources={sources} poster={poster} />);
  const film = container.querySelector('video');
  if (!film) throw new Error('the band rendered without a video element');
  return film;
}

/** What the effect actually attached, rather than what jsdom resolved it to. */
function attached(film: HTMLVideoElement) {
  return film.getAttribute('src');
}

describe('the closing film', () => {
  it('asks for nothing until the band is near the viewport', () => {
    const film = mount();

    expect(attached(film)).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(film.preload).toBe('none');

    act(() => observers[0].fire(true));

    expect(attached(film)).toBe(SMALL);
    expect(play).toHaveBeenCalled();
  });

  it('gives a wide viewport the large encode and a narrow one the small', () => {
    window.innerWidth = 1440;
    const wide = mount();
    act(() => observers[0].fire(true));
    expect(attached(wide)).toBe(LARGE);

    window.innerWidth = 900;
    const narrow = mount();
    act(() => observers[1].fire(true));
    expect(attached(narrow)).toBe(SMALL);
  });

  it('requests no film at all for someone who asked for less motion', () => {
    stubReducedMotion(true);
    const film = mount();

    /* Not merely unplayed: never observed, so nothing can start it later. */
    expect(observers).toHaveLength(0);
    expect(attached(film)).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(film.poster).toContain('closing-poster.jpg');
  });

  it('keeps the poster when no encode has been uploaded yet', () => {
    const film = mount({ large: null, small: null });

    expect(observers).toHaveLength(0);
    expect(attached(film)).toBeNull();
    expect(film.poster).toContain('closing-poster.jpg');
  });

  it('names both encodes in the markup even before it fetches one', () => {
    const film = mount();

    expect(film.dataset.srcLarge).toBe(LARGE);
    expect(film.dataset.srcSmall).toBe(SMALL);
  });

  it('never pauses a film it has not started, then stops it once it scrolls away', () => {
    const film = mount();

    /* An observer reports once as soon as it starts observing, and that first
       callback can say false while layout is settling. Pausing on it is what
       made the hero's autoplay look intermittent. */
    act(() => observers[0].fire(false));
    expect(pause).not.toHaveBeenCalled();
    expect(attached(film)).toBeNull();

    act(() => observers[0].fire(true));
    act(() => observers[0].fire(false));
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('starts looking well before the band arrives', () => {
    mount();
    expect(observers[0].options?.rootMargin).toBe('300px 0px');
  });
});
