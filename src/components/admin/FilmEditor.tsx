'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';

import { Dropzone } from '@/components/admin/Dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { UploadedFilm, UploadedItem } from '@/hooks/use-uploads';
import { mediaUrl } from '@/lib/media-url';
import { formatBytes } from '@/lib/upload-policy';
import type { FieldErrors } from '@/lib/validation';

import type { EditorMedia } from '@/components/admin/MediaPanel';

/**
 * The walkthrough on a project page.
 *
 * One dropped video becomes three files: a 1440p copy, a 720p copy, and the
 * still that shows before it plays. All of that happens in this browser before
 * anything is sent, which is why there is one progress bar and not three.
 *
 * The YouTube box is the exception, not the normal route. Nothing is requested
 * from Google until a visitor presses play, but it is still somebody else's
 * player on the page, so it is only worth it for a film too large to be worth
 * hosting here.
 *
 * The film itself lives in ProjectForm, along with the fields, the pictures and
 * the drawings, and is saved with them by the one button at the top of the
 * screen. This section used to hold and save its own copy, which meant a
 * caption typed here went nowhere when the obvious button was pressed. Nothing
 * here writes to the server any more.
 */

export interface EditorFilm {
  posterMedia: EditorMedia | null;
  youtubeId: string;
  caption: string;
  sources: { height: number; media: EditorMedia }[];
}

const EMPTY_FILM: EditorFilm = { posterMedia: null, youtubeId: '', caption: '', sources: [] };

function toEditorMedia(media: { id: string; key: string; bytes: number; width: number | null; height: number | null }): EditorMedia {
  return {
    id: media.id,
    key: media.key,
    bytes: media.bytes,
    width: media.width,
    height: media.height,
  };
}

/**
 * The videos of a film in one comparable string.
 *
 * It is what tells a film that exists only in this browser from the one the
 * project page is actually showing. Sorted, so the answer is about which files
 * are in the film and not about the order they happen to be listed in.
 */
function sourceIds(sources: { media: { id: string } }[]): string {
  return sources
    .map((source) => source.media.id)
    .sort()
    .join(',');
}

export interface FilmEditorProps {
  /** What is on screen. null means this project has no walkthrough. */
  film: EditorFilm | null;
  /**
   * What the site is showing, which is not the same thing. A film that has been
   * compressed and uploaded but not saved exists nowhere but this browser, and
   * comparing the two is the only way to know that.
   */
  savedFilm: EditorFilm | null;
  /** The whole map from the save. This section reads film and filmPoster. */
  errors: FieldErrors;
  /**
   * Takes a function of the current film, never a finished object.
   *
   * A compression takes minutes and the caption box stays live throughout, so
   * an upload that handed back an object built from the film as it was when the
   * video was dropped would wipe out whatever was typed while it ran.
   */
  onChange: (change: (current: EditorFilm | null) => EditorFilm | null) => void;
}

export function FilmEditor({ film, savedFilm, errors, onChange }: FilmEditorProps) {
  const { push } = useToast();

  /* Both of these are about what is on screen this second, not about what is
     saved, which is why they are still allowed to live here. */
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const change = useCallback(
    (changes: Partial<EditorFilm>) => {
      /* An edit on a project with no film starts one. A YouTube id typed into
         an empty section is a perfectly ordinary way to add a walkthrough. */
      onChange((current) => ({ ...(current ?? EMPTY_FILM), ...changes }));
    },
    [onChange],
  );

  const takeUpload = useCallback(
    (items: UploadedItem[]) => {
      const uploaded = items.find((item): item is UploadedFilm => item.kind === 'film');
      if (!uploaded) return;

      const sources = uploaded.sources.map((source) => ({
        height: source.height,
        media: toEditorMedia(source.media),
      }));

      setBlocked(false);
      change({ sources, posterMedia: toEditorMedia(uploaded.poster) });
    },
    [change],
  );

  const sources = film?.sources ?? [];

  /* A film that exists nowhere but this browser: compressed here, uploaded, and
     never saved. Taking the old film off would take this with it, and nothing
     on this screen can put it back together. */
  const unsavedReplacement =
    sources.length > 0 &&
    savedFilm !== null &&
    sourceIds(sources) !== sourceIds(savedFilm.sources);

  /* Said where the button is, rather than inside a dialog that promises the
     files stay in the library. That promise holds for the film on the project
     page and not for one that has only been uploaded. */
  const refuseRemoval = useCallback(() => {
    setConfirming(false);
    setBlocked(true);
    push('Save the film you just uploaded first, or it goes with the old one.', 'error');
  }, [push]);

  const remove = useCallback(() => {
    /* Asked again here, not only where the button opened the dialog: a
       compression can finish while the question is on screen. */
    if (unsavedReplacement) {
      refuseRemoval();
      return;
    }

    onChange(() => null);
    setConfirming(false);
    setBlocked(false);
    push('The film comes off this project when you save. The video files stay in your library.');
  }, [onChange, push, refuseRemoval, unsavedReplacement]);

  const onSite = savedFilm !== null;
  const hasVideo = sources.length > 0;
  const dropLabel = hasVideo ? 'Drop a new video here to replace this one' : 'Drop a walkthrough here';

  return (
    <section className="grid gap-4" aria-labelledby="film-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="film-heading" className="text-base font-semibold">
          Walkthrough
        </h2>
        {/* Whether the site is showing a film right now. Whether this screen has
            work outstanding is one question about the whole project, answered
            once, beside the one button that settles it. */}
        {onSite && <Badge variant="secondary">On the page</Badge>}

        {onSite && film !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => (unsavedReplacement ? refuseRemoval() : setConfirming(true))}
          >
            Take the film off
          </Button>
        )}
      </div>

      <Dropzone
        destination="film"
        accept="video"
        filmProfile="walkthrough"
        onUploaded={takeUpload}
        label={dropLabel}
        hint="It is made smaller in this browser before anything is sent, so a long film takes a few minutes and then uploads quickly."
      />

      {blocked && unsavedReplacement && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-medium">Save the new film first</p>
          <p className="mt-1">
            The film you dropped here has not been saved yet, so taking the old one off would take
            this one with it. Its files are in your library, but nothing on this screen can put them
            back together into a film, so you would be dropping the original in again and waiting
            through the whole compression a second time. Press Save everything at the top, then take
            it off. If you do not want the new film at all, reload this page first.
          </p>
        </div>
      )}

      {errors.film && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {errors.film}
        </p>
      )}
      {errors.filmPoster && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {errors.filmPoster}
        </p>
      )}

      {hasVideo ? (
        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-neutral-200 bg-white p-3">
          {film?.posterMedia ? (
            <Image
              src={film.posterMedia.key}
              alt=""
              width={240}
              height={135}
              sizes="240px"
              className="h-24 w-40 shrink-0 rounded bg-neutral-200 object-cover"
            />
          ) : (
            <p className="text-sm text-neutral-500">No still for this film yet.</p>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-800">Two copies, one for each screen</p>
            <ul className="mt-1 grid gap-1 text-sm text-neutral-600">
              {sources.map((source) => (
                <li key={source.height}>
                  {source.height}p, {formatBytes(source.media.bytes)},{' '}
                  <a
                    href={mediaUrl(source.media.key)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-neutral-900"
                  >
                    watch this copy
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-neutral-500">
              A visitor on a phone gets the smaller one, a visitor on a large screen gets the other.
              The still above is what shows before they press play.
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
          {onSite && film === null
            ? 'The film comes off this project when you save.'
            : 'No film on this project. It does not need one.'}
        </p>
      )}

      <Field
        label="Caption"
        htmlFor="film-caption"
        hint="A line under the film. Leave it empty for none."
      >
        <Input
          value={film?.caption ?? ''}
          onChange={(event) => change({ caption: event.target.value })}
          placeholder="A walk from the entrance court through to the roof terrace"
        />
      </Field>

      <Field
        label="YouTube id"
        htmlFor="film-youtube"
        hint="Only for a film too large to keep here. Paste the part of the address after v=, nothing else, for example dQw4w9WgXcQ."
      >
        <Input
          value={film?.youtubeId ?? ''}
          onChange={(event) => change({ youtubeId: event.target.value })}
          placeholder="Usually empty"
        />
      </Field>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Take the film off this project?"
        description="The project page stops showing it once you save. The video files stay in your library, so you can put it back."
        confirmLabel="Take it off"
        onConfirm={remove}
      />
    </section>
  );
}
