'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { FileText, Film, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import type { MediaWithUsage } from '@/lib/admin-queries';
import { mediaUrl } from '@/lib/media-url';
import { formatBytes } from '@/lib/upload-policy';

/**
 * Everything in the bucket, newest first.
 *
 * The one rule this screen is built around: a file that something still points
 * at gets no delete button at all. The API refuses that delete anyway, with 409
 * and the list of what is using it, but a button that is refused after the click
 * is a button that lies. So the usage comes down with the list and decides
 * whether the button is drawn. The 409 is still handled, because a page left
 * open while a project is edited in another tab is a page telling yesterday's
 * truth, and that case should read as an explanation rather than a failure.
 *
 * Filtering and searching stay in the browser over the list already loaded. The
 * library is tens of files, not thousands, so a round trip per keystroke would
 * buy nothing and cost the instant response.
 */

/** The four things worth narrowing to. Posters sit with video, see matchesKind. */
type KindFilter = 'all' | 'image' | 'video' | 'document';

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video and film stills' },
  { value: 'document', label: 'PDFs' },
];

/**
 * How each kind is named to Ahmad. A poster is never a file he chose: it is a
 * frame pulled out of a walkthrough during upload, so it is called what it is.
 */
const KIND_LABELS: Record<MediaWithUsage['kind'], string> = {
  image: 'Image',
  video: 'Video',
  poster: 'Film still',
  document: 'PDF',
};

const OPEN_LABELS: Record<MediaWithUsage['kind'], string> = {
  image: 'Open the full size',
  video: 'Play the video',
  poster: 'Open the full size',
  document: 'Open the PDF',
};

/**
 * A film still belongs with its film rather than with the renders. Filtering to
 * images is how Ahmad looks for something he uploaded, and posters are not that.
 */
function matchesKind(kind: MediaWithUsage['kind'], filter: KindFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'video') return kind === 'video' || kind === 'poster';
  return kind === filter;
}

/** 1:04, never 64 seconds and never 64.213. */
function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function countOfFiles(n: number): string {
  return n === 1 ? '1 file' : `${n} files`;
}

/** What the API sends back with a 409, and everything in it is optional. */
interface DeleteConflict {
  error?: string;
  usedBy?: string[];
}

function MediaCard({
  item,
  onDelete,
}: {
  item: MediaWithUsage;
  onDelete: (item: MediaWithUsage) => void;
}) {
  const showsPicture = item.kind === 'image' || item.kind === 'poster';
  const unused = item.usedBy.length === 0;

  const details = [
    formatBytes(item.bytes),
    item.width && item.height ? `${item.width} × ${item.height}` : null,
    item.durationSeconds ? formatDuration(item.durationSeconds) : null,
  ].filter((part): part is string => part !== null);

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        {showsPicture ? (
          <Image
            src={item.key}
            /* The file name below is the label. Repeating it here would have a
               screen reader read every card twice. */
            alt=""
            width={item.width ?? 800}
            height={item.height ?? 600}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
            className="h-full w-full object-cover"
          />
        ) : (
          /* A video or a PDF has nothing to show as a picture, so it gets a card
             that says what it is. An <img> pointed at an MP4 would render as a
             broken image, which reads as something having gone wrong. */
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-500">
            {item.kind === 'video' ? (
              <Film className="h-8 w-8" aria-hidden="true" />
            ) : (
              <FileText className="h-8 w-8" aria-hidden="true" />
            )}
            <span className="text-xs font-medium">{KIND_LABELS[item.kind]}</span>
          </div>
        )}

        <span className="absolute left-2 top-2">
          <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="break-words text-sm font-medium text-neutral-900">{item.originalName}</p>
        <p className="text-xs text-neutral-500">{details.join(' · ')}</p>

        {unused ? (
          <p className="text-xs text-neutral-500">Not used anywhere on the site.</p>
        ) : (
          <div className="text-xs text-neutral-600">
            <p className="font-medium text-neutral-800">In use by</p>
            <ul className="mt-1 grid gap-0.5">
              {item.usedBy.map((use) => (
                <li key={use}>{use}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
          <Button asChild variant="outline" size="sm">
            <a href={mediaUrl(item.key)} target="_blank" rel="noreferrer">
              {OPEN_LABELS[item.kind]}
            </a>
          </Button>

          {unused ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-700 hover:bg-red-50"
              aria-label={`Delete ${item.originalName}`}
              onClick={() => onDelete(item)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function MediaLibrary({ media }: { media: MediaWithUsage[] }) {
  const router = useRouter();
  const { push } = useToast();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [pending, setPending] = useState<MediaWithUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ name: string; usedBy: string[] } | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter(
      (item) =>
        matchesKind(item.kind, kind) &&
        (needle === '' || item.originalName.toLowerCase().includes(needle)),
    );
  }, [media, kind, query]);

  const filtering = query.trim() !== '' || kind !== 'all';

  const requestDelete = useCallback((item: MediaWithUsage) => {
    setPending(item);
  }, []);

  const closeConfirm = useCallback((open: boolean) => {
    if (!open) setPending(null);
  }, []);

  const clearFilters = useCallback(() => {
    setQuery('');
    setKind('all');
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pending) return;
    setBusy(true);

    try {
      const response = await fetch(`/api/media/${pending.id}`, { method: 'DELETE' });

      if (response.status === 409) {
        // The page was showing this file as unused, and by the time the click
        // landed it was not. Say what claimed it rather than that a check failed.
        const body: DeleteConflict = await response.json().catch(() => ({}));
        setBlocked({ name: pending.originalName, usedBy: body.usedBy ?? [] });
        setPending(null);
        router.refresh();
        return;
      }

      if (response.status === 404) {
        push(`${pending.originalName} was already gone.`, 'info');
        setPending(null);
        router.refresh();
        return;
      }

      if (!response.ok) {
        push(`${pending.originalName} could not be deleted. Try again in a moment.`, 'error');
        return;
      }

      push(`${pending.originalName} has been deleted.`);
      setPending(null);
      router.refresh();
    } catch {
      push('Nothing was deleted. Check your connection and try again.', 'error');
    } finally {
      setBusy(false);
    }
  }, [pending, push, router]);

  const closeBlocked = useCallback((open: boolean) => {
    if (!open) setBlocked(null);
  }, []);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Search by file name" htmlFor="media-search" className="w-full sm:w-72">
          <Input
            type="search"
            value={query}
            placeholder="Part of a file name"
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>

        <Field label="Show" htmlFor="media-kind" className="w-full sm:w-56">
          <Select value={kind} onChange={(event) => setKind(event.target.value as KindFilter)}>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {filtering ? (
          <p className="pb-2 text-sm text-neutral-500">
            Showing {countOfFiles(visible.length)} of {media.length}.
          </p>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-neutral-800">Nothing matches that.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Try a shorter piece of the file name, or show everything again.
          </p>
          <Button variant="outline" className="mt-4" onClick={clearFilters}>
            Show everything
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <MediaCard key={item.id} item={item} onDelete={requestDelete} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={closeConfirm}
        title={pending ? `Delete ${pending.originalName}?` : 'Delete this file?'}
        description={
          <>
            <p>
              The file is removed from storage for good. It cannot be recovered, and there is no
              undo. You would have to upload it again.
            </p>
            <p className="mt-2">Nothing on the site uses it, so no page will change.</p>
          </>
        }
        confirmLabel="Delete it for good"
        busy={busy}
        onConfirm={confirmDelete}
      />

      <Dialog open={blocked !== null} onOpenChange={closeBlocked}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">That file is still being used</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-neutral-600">
              {blocked && blocked.usedBy.length > 0 ? (
                <>
                  <p>{blocked.name} is used by:</p>
                  <ul className="mt-2 grid list-disc gap-0.5 pl-5">
                    {blocked.usedBy.map((use) => (
                      <li key={use}>{use}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  {blocked?.name} has been added to something since this page loaded, so it cannot
                  be deleted yet.
                </p>
              )}
              <p className="mt-3">
                Take it off there first, then come back here and delete it. This page has been
                brought up to date.
              </p>
            </div>
          </DialogDescription>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setBlocked(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MediaLibrary;
