'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = React.createContext<{ push: (message: string, kind?: ToastKind) => void } | null>(
  null,
);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}

/**
 * Messages are announced as well as shown. A save that silently succeeded and a
 * save that silently failed look identical to someone not watching the corner
 * of the screen, so the live region is not decoration.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);

  const push = React.useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, message, kind }]);
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg',
              item.kind === 'success' && 'border-neutral-200 bg-white text-neutral-900',
              item.kind === 'error' && 'border-red-200 bg-red-50 text-red-900',
              item.kind === 'info' && 'border-neutral-200 bg-neutral-50 text-neutral-800',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
