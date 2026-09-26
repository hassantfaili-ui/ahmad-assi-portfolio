'use client';

import { useCallback, useId, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PdfPicker } from '@/components/admin/PdfPicker';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { useUploads, type UploadedItem, type UploadRow } from '@/hooks/use-uploads';
import { canTranscode } from '@/lib/transcode';
import { formatBytes, validateUpload } from '@/lib/upload-policy';
import type { UploadDestination } from '@/lib/upload-client';
import { cn } from '@/lib/utils';

/**
 * Drop files here.
 *
 * The whole rebuild exists so this works, so a few things are deliberate.
 *
 * The drop target is the panel, not a strip inside it. A small target is the
 * difference between dropping a folder and missing.
 *
 * Pasting works as well as dropping, because pasting is how one render gets out
 * of an email and into a page.
 *
 * A file that fails does not take the batch with it. Ahmad drops thirty renders
 * and one is a .heic; being told which one while the other twenty nine upload
 * is a better answer than being told to start again.
 *
 * A PDF dropped where pictures go is not uploaded. It is opened here, in the
 * browser, and its pages and the photographs inside it are offered as
 * pictures to choose from; the chosen ones join the queue as JPEGs. See
 * PdfPicker. Where a PDF is wanted as a document, the CV say, accept is
 * 'document' and it uploads whole as before.
 */

/**
 * Whether this browser can encode video, asked in a way that survives
 * hydration.
 *
 * canTranscode reads window, so calling it during render makes the server say
 * one thing and the browser another: the server has no window, so it renders
 * the amber cannot compress notice, and the browser then throws that HTML away.
 * Ahmad saw the warning flash on every load of a screen where it did not apply.
 *
 * useSyncExternalStore is the answer rather than an effect, because it gives a
 * server snapshot separately from the client one, which is exactly the shape of
 * the problem. Nothing subscribes: a browser does not gain a video encoder
 * while the page is open.
 */
const NOTHING_TO_SUBSCRIBE_TO = () => () => {};
const IN_THE_BROWSER = () => canTranscode();
const ON_THE_SERVER = () => true;

export interface DropzoneProps {
  destination: UploadDestination;
  slug?: string;
  /** 'image-or-pdf' takes images as they are and opens a PDF to pick pictures from. */
  accept: 'image' | 'image-or-pdf' | 'video' | 'document' | 'any';
  filmProfile?: 'hero' | 'walkthrough';
  onUploaded: (items: UploadedItem[]) => void;
  label?: string;
  hint?: string;
}

const IMAGE_TYPES =
  'image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff,.jpg,.jpeg,.png,.webp,.avif,.gif,.tif,.tiff';

const ACCEPT_ATTRIBUTE: Record<DropzoneProps['accept'], string> = {
  image: IMAGE_TYPES,
  'image-or-pdf': `${IMAGE_TYPES},application/pdf,.pdf`,
  video: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm',
  document: 'application/pdf,.pdf',
  any: '',
};

export function Dropzone({
  destination,
  slug,
  accept,
  filmProfile = 'walkthrough',
  onUploaded,
  label,
  hint,
}: DropzoneProps) {
  const { rows, add, noteFailure, retry, cancel, dismiss, clearFinished, busy } = useUploads({
    destination,
    slug,
    filmProfile,
    onUploaded,
  });

  /* PDFs waiting for their pictures to be chosen, one dialog at a time in the
     order they were dropped. Only when this dropzone takes pictures: a PDF
     dropped where a document goes is the document. */
  const [pendingPdfs, setPendingPdfs] = useState<File[]>([]);
  const picksPictures = accept === 'image-or-pdf';

  /* An upload in flight is unsaved work, and the most expensive kind here.
     A four minute browser transcode of a full quality export is not a change to
     a form, so no form flag would ever have covered it: closing the tab at
     minute four destroyed the whole encode with nothing asking. Registered
     under this instance's own id so two dropzones on one screen do not release
     each other's claim. */
  const instanceId = useId();
  useRegisterUnsaved(`upload:${instanceId}`, busy);

  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (list: FileList | null) => {
      const files = Array.from(list ?? []);
      if (!picksPictures) {
        if (files.length) void add(files);
        return;
      }
      const pdfs: File[] = [];
      const rest: File[] = [];
      for (const file of files) {
        const verdict = validateUpload({ name: file.name, size: file.size, type: file.type });
        if (verdict.ok && verdict.kind === 'document') pdfs.push(file);
        else rest.push(file);
      }
      if (rest.length) void add(rest);
      if (pdfs.length) setPendingPdfs((current) => [...current, ...pdfs]);
    },
    [add, picksPictures],
  );

  const finishPdf = useCallback(() => setPendingPdfs((current) => current.slice(1)), []);

  const encoderAvailable = useSyncExternalStore(
    NOTHING_TO_SUBSCRIBE_TO,
    IN_THE_BROWSER,
    ON_THE_SERVER,
  );
  const videoUnsupported = (accept === 'video' || accept === 'any') && !encoderAvailable;

  /* Busy while a PDF is open too. Its pictures are not in the queue yet, but
     closing the tab now throws away a choice half made. */
  useRegisterUnsaved(`pdf:${instanceId}`, pendingPdfs.length > 0);

  return (
    <div className="grid gap-3">
      {pendingPdfs.length > 0 && (
        <PdfPicker
          key={`${pendingPdfs[0].name}-${pendingPdfs[0].size}-${pendingPdfs[0].lastModified}`}
          file={pendingPdfs[0]}
          onPicked={(files) => {
            finishPdf();
            void add(files);
          }}
          onCancel={finishPdf}
          onError={(message) => {
            noteFailure(pendingPdfs[0], message);
            finishPdf();
          }}
        />
      )}
      <div
        /* Focusable, because paste only fires on the element holding focus.
           Clicking the panel used to leave focus on the body, so Cmd+V went
           nowhere and pasting looked broken; now a click or a Tab puts focus
           here and the paste lands. Not a document listener, since two of these
           mount on one screen and both would take the same paste. */
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
        onPaste={(event) => take(event.clipboardData?.files ?? null)}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900',
          over ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-300 bg-white',
        )}
      >
        <Upload className="mx-auto h-6 w-6 text-neutral-400" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-neutral-800">
          {label ?? 'Drop files here'}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {hint ?? 'Or paste them, or choose them below. Drop as many at once as you like.'}
        </p>

        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE[accept] || undefined}
          className="sr-only"
          onChange={(event) => {
            take(event.target.files);
            // Cleared so choosing the same file twice in a row still fires.
            event.target.value = '';
          }}
        />

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => input.current?.click()}
        >
          Choose files
        </Button>

        {videoUnsupported && (
          <p className="mx-auto mt-4 max-w-sm rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {/* Said before he tries, not after. Uploading the original instead
                would be invisible here and paid for by every visitor on a
                phone. */}
            This browser cannot compress video, so films cannot be uploaded from
            it. Use Chrome, Edge, or Safari 16.4 or newer for that. Images are
            fine here.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid gap-2">
          {rows.map((row) => (
            <UploadProgressRow
              key={row.id}
              row={row}
              onRetry={() => void retry(row.id)}
              onCancel={() => cancel(row.id)}
              onDismiss={() => dismiss(row.id)}
            />
          ))}

          {!busy && rows.some((row) => row.stage === 'done') && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFinished}>
              Clear the finished ones
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadProgressRow({
  row,
  onRetry,
  onCancel,
  onDismiss,
}: {
  row: UploadRow;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const failed = row.stage === 'failed';
  const done = row.stage === 'done';

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        failed ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-white',
      )}
    >
      <div className="flex items-center gap-2">
        {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />}
        {failed && <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}

        <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{row.name}</span>
        <span className="shrink-0 text-xs text-neutral-500">{formatBytes(row.bytes)}</span>

        {failed && row.canRetry !== false && (
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
            Try again
          </Button>
        )}

        {!done && !failed && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}

        {(done || failed) && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Remove ${row.name} from the list`}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {!done && !failed && (
        <div className="mt-2 flex items-center gap-3">
          <Progress
            value={row.progress * 100}
            aria-label={`${row.label}: ${Math.round(row.progress * 100)} percent`}
          />
          <span className="w-40 shrink-0 text-right text-xs text-neutral-500">{row.label}</span>
        </div>
      )}

      {failed && row.error && (
        <p role="alert" className="mt-1 text-xs text-red-800">
          {row.error}
        </p>
      )}
    </div>
  );
}
