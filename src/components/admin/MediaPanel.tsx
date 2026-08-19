'use client';

import Image from 'next/image';
import { useCallback } from 'react';
import { Check } from 'lucide-react';

import { Dropzone } from '@/components/admin/Dropzone';
import { GroupEditor } from '@/components/admin/GroupEditor';
import { SortableList } from '@/components/admin/SortableList';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { UploadedImage, UploadedItem } from '@/hooks/use-uploads';
import type { FieldErrors } from '@/lib/validation';

/**
 * Everything on the right hand side: the pictures, how they are grouped, the
 * cover, and the drawings.
 *
 * This holds none of it. The arrangement, the drawings and the cover all live
 * in ProjectForm, which is the only thing on this screen that saves, and there
 * is only one of those. This used to own the groups and the drawings and save
 * each of them with its own button, and the result was that a caption typed
 * here was not covered by the obvious button at the top of the screen. The work
 * was never sent and nothing said so.
 *
 * Uploads still start here, because this is where the drop targets are, and
 * they append through the same onChange as every other edit. That contract
 * takes a function of the current value and never a finished array, so a batch
 * that lands after minutes of compression cannot rebase over the descriptions
 * typed while it ran.
 */

export interface EditorMedia {
  id: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export interface EditorImage {
  /** Local to this screen. A picture only gets a database id once it is saved. */
  id: string;
  mediaId: string;
  alt: string;
  media: EditorMedia;
}

export interface EditorGroup {
  id: string;
  layout: 'pair' | 'full' | 'triptych';
  caption: string;
  images: EditorImage[];
}

export interface EditorDrawing {
  id: string;
  mediaId: string;
  alt: string;
  drawingType: string;
  media: EditorMedia;
}

let nextLocalId = 0;

/** An id for a row that has never been saved, so lists have something to key on. */
function localId(): string {
  nextLocalId += 1;
  return `new-${nextLocalId}`;
}

/** Uploaded files, as rows this screen can hold. Films are handled elsewhere. */
function imagesFromUpload(items: UploadedItem[]): EditorImage[] {
  return items
    .filter((item): item is UploadedImage => item.kind === 'image')
    .map((item) => ({
      id: localId(),
      mediaId: item.media.id,
      alt: '',
      media: {
        id: item.media.id,
        key: item.media.key,
        bytes: item.media.bytes,
        width: item.media.width,
        height: item.media.height,
      },
    }));
}

/**
 * Every picture on the project, once each, as candidates for the cover.
 *
 * The current cover is included even when it sits in no group, because a cover
 * that quietly disappeared from the choices the moment it was taken out of the
 * arrangement would look like the site had lost it.
 */
function coverChoices(groups: EditorGroup[], current: EditorMedia | null): EditorMedia[] {
  const seen = new Set<string>();
  const choices: EditorMedia[] = [];

  if (current) {
    seen.add(current.id);
    choices.push(current);
  }

  for (const group of groups) {
    for (const image of group.images) {
      if (seen.has(image.media.id)) continue;
      seen.add(image.media.id);
      choices.push(image.media);
    }
  }

  return choices;
}

function countImages(groups: EditorGroup[]): number {
  return groups.reduce((total, group) => total + group.images.length, 0);
}

export interface MediaPanelProps {
  /** Where uploaded files are filed in the bucket. */
  slug: string;
  groups: EditorGroup[];
  drawings: EditorDrawing[];
  /**
   * The whole map from the save, keyed the way the server keys it. This panel
   * reads groups.<group>.images.<image>.alt, drawings.<index>.alt and
   * leadImageAlt out of it.
   *
   * Handed down whole rather than sliced and renumbered on the way in, because
   * a renumbering step is one more place for a message to land on the wrong
   * picture or on nothing at all.
   */
  errors: FieldErrors;
  /** Takes a function of the current groups, never a finished array. */
  onGroupsChange: (change: (current: EditorGroup[]) => EditorGroup[]) => void;
  /** Takes a function of the current drawings, never a finished array. */
  onDrawingsChange: (change: (current: EditorDrawing[]) => EditorDrawing[]) => void;
  leadImageId: string | null;
  leadImageAlt: string;
  leadImage: EditorMedia | null;
  onLeadImageChange: (mediaId: string | null) => void;
  onLeadImageAltChange: (alt: string) => void;
}

export function MediaPanel({
  slug,
  groups,
  drawings,
  errors,
  onGroupsChange,
  onDrawingsChange,
  leadImageId,
  leadImageAlt,
  leadImage,
  onLeadImageChange,
  onLeadImageAltChange,
}: MediaPanelProps) {
  const startGroupFromUpload = useCallback(
    (items: UploadedItem[]) => {
      const images = imagesFromUpload(items);
      if (images.length === 0) return;
      onGroupsChange((current) => [
        ...current,
        { id: localId(), layout: 'pair', caption: '', images },
      ]);
    },
    [onGroupsChange],
  );

  const addToGroup = useCallback(
    (groupId: string, items: UploadedItem[]) => {
      const images = imagesFromUpload(items);
      if (images.length === 0) return;

      onGroupsChange((current) => {
        /* The group can be gone. The id was captured when the files were
           dropped and a batch of renders runs for minutes, so Ahmad may well
           have removed that group in the meantime. This used to map over the
           list, match nothing, and discard the whole batch in silence while
           every progress row still read Done.
           They go into a new group instead, which is recoverable, rather than
           nowhere, which is not. */
        if (!current.some((group) => group.id === groupId)) {
          return [
            ...current,
            {
              id: `group-${Date.now()}`,
              layout: 'pair' as const,
              caption: '',
              images,
            },
          ];
        }

        return current.map((group) =>
          group.id === groupId ? { ...group, images: [...group.images, ...images] } : group,
        );
      });
    },
    [onGroupsChange],
  );

  const addEmptyGroup = useCallback(() => {
    onGroupsChange((current) => [
      ...current,
      { id: localId(), layout: 'pair', caption: '', images: [] },
    ]);
  }, [onGroupsChange]);

  const addDrawings = useCallback(
    (items: UploadedItem[]) => {
      const added = imagesFromUpload(items).map((image) => ({
        id: image.id,
        mediaId: image.mediaId,
        alt: '',
        drawingType: '',
        media: image.media,
      }));
      if (added.length === 0) return;
      onDrawingsChange((current) => [...current, ...added]);
    },
    [onDrawingsChange],
  );

  const updateDrawing = useCallback(
    (id: string, changes: Partial<EditorDrawing>) => {
      onDrawingsChange((current) =>
        current.map((drawing) => (drawing.id === id ? { ...drawing, ...changes } : drawing)),
      );
    },
    [onDrawingsChange],
  );

  const removeDrawing = useCallback(
    (id: string) => {
      onDrawingsChange((current) => current.filter((drawing) => drawing.id !== id));
    },
    [onDrawingsChange],
  );

  const reorderDrawings = useCallback(
    (idsInOrder: string[]) => {
      onDrawingsChange((current) =>
        idsInOrder
          .map((id) => current.find((drawing) => drawing.id === id))
          .filter((drawing): drawing is EditorDrawing => Boolean(drawing)),
      );
    },
    [onDrawingsChange],
  );

  const choices = coverChoices(groups, leadImage);
  const imageCount = countImages(groups);

  return (
    <div className="grid gap-8">
      <section className="grid gap-4" aria-labelledby="pictures-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="pictures-heading" className="text-base font-semibold">
            Pictures
          </h2>
          <span className="text-sm text-neutral-500">
            {imageCount} in {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </span>
        </div>

        <Dropzone
          destination="project"
          slug={slug}
          accept="image"
          onUploaded={startGroupFromUpload}
          label="Drop renders here to start a new group"
          hint="Or paste them, or choose them below. A group is a set of pictures that share one caption."
        />

        <GroupEditor
          groups={groups}
          errors={errors}
          slug={slug}
          onChange={onGroupsChange}
          onAddGroup={addEmptyGroup}
          onAddImages={addToGroup}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="cover-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="cover-heading" className="text-base font-semibold">
            The cover
          </h2>
          <span className="text-sm text-neutral-500">
            This is the picture that shows on the home page.
          </span>
        </div>

        {choices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            Add some pictures above first, then pick one to be the cover.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-3">
              {choices.map((media) => {
                const chosen = media.id === leadImageId;
                return (
                  <li key={media.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => onLeadImageChange(chosen ? null : media.id)}
                      className={
                        chosen
                          ? 'relative block overflow-hidden rounded-lg ring-2 ring-neutral-900 ring-offset-2'
                          : 'relative block overflow-hidden rounded-lg ring-1 ring-neutral-200 hover:ring-neutral-400'
                      }
                    >
                      <Image
                        src={media.key}
                        alt=""
                        width={160}
                        height={112}
                        sizes="160px"
                        className="h-20 w-28 bg-neutral-200 object-cover"
                      />
                      <span className="sr-only">
                        {chosen ? 'This is the cover. Press to unset it.' : 'Make this the cover'}
                      </span>
                      {chosen && (
                        <span
                          className="absolute right-1 top-1 rounded-full bg-neutral-900 p-1 text-white"
                          aria-hidden="true"
                        >
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {leadImageId && (
              <Field
                label="What the cover shows"
                htmlFor="lead-image-alt"
                required
                error={errors.leadImageAlt}
                hint="Saved with everything else, using the button at the top."
              >
                <Input
                  value={leadImageAlt}
                  onChange={(event) => onLeadImageAltChange(event.target.value)}
                  placeholder="The east elevation at dusk, seen across the water"
                />
              </Field>
            )}
          </>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="drawings-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="drawings-heading" className="text-base font-semibold">
            Drawings
          </h2>
          <span className="text-sm text-neutral-500">
            {drawings.length} {drawings.length === 1 ? 'sheet' : 'sheets'}
          </span>
        </div>

        <Dropzone
          destination="project"
          slug={slug}
          accept="image"
          onUploaded={addDrawings}
          label="Drop plans, sections and elevations here"
          hint="They go in their own row at the bottom of the project page, one across the page each."
        />

        {drawings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            No drawings on this project. It does not need any.
          </p>
        ) : (
          <SortableList
            items={drawings}
            getId={(drawing) => drawing.id}
            getLabel={(drawing) => drawing.alt.trim() || 'a drawing with no description yet'}
            onReorder={reorderDrawings}
            renderItem={(drawing, index) => (
              <div className="flex flex-wrap items-start gap-3">
                <Image
                  src={drawing.media.key}
                  alt=""
                  width={112}
                  height={84}
                  sizes="112px"
                  className="h-16 w-24 shrink-0 rounded bg-neutral-200 object-contain"
                />

                <div className="grid min-w-[12rem] flex-1 gap-2 sm:grid-cols-2">
                  <Field
                    label="What this drawing shows"
                    htmlFor={`drawing-${drawing.id}-alt`}
                    required
                    error={errors[`drawings.${index}.alt`]}
                  >
                    <Input
                      value={drawing.alt}
                      onChange={(event) => updateDrawing(drawing.id, { alt: event.target.value })}
                      placeholder="Ground floor plan, showing the courtyard and the north walk"
                    />
                  </Field>

                  <Field label="Kind of drawing" htmlFor={`drawing-${drawing.id}-type`}>
                    <Input
                      value={drawing.drawingType}
                      onChange={(event) =>
                        updateDrawing(drawing.id, { drawingType: event.target.value })
                      }
                      placeholder="Plan, section, elevation"
                    />
                  </Field>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDrawing(drawing.id)}
                >
                  Take out
                </Button>
              </div>
            )}
          />
        )}
      </section>
    </div>
  );
}
