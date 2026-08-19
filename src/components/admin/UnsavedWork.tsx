'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  register: (key: string, dirty: boolean) => void;
  release: (key: string) => void;
  anyUnsaved: boolean;
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
  const { register, release } = useUnsavedWork();

  useEffect(() => {
    register(key, dirty);
  }, [register, key, dirty]);

  useEffect(() => {
    return () => release(key);
  }, [release, key]);
}

export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);
  const anyUnsaved = dirtyKeys.length > 0;

  const register = useCallback((key: string, dirty: boolean) => {
    setDirtyKeys((current) => {
      const has = current.includes(key);
      if (dirty === has) return current;
      return dirty ? [...current, key] : current.filter((existing) => existing !== key);
    });
  }, []);

  const release = useCallback((key: string) => {
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
    if (!anyUnsaved) return Promise.resolve(true);
    setAsking(true);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
  }, [anyUnsaved]);

  const answer = useCallback((leave: boolean) => {
    setAsking(false);
    pending.current?.(leave);
    pending.current = null;
  }, []);

  useBackButtonGuard(anyUnsaved, confirmLeave);

  const value = useMemo(
    () => ({ register, release, anyUnsaved, confirmLeave }),
    [register, release, anyUnsaved, confirmLeave],
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
      armed.current = false;
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
