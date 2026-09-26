'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

import { Dropzone } from '@/components/admin/Dropzone';
import { FrenchBox } from '@/components/admin/ProjectFrench';
import { GroupEditor } from '@/components/admin/GroupEditor';
import { SortableList } from '@/components/admin/SortableList';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { UploadedImage, UploadedItem } from '@/hooks/use-uploads';
import type { DrawingFrench, ImageFrench } from '@/lib/editor-shape';
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
  /**
   * The words printed under this photograph on the page.
   *
   * A caption belongs to a photograph, not to a group of them. It used to
   * belong to the group, so changing the words under one render changed the
   * words under every render beside it, and there was no way at all to say
   * something about one picture. The stored group captions were copied down
   * onto each of their pictures, so nothing was lost in the move.
   */
  caption?: string;
  /**
   * The same two things in French, for the /fr page.
   *
   * Not part of the picture's row in the database: it is written to the
   * Translation table against this picture. Blank in either box means nothing
   * has been translated yet and the English shows, which is the whole design
   * and the reason a half translated project is still a usable French site.
   */
  french: ImageFrench;
  media: EditorMedia;
}

export interface EditorGroup {
  id: string;
  layout: 'pair' | 'full' | 'triptych';
  /**
   * @deprecated A caption belongs to a picture. Nothing on this screen writes
   * this any more; it is carried, untouched, so that saving a project does not
   * empty the column the old words were copied down from.
   */
  caption?: string;
  images: EditorImage[];
}

export interface EditorDrawing {
  id: string;
  mediaId: string;
  alt: string;
  drawingType: string;
  /**
   * Carried across a move, never saved. A drawing has nowhere on the page to
   * print a caption, so this only exists so that moving a picture into the
   * drawings and back again inside one sitting does not lose the words. Once it
   * is saved as a drawing the caption is gone, because there is nothing holding
   * it.
   */
  caption?: string;
  /** What this sheet shows and what kind it is, in French. */
  french: DrawingFrench;
  /** The French caption, carried across a move and never saved, as above. */
  frenchCaption?: string;
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
      caption: '',
      french: { alt: '', caption: '' },
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

/**
 * A photograph, put where a photograph goes: at the end of the last group, or
 * in a group of its own when the project has none yet.
 *
 * Everything that hands a picture back to the arrangement comes through here,
 * so a cover that has been taken off and a drawing that has turned back into a
 * picture both land in the same, findable place, at the bottom of the pictures,
 * rather than each somewhere of its own.
 *
 * The ids are made by the caller and passed in, so this stays a plain function
 * of the list it is handed and running it twice cannot invent two rows.
 */
function intoLastGroup(
  current: EditorGroup[],
  image: EditorImage,
  newGroupId: string,
): EditorGroup[] {
  /* One across the page, because it is one picture on its own. */
  if (current.length === 0) return [{ id: newGroupId, layout: 'full', images: [image] }];

  const last = current.length - 1;
  return current.map((group, index) =>
    index === last ? { ...group, images: [...group.images, image] } : group,
  );
}

/**
 * A photograph that has just stopped being the cover and is in no group.
 *
 * Changing or clearing the cover used to make that photograph disappear off the
 * screen: nothing else on the project pointed at it, so there was nowhere left
 * for it to show, and getting it back meant hunting for the file and uploading
 * it a second time. It waits here instead, with the description it had as the
 * cover, until Ahmad says where it goes.
 */
interface StrayCover {
  media: EditorMedia;
  alt: string;
  /** Its French description, so putting it back does not lose the translation. */
  frenchAlt: string;
  /** Set once it has a home, so the note says what happened rather than vanishing. */
  kept: boolean;
  /** The row it was put into, so leaving it out again removes that one row. */
  imageId?: string;
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
  /** The cover's description in French. Held in ProjectForm with the rest. */
  frenchLeadImageAlt: string;
  onFrenchLeadImageAltChange: (alt: string) => void;
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
  frenchLeadImageAlt,
  onFrenchLeadImageAltChange,
}: MediaPanelProps) {
  const [strayCover, setStrayCover] = useState<StrayCover | null>(null);

  /* Brought to him rather than left to be found.
     The notice sits at the top of the cover section and the grid of pictures
     under it is around fifteen hundred pixels tall, so choosing a cover from
     the lower half of that grid put the notice the better part of two screens
     above the press. The photograph dropped out of the grid, which is what he
     saw, and the offer to keep it was somewhere he had no reason to look. */
  const strayNotice = useRef<HTMLDivElement>(null);
  const announced = useRef<string | null>(null);

  useEffect(() => {
    const media = strayCover?.kept === false ? strayCover.media.id : null;
    /* Only when a photograph first becomes stray. Scrolling again as he presses
       the button that rescues it would yank the page while he is reading. */
    if (!media || announced.current === media) {
      if (!media) announced.current = null;
      return;
    }
    announced.current = media;
    strayNotice.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [strayCover]);

  const startGroupFromUpload = useCallback(
    (items: UploadedItem[]) => {
      const images = imagesFromUpload(items);
      if (images.length === 0) return;
      onGroupsChange((current) => [...current, { id: localId(), layout: 'pair', images }]);
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
    onGroupsChange((current) => [...current, { id: localId(), layout: 'pair', images: [] }]);
  }, [onGroupsChange]);

  const addDrawings = useCallback(
    (items: UploadedItem[]) => {
      const added = imagesFromUpload(items).map((image) => ({
        id: image.id,
        mediaId: image.mediaId,
        alt: '',
        drawingType: '',
        french: { alt: '', drawingType: '' },
        media: image.media,
      }));
      if (added.length === 0) return;
      onDrawingsChange((current) => [...current, ...added]);
    },
    [onDrawingsChange],
  );

  /**
   * A picture becomes a drawing, and a drawing becomes a picture.
   *
   * Both directions read the row being moved out of the list this render is
   * showing, which is the list Ahmad is looking at and pointing at. Both halves
   * of the move are still functions of the current lists, so a batch of uploads
   * landing between the click and the render is not overwritten by either one.
   */
  const moveImageToDrawings = useCallback(
    (groupId: string, imageId: string) => {
      const moving = groups
        .find((group) => group.id === groupId)
        ?.images.find((image) => image.id === imageId);
      if (!moving) return;

      const drawingId = localId();

      onGroupsChange((current) =>
        current.map((group) =>
          group.id === groupId
            ? { ...group, images: group.images.filter((image) => image.id !== imageId) }
            : group,
        ),
      );
      onDrawingsChange((current) => [
        ...current,
        {
          id: drawingId,
          mediaId: moving.mediaId,
          alt: moving.alt,
          caption: moving.caption,
          /* Something rather than nothing, since this is printed under the
             sheet on the page. Ahmad can say what it really is. */
          drawingType: 'Drawing',
          /* The French travels with it for the same reason the English does.
             The kind of drawing starts empty because Drawing above is the
             site's word and not something he wrote, so there is nothing yet to
             have translated. */
          french: { alt: moving.french.alt, drawingType: '' },
          frenchCaption: moving.french.caption,
          media: moving.media,
        },
      ]);
    },
    [groups, onGroupsChange, onDrawingsChange],
  );

  const moveDrawingToPictures = useCallback(
    (drawingId: string) => {
      const moving = drawings.find((drawing) => drawing.id === drawingId);
      if (!moving) return;

      /* What kind of drawing it was has nowhere to go: a picture is not a plan
         or a section. The description comes with it, because it describes the
         same photograph either way. */
      const image: EditorImage = {
        id: localId(),
        mediaId: moving.mediaId,
        alt: moving.alt,
        caption: moving.caption ?? '',
        french: { alt: moving.french.alt, caption: moving.frenchCaption ?? '' },
        media: moving.media,
      };
      const groupId = localId();

      onDrawingsChange((current) => current.filter((drawing) => drawing.id !== drawingId));
      onGroupsChange((current) => intoLastGroup(current, image, groupId));
    },
    [drawings, onGroupsChange, onDrawingsChange],
  );

  const updateDrawing = useCallback(
    (id: string, changes: Partial<EditorDrawing>) => {
      onDrawingsChange((current) =>
        current.map((drawing) => (drawing.id === id ? { ...drawing, ...changes } : drawing)),
      );
    },
    [onDrawingsChange],
  );

  /* Its own updater rather than a changes object built out here, so the French
     already on the drawing is read from the list as it is now. Merging into a
     copy captured at render would drop whichever of the two French boxes was
     not the one just typed in. */
  const updateDrawingFrench = useCallback(
    (id: string, changes: Partial<DrawingFrench>) => {
      onDrawingsChange((current) =>
        current.map((drawing) =>
          drawing.id === id ? { ...drawing, french: { ...drawing.french, ...changes } } : drawing,
        ),
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

  /**
   * Picking a cover, and noticing what the last one is about to become.
   *
   * A cover that also sits in a group is on screen whatever happens to it. One
   * that does not is the whole project's only reference to that photograph, so
   * taking it off is the moment it would disappear, and that is the moment to
   * say so and offer it somewhere to go.
   */
  const chooseCover = useCallback(
    (mediaId: string | null) => {
      let outgoing: EditorMedia | null = null;
      if (leadImageId && leadImageId !== mediaId) {
        outgoing = coverChoices(groups, leadImage).find((media) => media.id === leadImageId) ?? null;
      }

      const stillShown =
        outgoing === null ||
        groups.some((group) => group.images.some((image) => image.media.id === outgoing?.id));

      onLeadImageChange(mediaId);

      if (!outgoing || stillShown) {
        setStrayCover(null);
        return;
      }

      /* Kept, not offered.

         It used to ask, and asking was the bug. The notice sits at the top of
         this section and the grid of pictures under it runs to fifteen hundred
         pixels, so choosing a cover from the lower half put the question the
         better part of two screens above the press. What Ahmad saw was the
         photograph dropping out of the grid with no explanation, which is
         exactly what he reported, twice.

         So the safe answer is taken for him: a photograph that would otherwise
         be shown nowhere goes back with the pictures, and the notice offers to
         leave it out instead. Nothing on the site changes until he saves, and
         an unwanted picture is a moment's work to remove, where a lost one is a
         hunt through the library. */
      const image: EditorImage = {
        id: localId(),
        mediaId: outgoing.id,
        alt: leadImageAlt,
        caption: '',
        french: { alt: frenchLeadImageAlt, caption: '' },
        media: outgoing,
      };
      const groupId = localId();

      onGroupsChange((current) => intoLastGroup(current, image, groupId));
      setStrayCover({
        media: outgoing,
        alt: leadImageAlt,
        frenchAlt: frenchLeadImageAlt,
        kept: true,
        imageId: image.id,
      });
    },
    [
      groups,
      leadImage,
      leadImageId,
      leadImageAlt,
      frenchLeadImageAlt,
      onLeadImageChange,
      onGroupsChange,
    ],
  );

  /* The other way, for a photograph he did not want back. */
  const dropStrayCover = useCallback(() => {
    if (!strayCover?.imageId) {
      setStrayCover(null);
      return;
    }
    const id = strayCover.imageId;
    onGroupsChange((current) =>
      current.map((group) => ({
        ...group,
        images: group.images.filter((image) => image.id !== id),
      })),
    );
    setStrayCover(null);
  }, [strayCover, onGroupsChange]);

  const keepStrayCover = useCallback(() => {
    if (!strayCover || strayCover.kept) return;

    /* Made out here, so the update below is a plain function of the groups it
       is handed and cannot invent two different rows if it runs twice. */
    const image: EditorImage = {
      id: localId(),
      mediaId: strayCover.media.id,
      alt: strayCover.alt,
      caption: '',
      french: { alt: strayCover.frenchAlt, caption: '' },
      media: strayCover.media,
    };
    const groupId = localId();

    onGroupsChange((current) => intoLastGroup(current, image, groupId));
    setStrayCover({ ...strayCover, kept: true });
  }, [strayCover, onGroupsChange]);

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
          accept="image-or-pdf"
          onUploaded={startGroupFromUpload}
          label="Drop renders here to start a new group"
          hint="Or paste them, or choose them below. A PDF works too: you choose which of its pages or pictures to use. A group is a set of pictures that sit together on the page, and each one has its own caption."
        />

        <GroupEditor
          groups={groups}
          errors={errors}
          slug={slug}
          onChange={onGroupsChange}
          onAddGroup={addEmptyGroup}
          onAddImages={addToGroup}
          onMoveToDrawings={moveImageToDrawings}
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

        {strayCover && (
          <div
            ref={strayNotice}
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <Image
              src={strayCover.media.key}
              alt=""
              width={112}
              height={84}
              sizes="112px"
              className="h-12 w-16 shrink-0 rounded bg-neutral-200 object-cover"
            />

            {strayCover.kept ? (
              <>
                <p className="min-w-[12rem] flex-1">
                  That photograph was the cover and nothing else showed it, so it is now with the
                  pictures above, at the end of the last group. Nothing changes on the site until
                  you save.
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={dropStrayCover}>
                  Leave it out
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStrayCover(null)}
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <p className="min-w-[12rem] flex-1">
                  That photograph was the cover, and it is in none of the groups above, so nothing
                  on the project shows it now.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={keepStrayCover}>
                  Put it with the pictures
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStrayCover(null)}
                >
                  Leave it out
                </Button>
              </>
            )}
          </div>
        )}

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
                      onClick={() => chooseCover(chosen ? null : media.id)}
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
              <div>
                <Field
                  label="What the cover shows"
                  htmlFor="lead-image-alt"
                  required
                  error={errors.leadImageAlt}
                  hint="What a screen reader announces; it is not printed. The words printed under the cover are the caption of the same picture, in Pictures above. Saved with everything else, using the button at the top."
                >
                  <Input
                    value={leadImageAlt}
                    onChange={(event) => onLeadImageAltChange(event.target.value)}
                    placeholder="The east elevation at dusk, seen across the water"
                  />
                </Field>

                <FrenchBox
                  label="What the cover shows"
                  htmlFor="lead-image-alt-fr"
                  english={leadImageAlt}
                  value={frenchLeadImageAlt}
                  onChange={onFrenchLeadImageAltChange}
                />
              </div>
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
          accept="image-or-pdf"
          onUploaded={addDrawings}
          label="Drop plans, sections and elevations here"
          hint="Images or a PDF drawing set: from a PDF you choose which pages to use. They go in their own row at the bottom of the project page, one across the page each."
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
                  <div>
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

                    <FrenchBox
                      label="What this drawing shows"
                      htmlFor={`drawing-${drawing.id}-alt-fr`}
                      english={drawing.alt}
                      value={drawing.french.alt}
                      onChange={(value) => updateDrawingFrench(drawing.id, { alt: value })}
                    />
                  </div>

                  <div>
                    <Field label="Kind of drawing" htmlFor={`drawing-${drawing.id}-type`}>
                      <Input
                        value={drawing.drawingType}
                        onChange={(event) =>
                          updateDrawing(drawing.id, { drawingType: event.target.value })
                        }
                        placeholder="Plan, section, elevation"
                      />
                    </Field>

                    <FrenchBox
                      label="Kind of drawing"
                      htmlFor={`drawing-${drawing.id}-type-fr`}
                      english={drawing.drawingType}
                      value={drawing.french.drawingType}
                      onChange={(value) => updateDrawingFrench(drawing.id, { drawingType: value })}
                    />
                  </div>
                </div>

                <div className="grid gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveDrawingToPictures(drawing.id)}
                  >
                    Move to the pictures
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDrawing(drawing.id)}
                  >
                    Take out
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </section>
    </div>
  );
}
