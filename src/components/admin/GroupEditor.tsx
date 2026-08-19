'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { ImagePlus, Plus } from 'lucide-react';

import { Dropzone } from '@/components/admin/Dropzone';
import { SortableList } from '@/components/admin/SortableList';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { UploadedItem } from '@/hooks/use-uploads';
import { LAYOUTS, type FieldErrors } from '@/lib/validation';

import type { EditorGroup, EditorImage } from '@/components/admin/MediaPanel';

/**
 * The arrangement: groups of images, in order, each image with its own
 * description.
 *
 * This holds no data of its own. Every change is handed back up to MediaPanel,
 * which owns the arrangement and is the only place that saves it. Two lists
 * that both think they are the truth is how an image ends up in two places at
 * once, or in neither.
 */

/** How each layout reads to somebody who has never seen the word triptych. */
const LAYOUT_LABELS: Record<(typeof LAYOUTS)[number], string> = {
  pair: 'Two side by side',
  full: 'One across the page',
  triptych: 'Three side by side',
};

export interface GroupEditorProps {
  groups: EditorGroup[];
  /**
   * Keyed images.<position>.alt, counting across every group in order, which is
   * the same shape saveImageGroups sends back. Both halves of the message
   * therefore land on the same picture whether the check ran here or there.
   */
  errors: FieldErrors;
  slug: string;
  /**
   * Takes a function of the current groups, never a finished array.
   *
   * It used to take the array, and every mutator here built one from the
   * `groups` prop it had closed over. That defeats the whole point of the
   * functional appends the parent uses to protect uploads: a caption typed
   * while a batch was still uploading would dispatch an overwrite built from
   * the pre upload list, React would rebase, and the images the append had just
   * added would be gone from state with the progress rows still reading Done.
   *
   * With a function there is no stale array to build from.
   */
  onChange: (change: (current: EditorGroup[]) => EditorGroup[]) => void;
  onAddGroup: () => void;
  onAddImages: (groupId: string, items: UploadedItem[]) => void;
}

/** Where each group starts in the flat count the error keys are numbered by. */
function flatOffsets(groups: EditorGroup[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const group of groups) {
    offsets.push(running);
    running += group.images.length;
  }
  return offsets;
}

function groupLabel(group: EditorGroup): string {
  const caption = group.caption.trim();
  if (caption) return caption;
  const count = group.images.length;
  return count === 1 ? 'a group of one image' : `a group of ${count} images`;
}

/**
 * A group is dragged by its handle, never by its own fields.
 *
 * Without this, pressing into the caption box to select a word starts dragging
 * the whole group instead, because the row around it is a drag source.
 */
function cancelDrag(event: React.DragEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Images are reordered inside their group and nowhere else.
 *
 * The image list sits inside the group list, so without stopping the events
 * here, dragging one picture would also tell the outer list that its group was
 * being moved, and both orders would change at once.
 */
function containDrag(event: React.DragEvent) {
  event.stopPropagation();
}

export function GroupEditor({
  groups,
  errors,
  slug,
  onChange,
  onAddGroup,
  onAddImages,
}: GroupEditorProps) {
  const [openDropzone, setOpenDropzone] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<EditorGroup | null>(null);

  const updateGroup = useCallback(
    (groupId: string, changes: Partial<EditorGroup>) => {
      onChange((current) =>
        current.map((group) => (group.id === groupId ? { ...group, ...changes } : group)),
      );
    },
    [onChange],
  );

  const removeGroup = useCallback(
    (groupId: string) => {
      onChange((current) => current.filter((group) => group.id !== groupId));
      setPendingRemoval(null);
    },
    [onChange],
  );

  const reorderGroups = useCallback(
    (idsInOrder: string[]) => {
      onChange((current) =>
        idsInOrder
          .map((id) => current.find((group) => group.id === id))
          .filter((group): group is EditorGroup => Boolean(group)),
      );
    },
    [onChange],
  );

  const updateImage = useCallback(
    (groupId: string, imageId: string, changes: Partial<EditorImage>) => {
      onChange((current) =>
        current.map((group) =>
          group.id === groupId
            ? {
                ...group,
                images: group.images.map((image) =>
                  image.id === imageId ? { ...image, ...changes } : image,
                ),
              }
            : group,
        ),
      );
    },
    [onChange],
  );

  const removeImage = useCallback(
    (groupId: string, imageId: string) => {
      onChange((current) =>
        current.map((group) =>
          group.id === groupId
            ? { ...group, images: group.images.filter((image) => image.id !== imageId) }
            : group,
        ),
      );
    },
    [onChange],
  );

  const moveImage = useCallback(
    (fromGroupId: string, imageId: string, toGroupId: string) => {
      if (fromGroupId === toGroupId) return;

      onChange((current) => {
        // Found inside the update, not outside it. Reading the image from the
        // prop first would move a copy of whatever it looked like before an
        // upload or another edit landed.
        const moving = current
          .find((group) => group.id === fromGroupId)
          ?.images.find((image) => image.id === imageId);
        if (!moving) return current;

        return current.map((group) => {
          if (group.id === fromGroupId) {
            return { ...group, images: group.images.filter((image) => image.id !== imageId) };
          }
          if (group.id === toGroupId) {
            return { ...group, images: [...group.images, moving] };
          }
          return group;
        });
      });
    },
    [onChange],
  );

  const reorderImages = useCallback(
    (groupId: string, idsInOrder: string[]) => {
      onChange((current) =>
        current.map((group) =>
          group.id === groupId
            ? {
                ...group,
                images: idsInOrder
                  .map((id) => group.images.find((image) => image.id === id))
                  .filter((image): image is EditorImage => Boolean(image)),
              }
            : group,
        ),
      );
    },
    [onChange],
  );

  const askToRemoveGroup = useCallback(
    (group: EditorGroup) => {
      if (group.images.length === 0) {
        removeGroup(group.id);
        return;
      }
      setPendingRemoval(group);
    },
    [removeGroup],
  );

  const offsets = flatOffsets(groups);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
        No pictures arranged yet. Drop some above and they become the first group.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <SortableList
        items={groups}
        getId={(group) => group.id}
        getLabel={groupLabel}
        onReorder={reorderGroups}
        className="gap-4"
        itemClassName="flex-col sm:flex-row"
        renderItem={(group, groupIndex) => (
          <div className="grid gap-4">
            <div
              onDragStart={cancelDrag}
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
            >
              <Field
                label={`Group ${groupIndex + 1} caption`}
                htmlFor={`group-${group.id}-caption`}
                hint="Shown under these pictures on the page. Leave it empty for none."
              >
                <Input
                  value={group.caption}
                  onChange={(event) => updateGroup(group.id, { caption: event.target.value })}
                  placeholder="Nothing under these pictures"
                />
              </Field>

              <Field label="How they sit" htmlFor={`group-${group.id}-layout`}>
                <Select
                  value={group.layout}
                  onChange={(event) =>
                    updateGroup(group.id, {
                      layout: event.target.value as EditorGroup['layout'],
                    })
                  }
                >
                  {LAYOUTS.map((layout) => (
                    <option key={layout} value={layout}>
                      {LAYOUT_LABELS[layout]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div onDragStart={containDrag} onDragOver={containDrag} onDrop={containDrag}>
              {group.images.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  This group is empty. Add pictures to it below, or remove it.
                </p>
              ) : (
                <SortableList
                  items={group.images}
                  getId={(image) => image.id}
                  getLabel={(image) => image.alt.trim() || 'a picture with no description yet'}
                  onReorder={(idsInOrder) => reorderImages(group.id, idsInOrder)}
                  itemClassName="bg-neutral-50"
                  renderItem={(image, imageIndex) => (
                    <div className="flex flex-wrap items-start gap-3">
                      <Image
                        src={image.media.key}
                        alt=""
                        width={112}
                        height={84}
                        sizes="112px"
                        className="h-16 w-24 shrink-0 rounded bg-neutral-200 object-cover"
                      />

                      {/* A minimum rather than nothing, so the controls beside
                          it wrap onto their own line instead of squeezing the
                          description down to a box two words wide. */}
                      <div className="min-w-[12rem] flex-1" onDragStart={cancelDrag}>
                        <Field
                          label="What this picture shows"
                          htmlFor={`image-${image.id}-alt`}
                          required
                          error={errors[`images.${offsets[groupIndex] + imageIndex}.alt`]}
                        >
                          <Input
                            value={image.alt}
                            onChange={(event) =>
                              updateImage(group.id, image.id, { alt: event.target.value })
                            }
                            placeholder="The courtyard at dusk, seen from the north walk"
                          />
                        </Field>
                      </div>

                      <div className="grid gap-1" onDragStart={cancelDrag}>
                        {groups.length > 1 && (
                          <Select
                            aria-label="Which group this picture belongs to"
                            value={group.id}
                            onChange={(event) =>
                              moveImage(group.id, image.id, event.target.value)
                            }
                            className="w-40"
                          >
                            {groups.map((candidate, candidateIndex) => (
                              <option key={candidate.id} value={candidate.id}>
                                In group {candidateIndex + 1}
                              </option>
                            ))}
                          </Select>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeImage(group.id, image.id)}
                        >
                          Take out
                        </Button>
                      </div>
                    </div>
                  )}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2" onDragStart={cancelDrag}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setOpenDropzone((current) => (current === group.id ? null : group.id))
                }
              >
                <ImagePlus className="mr-1 h-3 w-3" aria-hidden="true" />
                {openDropzone === group.id ? 'Done adding' : 'Add pictures to this group'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-700 hover:bg-red-50"
                onClick={() => askToRemoveGroup(group)}
              >
                Remove this group
              </Button>
            </div>

            {openDropzone === group.id && (
              <div onDragStart={cancelDrag}>
                <Dropzone
                  destination="project"
                  slug={slug}
                  accept="image"
                  onUploaded={(items) => onAddImages(group.id, items)}
                  label={`Drop pictures here to add them to group ${groupIndex + 1}`}
                  hint="Or paste them, or choose them below. As many at once as you like."
                />
              </div>
            )}
          </div>
        )}
      />

      <div>
        <Button type="button" variant="outline" size="sm" onClick={onAddGroup}>
          <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
          Add an empty group
        </Button>
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
        title="Remove this group?"
        description={
          <>
            <p>
              The {pendingRemoval?.images.length ?? 0} pictures in it come off this project. The
              files themselves stay in your library, so you can put them back.
            </p>
            <p className="mt-2">Nothing changes on the site until you save the arrangement.</p>
          </>
        }
        confirmLabel="Remove the group"
        onConfirm={() => {
          if (pendingRemoval) removeGroup(pendingRemoval.id);
        }}
      />
    </div>
  );
}
