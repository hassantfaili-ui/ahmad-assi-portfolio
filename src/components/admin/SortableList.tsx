'use client';

import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A list Ahmad can reorder by dragging, or entirely from the keyboard.
 *
 * The keyboard half is not a courtesy. The site this edits made a deliberate
 * point of never capturing the pointer to fake dragging, because doing that is
 * what once stopped its project cards being clickable at all, and the same
 * reasoning applies here: a control that only works by dragging is a control
 * that does not work with a keyboard, a switch device, or a screen reader.
 *
 * So the handle is a real button. Arrow keys move the item, Home and End send
 * it to either end, and a live region says where it landed, because a change
 * that only exists visually is a change somebody cannot see.
 */

export interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (idsInOrder: string[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  itemClassName?: string;
  disabled?: boolean;
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [lifted] = next.splice(from, 1);
  next.splice(to, 0, lifted);
  return next;
}

export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderItem,
  className,
  itemClassName,
  disabled = false,
}: SortableListProps<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listId = useId();
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusId = useRef<string | null>(null);

  /* Focus follows the item, not the position, or a second press moves whatever
     happened to slide into the slot instead. It used to follow inside
     requestAnimationFrame, and under load that frame fires after the user has
     already moved on: focus was yanked back to the old handle and the next
     keypress landed on nothing. That late steal is also exactly what made the
     CI runner red while every laptop run stayed green. A layout effect runs
     synchronously with the render that moved the item, so there is no window
     for the user to get ahead of it. The pending id is a ref, not state,
     because consuming it must not schedule another render: the effect runs
     after every render and does nothing unless a commit just happened. */
  useLayoutEffect(() => {
    if (pendingFocusId.current === null) return;
    handles.current.get(pendingFocusId.current)?.focus();
    pendingFocusId.current = null;
  });

  const commit = useCallback(
    (next: T[], movedId: string, index: number) => {
      onReorder(next.map(getId));
      const moved = next[index];
      setAnnouncement(`${getLabel(moved)} moved to position ${index + 1} of ${next.length}.`);
      pendingFocusId.current = movedId;
    },
    [getId, getLabel, onReorder],
  );

  const shift = useCallback(
    (id: string, to: number) => {
      const from = items.findIndex((item) => getId(item) === id);
      if (from === -1) return;
      const target = Math.max(0, Math.min(items.length - 1, to));
      if (target === from) return;
      commit(move(items, from, target), id, target);
    },
    [items, getId, commit],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, id: string, index: number) => {
      const keys: Record<string, number> = {
        ArrowUp: index - 1,
        ArrowLeft: index - 1,
        ArrowDown: index + 1,
        ArrowRight: index + 1,
        Home: 0,
        End: items.length - 1,
      };
      const target = keys[event.key];
      if (target === undefined) return;
      event.preventDefault();
      shift(id, target);
    },
    [items.length, shift],
  );

  return (
    <>
      <ul className={cn('grid gap-2', className)} id={listId}>
        {items.map((item, index) => {
          const id = getId(item);
          return (
            <li
              key={id}
              draggable={!disabled}
              onDragStart={(event) => {
                setDraggingId(id);
                event.dataTransfer.effectAllowed = 'move';
                // Firefox will not start a drag without data on the transfer.
                event.dataTransfer.setData('text/plain', id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setOverId(null);
              }}
              onDragOver={(event) => {
                if (!draggingId || draggingId === id) return;
                event.preventDefault();
                setOverId(id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggingId) return;
                const from = items.findIndex((candidate) => getId(candidate) === draggingId);
                const to = index;
                setDraggingId(null);
                setOverId(null);
                if (from === -1 || from === to) return;
                commit(move(items, from, to), draggingId, to);
              }}
              className={cn(
                'flex items-start gap-3 rounded-lg border bg-white p-3 transition-colors',
                draggingId === id ? 'border-neutral-900 opacity-60' : 'border-neutral-200',
                overId === id && 'border-neutral-900 bg-neutral-50',
                itemClassName,
              )}
            >
              <button
                type="button"
                ref={(element) => {
                  if (element) handles.current.set(id, element);
                  else handles.current.delete(id);
                }}
                disabled={disabled}
                onKeyDown={(event) => onKeyDown(event, id, index)}
                aria-label={`Reorder ${getLabel(item)}. Position ${index + 1} of ${items.length}. Use the arrow keys to move it.`}
                className="mt-0.5 cursor-grab rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:cursor-not-allowed"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
            </li>
          );
        })}
      </ul>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
