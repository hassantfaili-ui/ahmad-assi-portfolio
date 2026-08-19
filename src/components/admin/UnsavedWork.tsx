'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * One place that knows whether anything on screen is unsaved.
 *
 * This is a context rather than a prop because of where the danger is. Each
 * editor knew perfectly well what it had outstanding, but the navigation bar
 * sits in the layout above all of them and could not see any of it, so the four
 * links Ahmad is most likely to click by habit were the one route out that
 * nothing guarded. A per component flag cannot fix that no matter how carefully
 * it is threaded, because the thing that needs to read it renders above the
 * thing that owns it.
 *
 * So every editor registers what it has outstanding under its own key, and the
 * layout asks one question: is anything unsaved. Keys rather than a counter so
 * a component that unmounts mid edit takes its own claim with it and cannot
 * leave the whole area permanently marked dirty.
 *
 * Registered work includes uploads in flight. A four minute browser transcode
 * is the single most expensive thing to lose here and it is not "unsaved
 * changes" in any form, so it would never have been covered by a form flag.
 */

interface UnsavedContextValue {
  /**
   * Record the fact, without rendering anything.
   *
   * Split from `register` because React forbids scheduling a state update from
   * an insertion effect, which is the phase early enough for a click handler to
   * be able to trust the answer. So the ref is written there and the state
   * follows in an ordinary effect, one for deciding and one for showing.
   */
  registerLive: (key: string, dirty: boolean) => void;
  register: (key: string, dirty: boolean) => void;
  release: (key: string) => void;
  /** For rendering: a badge, a disabled state. One commit behind at worst. */
  anyUnsaved: boolean;
  /**
   * For deciding, at the moment of a click or a back press.
   *
   * Reads a ref rather than state, and the difference is not academic.
   * Registration goes through React state, so `anyUnsaved` is a render behind
   * the keystroke that caused it. A link that chose between guarded and
   * unguarded at render time was therefore unguarded for the window after the
   * first character was typed, which on a busy screen is exactly when a
   * keystroke and a habitual click are most likely to arrive together.
   */
  isAnyUnsaved: () => boolean;
  /** Ask before leaving. Resolves true when it is safe to go. */
  confirmLeave: () => Promise<boolean>;
}

const UnsavedContext = createContext<UnsavedContextValue | null>(null);

export function useUnsavedWork(): UnsavedContextValue {
  const context = useContext(UnsavedContext);
  if (!context) {
    throw new Error('useUnsavedWork must be used inside UnsavedWorkProvider');
  }
  return context;
}

/**
 * Declare that this component has, or does not have, unsaved work.
 *
 * The key has to be stable and unique per mounted editor. Passing false is not
 * the same as unmounting: false means "mounted and clean", which is what lets a
 * save clear the flag without the component going away.
 */
export function useRegisterUnsaved(key: string, dirty: boolean): void {
  const { registerLive, register, release } = useUnsavedWork();

  /* The fact, recorded during the commit, before layout effects and long
     before paint. A passive effect would leave this two commits behind the
     keystroke that dirtied the screen, and a click landing in that window would
     be treated as leaving a clean one. Nothing here touches the DOM, reads
     layout, or schedules a render, which is what makes it safe at that phase:
     it writes one ref that the click handler reads. */
  useInsertionEffect(() => {
    registerLive(key, dirty);
  }, [registerLive, key, dirty]);

  /* And the render, in an ordinary effect. This is what drives the badge and
     anything else that is shown, where being a commit behind costs nothing. */
  useEffect(() => {
    register(key, dirty);
  }, [register, key, dirty]);

  useEffect(() => {
    return () => release(key);
  }, [release, key]);
}

export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);

  /* The same set, held where a click handler can read it without waiting for a
     render. State drives what is shown; this drives what is decided. */
  const live = useRef(new Set<string>());
  const anyUnsaved = dirtyKeys.length > 0;
  const isAnyUnsaved = useCallback(() => live.current.size > 0, []);

  const registerLive = useCallback((key: string, dirty: boolean) => {
    if (dirty) live.current.add(key);
    else live.current.delete(key);
  }, []);

  const register = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((current) => {
      const has = current.includes(key);
      if (dirty === has) return current;
      return dirty ? [...current, key] : current.filter((existing) => existing !== key);
    });
  }, []);

  const release = useCallback((key: string) => {
    live.current.delete(key);
    setDirtyKeys((current) => (current.includes(key) ? current.filter((k) => k !== key) : current));
  }, []);

  /* The browser's own warning, for closing the tab, reloading, and leaving the
     origin. It cannot see a client side route change, which is why the rest of
     this file exists. */
  useEffect(() => {
    if (!anyUnsaved) return;

    const warn = (event: BeforeUnloadEvent) => {
      // Both, because browsers disagree about which one arms the dialog, and
      // the message itself has been ignored by all of them for years.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyUnsaved]);

  /* A promise the confirm dialog resolves, so a link can await an answer. */
  const pending = useRef<((leave: boolean) => void) | null>(null);
  const [asking, setAsking] = useState(false);

  const confirmLeave = useCallback((): Promise<boolean> => {
    if (!isAnyUnsaved()) return Promise.resolve(true);

    /* A second ask before the first is answered, for example a link clicked
       while the back button guard is already waiting. The earlier caller is
       told it was superseded rather than left hanging forever, which would have
       silently dropped the navigation it was waiting to perform. */
    pending.current?.(false);

    setAsking(true);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
  }, [isAnyUnsaved]);

  const answer = useCallback((leave: boolean) => {
    setAsking(false);
    pending.current?.(leave);
    pending.current = null;
  }, []);

  useBackButtonGuard(anyUnsaved, confirmLeave);

  const value = useMemo(
    () => ({ registerLive, register, release, anyUnsaved, isAnyUnsaved, confirmLeave }),
    [registerLive, register, release, anyUnsaved, isAnyUnsaved, confirmLeave],
  );

  return (
    <UnsavedContext.Provider value={value}>
      {children}

      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          // Dismissing the dialog is a decision to stay, which is the safe one.
          if (!open) answer(false);
        }}
        title="Leave without saving?"
        description="You have changes on this page that have not been saved. If you leave now they are lost."
        confirmLabel="Leave and lose the changes"
        onConfirm={() => answer(true)}
      />
    </UnsavedContext.Provider>
  );
}

/**
 * The back button.
 *
 * beforeunload does not fire for it. The App Router services back as a popstate
 * and a soft navigation, so the document never unloads and the browser's own
 * warning never appears. Ahmad edits a project for twenty minutes, presses
 * back out of habit, and arrives at the projects list with everything gone,
 * having been told "Not saved yet" the entire time.
 *
 * The only way to intercept it is to have something to go back to. While there
 * is unsaved work a sentinel entry is pushed onto the history stack, so the
 * first back press pops the sentinel rather than leaving the page. That press
 * is caught here, the question is asked, and if the answer is to stay the
 * sentinel is pushed again so the next press works the same way.
 *
 * This is a real trade: it puts one extra entry on the history stack while
 * work is outstanding. That is the price of the only mechanism the platform
 * offers, and it is cheaper than losing the work.
 */
function useBackButtonGuard(anyUnsaved: boolean, confirmLeave: () => Promise<boolean>): void {
  const router = useRouter();
  const armed = useRef(false);

  useEffect(() => {
    if (!anyUnsaved) {
      /* Disarm the sentinel in place rather than popping it.
         Calling history.back() here raced every navigation that follows a save:
         creating a project clears the title, which clears the last unsaved
         claim, which ran this, and the back landed before the router.push that
         was meant to open the new project. It was intermittent, so it passed on
         a fast desktop run and failed on a slower device, which is the worst
         way for a bug like this to behave.
         replaceState clears the marker without moving anywhere. The extra
         history entry stays, which is harmless: it now points at the same page
         and a back press goes where it should. */
      if (armed.current) {
        armed.current = false;
        if (window.history.state?.unsavedSentinel) {
          window.history.replaceState({ ...window.history.state, unsavedSentinel: false }, '');
        }
      }
      return;
    }

    if (!armed.current) {
      window.history.pushState({ unsavedSentinel: true }, '');
      armed.current = true;
    }

    const onPopState = () => {
      void (async () => {
        const leave = await confirmLeave();
        if (leave) {
          armed.current = false;
          router.back();
          return;
        }
        // Staying: put the sentinel back so the next press asks again.
        window.history.pushState({ unsavedSentinel: true }, '');
      })();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [anyUnsaved, confirmLeave, router]);
}
