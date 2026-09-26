'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { openPdf, type OpenedPdf, type PdfCandidate } from '@/lib/pdf-reader';
import { cn } from '@/lib/utils';

/**
 * Which of a PDF's pictures to use.
 *
 * A drawing set wants its pages: a plan, a section, an elevation, one each.
 * A presentation board wants the renders on it without the board's text and
 * borders. Both are listed, pages first, and Ahmad ticks any mix of the two.
 * Each tick becomes an ordinary JPEG in the upload queue, so from there on it
 * is exactly as if he had dropped the JPEG himself.
 *
 * The PDF itself goes nowhere. What he asked for was its pictures, and a
 * project has nowhere to show a PDF.
 */

export interface PdfPickerProps {
  file: File;
  /** The chosen pictures as files, in page order. */
  onPicked: (files: File[]) => void;
  /** Closed with nothing chosen. */
  onCancel: () => void;
  /** The file could not be read; the message is written for Ahmad. */
  onError: (message: string) => void;
}

type Phase =
  | { stage: 'reading'; done: number; total: number }
  | { stage: 'ready'; pdf: OpenedPdf }
  | { stage: 'exporting'; pdf: OpenedPdf; done: number; total: number };

export function PdfPicker({ file, onPicked, onCancel, onError }: PdfPickerProps) {
  const [phase, setPhase] = useState<Phase>({ stage: 'reading', done: 0, total: 0 });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const opened = useRef<OpenedPdf | null>(null);

  /* The latest callbacks, so the effect below does not re-open the PDF every
     time the parent re-renders with a new function. Dropzone re-renders on
     every progress tick of every upload, and each time hands down a fresh
     closure. */
  const callbacks = useRef({ onError });
  useEffect(() => {
    callbacks.current = { onError };
  });

  /* Keyed by file in Dropzone, so this mounts fresh for each PDF and the
     initial state is the reset. */
  useEffect(() => {
    const controller = new AbortController();

    openPdf(file, {
      signal: controller.signal,
      onProgress: (done, total) => {
        if (!controller.signal.aborted) setPhase({ stage: 'reading', done, total });
      },
    }).then(
      (pdf) => {
        if (controller.signal.aborted) {
          pdf.close();
          return;
        }
        opened.current = pdf;
        setPhase({ stage: 'ready', pdf });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        callbacks.current.onError(
          error instanceof Error
            ? error.message
            : `${file.name} could not be read. Export it again as a PDF and drop it again.`,
        );
      },
    );

    return () => {
      controller.abort();
      opened.current?.close();
      opened.current = null;
    };
  }, [file]);

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmChoice = async () => {
    if (phase.stage !== 'ready') return;
    const { pdf } = phase;
    const picks = pdf.candidates.filter((candidate) => chosen.has(candidate.id));
    if (picks.length === 0) return;

    setPhase({ stage: 'exporting', pdf, done: 0, total: picks.length });
    const files: File[] = [];
    try {
      for (const [index, candidate] of picks.entries()) {
        files.push(await pdf.exportAsFile(candidate));
        setPhase({ stage: 'exporting', pdf, done: index + 1, total: picks.length });
      }
    } catch (error) {
      callbacks.current.onError(
        error instanceof Error
          ? `${file.name}: ${error.message}`
          : `${file.name}: one of the pictures could not be made.`,
      );
      return;
    }
    onPicked(files);
  };

  const pages = phase.stage === 'reading' ? [] : phase.pdf.candidates.filter((c) => c.kind === 'page');
  const photos = phase.stage === 'reading' ? [] : phase.pdf.candidates.filter((c) => c.kind === 'photo');
  const busy = phase.stage !== 'ready';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && phase.stage !== 'exporting') onCancel();
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-4xl grid-rows-[auto_auto_1fr_auto] overflow-hidden"
        onInteractOutside={(event) => {
          /* Reading a forty page set takes a while, and a stray click on the
             page behind should not throw that away. */
          if (busy) event.preventDefault();
        }}
      >
        <DialogTitle className="pr-8 text-lg font-semibold">
          Pick pictures from {file.name}
        </DialogTitle>
        <DialogDescription className="text-sm text-neutral-600">
          {phase.stage === 'reading' &&
            (phase.total
              ? `Looking through page ${phase.done} of ${phase.total}.`
              : 'Opening it.')}
          {phase.stage === 'ready' &&
            (photos.length > 0
              ? 'Every page is listed first, then every photograph found inside. Choose any of them.'
              : 'Every page is listed. No photographs were found inside it, only the pages themselves.')}
          {phase.stage === 'exporting' &&
            `Making picture ${Math.min(phase.done + 1, phase.total)} of ${phase.total}.`}
        </DialogDescription>

        {phase.stage === 'reading' || phase.stage === 'exporting' ? (
          <div className="py-8">
            <Progress
              value={phase.total ? (phase.done / phase.total) * 100 : 0}
              aria-label={phase.stage === 'reading' ? 'Reading the PDF' : 'Making the pictures'}
            />
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto pr-1">
            <TileSection
              heading="Pages"
              candidates={pages}
              chosen={chosen}
              onToggle={toggle}
              empty="None of the pages could be drawn."
            />
            {photos.length > 0 && (
              <TileSection
                heading="Photos inside"
                candidates={photos}
                chosen={chosen}
                onToggle={toggle}
                empty=""
              />
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 pt-4">
          <span className="mr-auto text-sm text-neutral-500">
            {phase.stage === 'ready' &&
              (chosen.size === 0
                ? 'Nothing chosen yet.'
                : `${chosen.size} chosen.`)}
          </span>
          <Button type="button" variant="outline" onClick={onCancel} disabled={phase.stage === 'exporting'}>
            Never mind
          </Button>
          <Button type="button" onClick={() => void confirmChoice()} disabled={busy || chosen.size === 0}>
            {chosen.size <= 1 ? 'Use this picture' : `Use these ${chosen.size} pictures`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TileSection({
  heading,
  candidates,
  chosen,
  onToggle,
  empty,
}: {
  heading: string;
  candidates: PdfCandidate[];
  chosen: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  return (
    <section className="mb-6" aria-label={heading}>
      <h3 className="mb-2 text-sm font-semibold text-neutral-800">
        {heading} <span className="font-normal text-neutral-500">({candidates.length})</span>
      </h3>
      {candidates.length === 0 ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {candidates.map((candidate) => {
            const picked = chosen.has(candidate.id);
            const label =
              candidate.kind === 'page'
                ? `Page ${candidate.index}`
                : `Photo ${candidate.index}, on page ${candidate.pageNumber}`;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onToggle(candidate.id)}
                  className={cn(
                    'group relative block w-full rounded-lg border-2 p-1 text-left transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900',
                    picked ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-200 hover:border-neutral-400',
                  )}
                >
                  <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-neutral-100">
                    {/* A blob URL from this machine, not a bucket key, so next/image
                        and its loader have nothing to offer here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={candidate.thumbnailUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  <span className="mt-1 block truncate px-1 text-xs text-neutral-700">{label}</span>
                  <span className="block truncate px-1 text-[11px] text-neutral-500">
                    {candidate.width} × {candidate.height}
                  </span>
                  {picked && (
                    <span className="absolute right-2 top-2 rounded-full bg-neutral-900 p-1 text-white">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
