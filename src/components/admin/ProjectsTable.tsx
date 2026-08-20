'use client';

import Image from 'next/image';

import { GuardedLink } from '@/components/admin/GuardedLink';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, useTransition, type FormEvent } from 'react';
import { Clapperboard, ImageOff, Plus, Trash2, TriangleAlert } from 'lucide-react';

import { SortableList } from '@/components/admin/SortableList';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { runAction } from '@/lib/action-result';
import type { AdminProjectRow } from '@/lib/admin-queries';
import {
  createProject,
  deleteProject,
  reorderProjects,
  setProjectPublished,
  setProjectTier,
} from '@/lib/mutations';
import { cn } from '@/lib/utils';
import { TIERS } from '@/lib/validation';

/**
 * Every project, in the order they run.
 *
 * The list holds its own copy of the rows and changes it the moment Ahmad acts,
 * before the server has answered. Waiting for a round trip to redraw a row he
 * has already clicked makes a working screen feel broken, so the change lands
 * first: if the write comes back refused, that one change is undone and a
 * message says so. Only that one change, never a snapshot of the whole list,
 * because writes overlap: he flips one row, flips another while the first is
 * still out, and if the first then fails, restoring a snapshot would also erase
 * the second row's change after the server accepted it, leaving him believing a
 * project is hidden while it is live. A silent failure here would mislead him
 * the same way. Every write goes out through runAction for the same reason: a
 * dropped connection then arrives as an ordinary refusal, which puts the row
 * back, instead of as a rejection escaping the transition and taking the whole
 * screen with it.
 *
 * That same worry is why an unpublished row does not merely say so. It is
 * dimmed, its cover is greyed, and it carries a badge, because "published" is
 * the one fact on this screen that is expensive to misread.
 */

export interface ProjectsTableProps {
  projects: AdminProjectRow[];
  /** The lead overflow warning as it stood when the page was loaded, if any. */
  initialNotice: string | null;
}

/** Where a tier puts a project, said the way the home page reads. */
const TIER_LABELS: Record<AdminProjectRow['tier'], string> = {
  lead: 'Lead, a large card up top',
  set: 'Strip, the scrolling row',
  index: 'Archive, a line in the list',
};

/** The same three places, in the middle of a sentence. */
const TIER_PHRASES: Record<AdminProjectRow['tier'], string> = {
  lead: 'the lead cards',
  set: 'the strip',
  index: 'the archive list',
};

const PUT_BACK = 'That change was not saved, so it has been put back the way it was. Please try again.';

function countLabel(count: number, noun: string): string {
  if (count === 0) return `No ${noun}s`;
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function ProjectsTable({ projects, initialNotice }: ProjectsTableProps) {
  const router = useRouter();
  const { push } = useToast();

  const [rows, setRows] = useState(projects);
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [pendingDelete, setPendingDelete] = useState<AdminProjectRow | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

  const [, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [creating, startCreating] = useTransition();

  /* A typed title is work, and until now it was the only editable thing in the
     admin area behind no flag at all: typing one and then clicking Media in the
     bar above threw it away without a word. It needs no save flag of its own,
     because there is no round trip it can drift during. The create either
     answers refused, in which case the box still holds the title, or it answers
     ok, in which case the box is emptied and the screen leaves for the new
     project. So the box itself is the whole truth about whether anything is
     outstanding. */
  useRegisterUnsaved('projects:new', newTitle.trim().length > 0);

  /* Which rows have a write in flight, by id. The transition's own pending flag
     is one flag for the whole list, so wiring it to every row's controls greyed
     out all of them at once whenever any single save was slow, which reads as
     the page having crashed rather than as one row being written. A row only
     disables its own select and its own switch. */
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(() => new Set());

  const markBusy = useCallback((id: string) => {
    setBusyRows((current) => new Set(current).add(id));
  }, []);

  const clearBusy = useCallback((id: string) => {
    setBusyRows((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  /* Which reorder is the current one. Holding the arrow key down sends several
     in a row, and without this an earlier one coming back refused would revert
     the list to a state Ahmad has already moved on from. */
  const latestOrder = useRef(0);

  const handleReorder = useCallback(
    (idsInOrder: string[]) => {
      const previous = rows;
      const byId = new Map(previous.map((row) => [row.id, row]));
      const next = idsInOrder.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });

      setRows(next);

      latestOrder.current += 1;
      const ticket = latestOrder.current;

      startSaving(async () => {
        const result = await runAction(() => reorderProjects(idsInOrder));
        if (ticket !== latestOrder.current) return;
        if (result.ok) return;

        /* Only the ordering is put back. The rows themselves stay as they are
           now, because another write may have landed on one of them while this
           reorder was out, and restoring the old row objects would erase it. */
        setRows((current) => {
          const liveById = new Map(current.map((row) => [row.id, row]));
          const restored = previous.flatMap((row) => {
            const live = liveById.get(row.id);
            if (!live) return [];
            liveById.delete(row.id);
            return [live];
          });
          return [...restored, ...liveById.values()];
        });
        push(
          result.message ??
            'The new order was not saved, so the list has been put back the way it was. Please try again.',
          'error',
        );
      });
    },
    [rows, push],
  );

  const handleTier = useCallback(
    (target: AdminProjectRow, tier: AdminProjectRow['tier']) => {
      if (target.tier === tier) return;

      setRows(rows.map((row) => (row.id === target.id ? { ...row, tier } : row)));
      markBusy(target.id);

      startSaving(async () => {
        const result = await runAction(() => setProjectTier(target.id, tier));
        clearBusy(target.id);

        if (!result.ok) {
          /* Only this row's tier goes back. A snapshot of the whole list would
             also wind back any other row a later write had already changed. */
          setRows((current) =>
            current.map((row) => (row.id === target.id ? { ...row, tier: target.tier } : row)),
          );
          push(result.message ?? PUT_BACK, 'error');
          return;
        }

        /* Kept on the page instead of in a toast. This is the message that says
           a project he has just promoted will not appear where he expects, and
           he needs to be able to read it while he works out which of the other
           three to move down. A notice that vanishes after five seconds is a
           notice he will act on once and then wonder about. */
        setNotice(result.warning ?? null);
        push(`${target.title} now sits in ${TIER_PHRASES[tier]}.`);
      });
    },
    [rows, push, markBusy, clearBusy],
  );

  const handlePublish = useCallback(
    (target: AdminProjectRow) => {
      const published = !target.published;
      setRows(rows.map((row) => (row.id === target.id ? { ...row, published } : row)));
      markBusy(target.id);

      startSaving(async () => {
        const result = await runAction(() => setProjectPublished(target.id, published));
        clearBusy(target.id);

        if (!result.ok) {
          /* Only this row's switch goes back. Published is the one fact on this
             screen that is expensive to misread, so a refusal here must never
             touch a neighbouring row whose own write was accepted. */
          setRows((current) =>
            current.map((row) =>
              row.id === target.id ? { ...row, published: target.published } : row,
            ),
          );
          push(result.message ?? PUT_BACK, 'error');
          return;
        }

        push(
          published
            ? `${target.title} is on the site now.`
            : `${target.title} is hidden from the site now.`,
        );
      });
    },
    [rows, push, markBusy, clearBusy],
  );

  const handleDelete = useCallback(() => {
    const target = pendingDelete;
    if (!target) return;

    startDeleting(async () => {
      const result = await runAction(() => deleteProject(target.id));
      if (!result.ok) {
        push(result.message ?? 'That project was not deleted. Please try again.', 'error');
        return;
      }

      setRows((current) => current.filter((row) => row.id !== target.id));
      setPendingDelete(null);
      push(`${target.title} is deleted. The files it used are still in your media library.`);
    });
  }, [pendingDelete, push]);

  const handleCreate = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmed = newTitle.trim();
      if (!trimmed) {
        setTitleError('Give the project a title to start with. You can change it later.');
        return;
      }
      setTitleError(undefined);

      startCreating(async () => {
        const result = await runAction(() => createProject(trimmed));
        if (!result.ok || !result.data) {
          // The box keeps the title, so it is still outstanding and still
          // registered. Emptying it here would lose the very thing the refusal
          // is asking him to try again with.
          setTitleError(
            result.errors?.title ??
              result.message ??
              'That project could not be added just now. Please try again.',
          );
          return;
        }

        // The title is written now, so it is no longer unsaved work. Cleared
        // before the move so the guard does not stop the screen from going to
        // the project it has just made.
        setNewTitle('');
        router.push(`/admin/projects/${result.data.id}`);
      });
    },
    [newTitle, router],
  );

  const total = rows.length;
  const publishedCount = rows.filter((row) => row.published).length;
  const hiddenCount = total - publishedCount;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-neutral-600">
          {total === 0
            ? 'Nothing here yet.'
            : `${total} ${total === 1 ? 'project' : 'projects'}, ${publishedCount} published${
                hiddenCount > 0 ? `, ${hiddenCount} not published` : ''
              }.`}
        </p>
      </header>

      {/* The live region stays in the page so a warning appearing inside it is
          announced. Rendering the whole region only when there is something to
          say means a screen reader often never hears it at all. */}
      <div aria-live="polite">
        {notice ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{notice}</p>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleCreate}
        className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:max-w-xl"
      >
        <Field
          label="Add a project"
          htmlFor="new-project-title"
          error={titleError}
          hint="A new project starts unpublished, so nothing appears on the site until you publish it. Everything else, the title included, can be changed afterwards."
        >
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Lincoln Beach Center"
            autoComplete="off"
            disabled={creating}
          />
        </Field>
        <div>
          <Button type="submit" disabled={creating}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? 'Adding' : 'Add project'}
          </Button>
        </div>
      </form>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <h2 className="text-base font-semibold text-neutral-900">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Add your first project above. Give it a title to start, then you can drop in your
            renders, arrange them, write the description, and publish it when it is ready.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-xs text-neutral-500">
            Drag a project by its handle to change the running order, or focus the handle and use
            the arrow keys. Either way the new order is saved straight away: on the drop with the
            mouse, and on every arrow press with the keyboard.
          </p>

          <SortableList
            items={rows}
            getId={(row) => row.id}
            getLabel={(row) => row.title}
            onReorder={handleReorder}
            itemClassName="items-center"
            renderItem={(row) => (
              <div className="grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
                <div
                  className={cn(
                    'relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-neutral-100',
                    row.leadImage ? 'border-neutral-200' : 'border-dashed border-neutral-300',
                    !row.published && 'opacity-50 grayscale',
                  )}
                >
                  {row.leadImage ? (
                    // No alt text: the title sits beside it and names the same
                    // thing, so describing it again is noise in a screen reader.
                    <Image
                      src={row.leadImage.key}
                      alt=""
                      width={row.leadImage.width ?? 800}
                      height={row.leadImage.height ?? 600}
                      sizes="80px"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-center text-[10px] leading-tight text-neutral-500">
                      <ImageOff className="h-4 w-4" aria-hidden="true" />
                      No cover
                    </span>
                  )}
                </div>

                <div className={cn('min-w-0', !row.published && 'opacity-60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Guarded, because the typed new project title above is
                        registered unsaved work and a row link is a client side
                        navigation that beforeunload cannot see. This lost the
                        title every time, with no timing needed at all. */}
                    <GuardedLink
                      href={`/admin/projects/${row.id}`}
                      className="truncate font-medium text-neutral-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    >
                      {row.title}
                    </GuardedLink>
                    {row.published ? null : <Badge variant="warning">Not published</Badge>}
                  </div>

                  <p className="mt-1 truncate text-xs text-neutral-500">
                    {row.year}, {row.credit.trim() || 'no credit written yet'}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <span>{countLabel(row.imageCount, 'image')}</span>
                    <span>{countLabel(row.drawingCount, 'drawing')}</span>
                    <span className="inline-flex items-center gap-1">
                      {row.hasFilm ? (
                        <>
                          <Clapperboard className="h-3 w-3" aria-hidden="true" />
                          Film
                        </>
                      ) : (
                        'No film'
                      )}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Select
                    aria-label={`Where ${row.title} sits on the home page`}
                    value={row.tier}
                    disabled={busyRows.has(row.id)}
                    onChange={(event) =>
                      handleTier(row, event.target.value as AdminProjectRow['tier'])
                    }
                    className="h-8 w-auto text-xs"
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {TIER_LABELS[tier]}
                      </option>
                    ))}
                  </Select>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.published}
                    disabled={busyRows.has(row.id)}
                    onClick={() => handlePublish(row)}
                    className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {/* The project name leads the accessible name, so a screen
                        reader says which project the switch belongs to before
                        it says whether it is on. */}
                    <span className="sr-only">{row.title}: </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                        row.published ? 'bg-neutral-900' : 'bg-neutral-300',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                          row.published ? 'left-[1.125rem]' : 'left-0.5',
                        )}
                      />
                    </span>
                    <span className="min-w-[6.5rem] text-left">
                      {row.published ? 'On the site' : 'Not published'}
                    </span>
                  </button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPendingDelete(row)}
                    aria-label={`Delete ${row.title}`}
                    className="text-neutral-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete ? `Delete ${pendingDelete.title}?` : 'Delete this project?'}
        confirmLabel={pendingDelete ? `Delete ${pendingDelete.title}` : 'Delete'}
        busy={deleting}
        onConfirm={handleDelete}
        description={
          <>
            <p>
              This takes the project off the site and out of this list, along with the way you
              arranged its images, its drawings and its film.
            </p>
            <p className="mt-2">
              Every photograph, video and PDF it used stays in your media library. Nothing you
              uploaded is deleted, and you can use any of it on another project.
            </p>
            <p className="mt-2">This cannot be undone.</p>
          </>
        }
      />
    </div>
  );
}
