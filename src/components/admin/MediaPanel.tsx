'use client';

import Image from 'next/image';
import { useCallback, useState, useTransition } from 'react';
import { Check } from 'lucide-react';

import { Dropzone } from '@/components/admin/Dropzone';
import { GroupEditor } from '@/components/admin/GroupEditor';
import { SortableList } from '@/components/admin/SortableList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import type { UploadedImage, UploadedItem } from '@/hooks/use-uploads';
import { runAction } from '@/lib/action-result';
import { saveDrawings, saveImageGroups } from '@/lib/mutations';
import { hasErrors, validateImages, type FieldErrors } from '@/lib/validation';

/**
 * Everything on the right hand side: the pictures, how they are grouped, the
 * cover, and the drawings.
 *
 * The arrangement is held here rather than inside GroupEditor, because the
 * cover is chosen from the same pictures and is saved by a different action.
 * One owner, two savers, no chance of the two lists disagreeing about what the
 * project contains.
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
  projectId: string;
  slug: string;
  initialGroups: EditorGroup[];
  initialDrawings: EditorDrawing[];
  leadImageId: string | null;
  leadImageAlt: string;
  leadImage: EditorMedia | null;
  leadImageAltError?: string;
  onLeadImageChange: (mediaId: string | null) => void;
  onLeadImageAltChange: (alt: string) => void;
}

export function MediaPanel({
  projectId,
  slug,
  initialGroups,
  initialDrawings,
  leadImageId,
  leadImageAlt,
  leadImage,
  leadImageAltError,
  onLeadImageChange,
  onLeadImageAltChange,
}: MediaPanelProps) {
  const { push } = useToast();

  const [groups, setGroups] = useState<EditorGroup[]>(initialGroups);
  const [groupErrors, setGroupErrors] = useState<FieldErrors>({});
  const [groupsUnsaved, setGroupsUnsaved] = useState(false);
  const [savingGroups, startGroupSave] = useTransition();

  const [drawings, setDrawings] = useState<EditorDrawing[]>(initialDrawings);
  const [drawingErrors, setDrawingErrors] = useState<FieldErrors>({});
  const [drawingsUnsaved, setDrawingsUnsaved] = useState(false);
  const [savingDrawings, startDrawingSave] = useTransition();

  /* Two halves, two flags, and each is cleared only by the button that saves
     it. One warning covers both, because the browser asks the same question
     whichever of them is outstanding. */
  useRegisterUnsaved('project:media', groupsUnsaved || drawingsUnsaved);

  /**
   * Every change to the arrangement goes through here, as a function of what is
   * already there rather than of what was there.
   *
   * That matters because an upload finishes minutes after it was started and
   * Ahmad keeps working while it runs. Adding to the copy of the list that
   * existed when the files were dropped throws away every description typed
   * since, which looks exactly like the interface losing his work.
   */
  const applyToGroups = useCallback((change: (current: EditorGroup[]) => EditorGroup[]) => {
    setGroups(change);
    setGroupsUnsaved(true);
  }, []);

  const changeGroups = useCallback(
    (next: EditorGroup[]) => applyToGroups(() => next),
    [applyToGroups],
  );

  const startGroupFromUpload = useCallback(
    (items: UploadedItem[]) => {
      const images = imagesFromUpload(items);
      if (images.length === 0) return;
      applyToGroups((current) => [
        ...current,
        { id: localId(), layout: 'pair', caption: '', images },
      ]);
    },
    [applyToGroups],
  );

  const addToGroup = useCallback(
    (groupId: string, items: UploadedItem[]) => {
      const images = imagesFromUpload(items);
      if (images.length === 0) return;
      applyToGroups((current) =>
        current.map((group) =>
          group.id === groupId ? { ...group, images: [...group.images, ...images] } : group,
        ),
      );
    },
    [applyToGroups],
  );

  const addEmptyGroup = useCallback(() => {
    applyToGroups((current) => [
      ...current,
      { id: localId(), layout: 'pair', caption: '', images: [] },
    ]);
  }, [applyToGroups]);

  const saveArrangement = useCallback(() => {
    const flat = groups.flatMap((group) =>
      group.images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
    );

    /* Checked here as well as on the server, and blocking rather than warning.
       A picture with no description is not something to save and fix later: on
       the page it is a blank a screen reader reads as nothing at all. */
    const found = validateImages(flat);
    if (hasErrors(found)) {
      setGroupErrors(found);
      push('Every picture needs a line saying what it shows. The ones missing it are marked.', 'error');
      return;
    }

    startGroupSave(async () => {
      const result = await runAction(() =>
        saveImageGroups(
          projectId,
          groups.map((group) => ({
            layout: group.layout,
            caption: group.caption,
            images: group.images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
          })),
        ),
      );

      if (!result.ok) {
        setGroupErrors(result.errors ?? {});
        push(result.message ?? 'Nothing was saved. The pictures marked below need a description.', 'error');
        return;
      }

      setGroupErrors({});
      setGroupsUnsaved(false);
      push('Pictures saved.');
    });
  }, [groups, projectId, push]);

  /** As above: a drawing that lands late joins the list as it stands then. */
  const applyToDrawings = useCallback(
    (change: (current: EditorDrawing[]) => EditorDrawing[]) => {
      setDrawings(change);
      setDrawingsUnsaved(true);
    },
    [],
  );

  const changeDrawings = useCallback(
    (next: EditorDrawing[]) => applyToDrawings(() => next),
    [applyToDrawings],
  );

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
      applyToDrawings((current) => [...current, ...added]);
    },
    [applyToDrawings],
  );

  const updateDrawing = useCallback(
    (id: string, changes: Partial<EditorDrawing>) => {
      changeDrawings(
        drawings.map((drawing) => (drawing.id === id ? { ...drawing, ...changes } : drawing)),
      );
    },
    [drawings, changeDrawings],
  );

  const removeDrawing = useCallback(
    (id: string) => {
      changeDrawings(drawings.filter((drawing) => drawing.id !== id));
    },
    [drawings, changeDrawings],
  );

  const reorderDrawings = useCallback(
    (idsInOrder: string[]) => {
      changeDrawings(
        idsInOrder
          .map((id) => drawings.find((drawing) => drawing.id === id))
          .filter((drawing): drawing is EditorDrawing => Boolean(drawing)),
      );
    },
    [drawings, changeDrawings],
  );

  const saveDrawingList = useCallback(() => {
    const found = validateImages(drawings.map((drawing) => ({ mediaId: drawing.mediaId, alt: drawing.alt })));
    if (hasErrors(found)) {
      setDrawingErrors(found);
      push('Every drawing needs a line saying what it shows. The ones missing it are marked.', 'error');
      return;
    }

    startDrawingSave(async () => {
      const result = await runAction(() =>
        saveDrawings(
          projectId,
          drawings.map((drawing) => ({
            mediaId: drawing.mediaId,
            alt: drawing.alt,
            drawingType: drawing.drawingType,
          })),
        ),
      );

      if (!result.ok) {
        setDrawingErrors(result.errors ?? {});
        push(result.message ?? 'Nothing was saved. The drawings marked below need a description.', 'error');
        return;
      }

      setDrawingErrors({});
      setDrawingsUnsaved(false);
      push('Drawings saved.');
    });
  }, [drawings, projectId, push]);

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
          {groupsUnsaved && <Badge variant="warning">Not saved yet</Badge>}
          <Button
            type="button"
            className="ml-auto"
            size="sm"
            onClick={saveArrangement}
            disabled={savingGroups}
          >
            {savingGroups ? 'Saving' : 'Save the pictures'}
          </Button>
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
          errors={groupErrors}
          slug={slug}
          onChange={changeGroups}
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
                error={leadImageAltError}
                hint="Saved with the rest of the details, using the button at the top."
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
          {drawingsUnsaved && <Badge variant="warning">Not saved yet</Badge>}
          <Button
            type="button"
            className="ml-auto"
            size="sm"
            onClick={saveDrawingList}
            disabled={savingDrawings}
          >
            {savingDrawings ? 'Saving' : 'Save the drawings'}
          </Button>
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
                    error={drawingErrors[`images.${index}.alt`]}
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
