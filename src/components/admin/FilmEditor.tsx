'use client';

import Image from 'next/image';
import { useCallback, useState, useTransition } from 'react';

import { Dropzone } from '@/components/admin/Dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import type { UploadedFilm, UploadedItem } from '@/hooks/use-uploads';
import { runAction } from '@/lib/action-result';
import { mediaUrl } from '@/lib/media-url';
import { deleteFilm, saveFilm } from '@/lib/mutations';
import { formatBytes } from '@/lib/upload-policy';
import { hasErrors, validateFilm, type FieldErrors } from '@/lib/validation';

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

export interface FilmEditorProps {
  projectId: string;
  initialFilm: EditorFilm | null;
}

export function FilmEditor({ projectId, initialFilm }: FilmEditorProps) {
  const { push } = useToast();

  const [film, setFilm] = useState<EditorFilm>(initialFilm ?? EMPTY_FILM);
  const [onSite, setOnSite] = useState(initialFilm !== null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [unsaved, setUnsaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, startSave] = useTransition();
  const [removing, startRemoval] = useTransition();

  /* The film's own flag, not the details form's. A caption typed here and a
     video dropped here are lost by the same reload, and neither is covered by
     the save button at the top of the screen. */
  useRegisterUnsaved('project:film', unsaved);

  const change = useCallback((changes: Partial<EditorFilm>) => {
    setFilm((current) => ({ ...current, ...changes }));
    setUnsaved(true);
  }, []);

  const takeUpload = useCallback(
    (items: UploadedItem[]) => {
      const uploaded = items.find((item): item is UploadedFilm => item.kind === 'film');
      if (!uploaded) return;

      change({
        sources: uploaded.sources.map((source) => ({
          height: source.height,
          media: toEditorMedia(source.media),
        })),
        posterMedia: toEditorMedia(uploaded.poster),
      });
    },
    [change],
  );

  const save = useCallback(() => {
    const found = validateFilm({
      sourceMediaIds: film.sources.map((source) => source.media.id),
      youtubeId: film.youtubeId,
      posterMediaId: film.posterMedia?.id ?? null,
    });

    if (hasErrors(found)) {
      setErrors(found);
      push('The film is not ready to save yet. The reason is below.', 'error');
      return;
    }

    startSave(async () => {
      const result = await runAction(() =>
        saveFilm(projectId, {
          posterMediaId: film.posterMedia?.id ?? null,
          youtubeId: film.youtubeId,
          caption: film.caption,
          sources: film.sources.map((source) => ({
            mediaId: source.media.id,
            height: source.height,
          })),
        }),
      );

      if (!result.ok) {
        setErrors(result.errors ?? {});
        push(result.message ?? 'Nothing was saved. The reason is below.', 'error');
        return;
      }

      setErrors({});
      setUnsaved(false);
      setOnSite(true);
      push('Film saved.');
    });
  }, [film, projectId, push]);

  const remove = useCallback(() => {
    startRemoval(async () => {
      const result = await runAction(() => deleteFilm(projectId));

      if (!result.ok) {
        push(result.message ?? 'The film could not be taken off. Try again.', 'error');
        return;
      }

      setFilm(EMPTY_FILM);
      setErrors({});
      setUnsaved(false);
      setOnSite(false);
      setConfirming(false);
      push('Film taken off this project. The video files stay in your library.');
    });
  }, [projectId, push]);

  const hasVideo = film.sources.length > 0;
  const dropLabel = hasVideo ? 'Drop a new video here to replace this one' : 'Drop a walkthrough here';

  return (
    <section className="grid gap-4" aria-labelledby="film-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="film-heading" className="text-base font-semibold">
          Walkthrough
        </h2>
        {unsaved && <Badge variant="warning">Not saved yet</Badge>}
        {onSite && !unsaved && <Badge variant="secondary">On the page</Badge>}

        <div className="ml-auto flex gap-2">
          {onSite && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={removing}
            >
              Take the film off
            </Button>
          )}
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving' : 'Save the film'}
          </Button>
        </div>
      </div>

      <Dropzone
        destination="film"
        accept="video"
        filmProfile="walkthrough"
        onUploaded={takeUpload}
        label={dropLabel}
        hint="It is made smaller in this browser before anything is sent, so a long film takes a few minutes and then uploads quickly."
      />

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
          {film.posterMedia ? (
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
              {film.sources.map((source) => (
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
          No film on this project. It does not need one.
        </p>
      )}

      <Field
        label="Caption"
        htmlFor="film-caption"
        hint="A line under the film. Leave it empty for none."
      >
        <Input
          value={film.caption}
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
          value={film.youtubeId}
          onChange={(event) => change({ youtubeId: event.target.value })}
          placeholder="Usually empty"
        />
      </Field>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Take the film off this project?"
        description="The project page stops showing it straight away. The video files stay in your library, so you can put it back."
        confirmLabel="Take it off"
        onConfirm={remove}
        busy={removing}
      />
    </section>
  );
}
