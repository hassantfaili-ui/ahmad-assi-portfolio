'use client';

import { useCallback, useRef, useState, useTransition } from 'react';

import { FilmEditor, type EditorFilm } from '@/components/admin/FilmEditor';
import { GuardedLink } from '@/components/admin/GuardedLink';
import {
  MediaPanel,
  type EditorDrawing,
  type EditorGroup,
  type EditorMedia,
} from '@/components/admin/MediaPanel';
import { FrenchBox, FrenchBoxes } from '@/components/admin/ProjectFrench';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { useSaveFlag } from '@/hooks/use-save-flag';
import { runAction } from '@/lib/action-result';
import type {
  DrawingFrench,
  FilmFrench,
  ImageFrench,
  ProjectFrench,
} from '@/lib/editor-shape';
import { saveWholeProject, type WholeProjectInput } from '@/lib/mutations';
import {
  CATEGORIES,
  STATUSES,
  STATUS_LABELS,
  TIERS,
  hasErrors,
  validateFilm,
  validateImages,
  validateProject,
  type FieldErrors,
  type ProjectInput,
} from '@/lib/validation';

/**
 * The whole editing screen: the words on the left, the pictures and the film on
 * the right, and one button that saves all of it.
 *
 * THERE IS ONE SAVE BUTTON ON PURPOSE. Please do not split it up again.
 *
 * This screen used to have four. Save the details, Save the pictures, Save the
 * drawings and Save the film, each sending its own quarter of the project and
 * clearing its own badge. Ahmad edited a group caption, pressed the obvious
 * button at the top of the screen, was told Saved, and the caption never
 * reached the database, because captions belonged to a different button further
 * down the page. Nothing failed and nothing warned. The work was not lost, it
 * was never sent, which is worse, because there was nothing to notice.
 *
 * No interface can ask somebody to hold a map in their head of which control
 * belongs to which button. So this component owns every editable thing on the
 * screen: the fields, the groups, the drawings and the film. MediaPanel and
 * FilmEditor are controlled, hold no savable state of their own, and hand every
 * change back up here. One flag, one badge, one button, one payload, and one
 * server action that writes all of it in a single transaction or none of it.
 *
 * If a fifth kind of content is added later, it belongs in this state and in
 * this payload. It does not get a button.
 *
 * The French is that fifth kind, and it obeys the rule. It is held here with
 * everything else, it rides out in the same payload on the same press, and it
 * has no button. The one difference is where it lands: French is not part of a
 * project's row, it goes to the Translation table, so it travels in the payload
 * under `french` and saveWholeProject writes it there. See ProjectPayload below
 * for the exact shape.
 */

/** How each tier reads. The words on the home page, not the words in the code. */
const TIER_LABELS: Record<(typeof TIERS)[number], string> = {
  lead: 'One of the three large cards at the top',
  set: 'In the strip that scrolls sideways',
  index: 'In the list further down, under Also in the archive',
};

export interface EditorProject {
  id: string;
  slug: string;
  title: string;
  sheet: string;
  category: string;
  year: number;
  location: string;
  buildingType: string;
  area: string;
  status: string;
  role: string;
  contribution: string;
  summary: string;
  body: string;
  credit: string;
  tier: string;
  order: number;
  published: boolean;
  /** When this screen last read the project, sent back with every save. */
  updatedAt: string;
  leadImageId: string | null;
  leadImageAlt: string;
  leadImage: EditorMedia | null;
  /**
   * The French already written for this project, box by box.
   *
   * Read out of the Translation table by the page that renders this screen,
   * never out of the project's own row: the row is the English, and English is
   * never stored as a translation of itself.
   */
  french: ProjectFrench;
}

/**
 * What this screen sends, which is WholeProjectInput plus the French.
 *
 * THE CONTRACT FOR saveWholeProject, which lives in mutations.ts and is not
 * this file's to write. Everything below is extra: the fields already there are
 * untouched and still mean what they meant.
 *
 *   payload.french                        the Project row's own French
 *   payload.groups[g].images[i].french    each photograph's
 *   payload.drawings[d].french            each sheet's
 *   payload.film.french                   the walkthrough's
 *
 * Each one is a plain object of field name to French words, using the field
 * names of the English row, and each carries every translatable field of its
 * kind on every save, blank where nothing is written. Blank means not
 * translated: saveTranslations deletes the row rather than storing emptiness,
 * so the English shows through, which is exactly what is wanted.
 *
 * Two things the save has to get right, both of which follow from it deleting
 * and recreating the pictures, the drawings and the film on every write:
 *
 *   The French cannot be keyed by the row id this screen was handed, because
 *   that row will not exist by the time the French is written. It has to be
 *   written against the id of the row the save has just created, which is why
 *   it travels attached to the picture rather than in a map keyed by id.
 *
 *   The ids being replaced have to be handed to forgetTranslations, or every
 *   save leaves the Translation table holding French for pictures that are
 *   gone, and the table grows without bound.
 *
 * The Project row itself keeps its id, so payload.french goes straight to
 * saveTranslations('fr', 'Project', id, payload.french).
 */
type GroupInput = WholeProjectInput['groups'][number];
type ImageInput = GroupInput['images'][number];

export interface ProjectPayload extends Omit<WholeProjectInput, 'groups' | 'drawings' | 'film'> {
  french: ProjectFrench;
  groups: (Omit<GroupInput, 'images'> & { images: (ImageInput & { french: ImageFrench })[] })[];
  drawings: (WholeProjectInput['drawings'][number] & { french: DrawingFrench })[];
  film: (NonNullable<WholeProjectInput['film']> & { french: FilmFrench }) | null;
}

export interface ProjectFormProps {
  project: EditorProject;
  groups: EditorGroup[];
  drawings: EditorDrawing[];
  film: EditorFilm | null;
}

interface FormValues {
  title: string;
  slug: string;
  sheet: string;
  category: string;
  year: string;
  location: string;
  buildingType: string;
  area: string;
  status: string;
  role: string;
  contribution: string;
  summary: string;
  body: string;
  credit: string;
  tier: string;
  order: string;
  leadImageId: string | null;
  leadImageAlt: string;
}

/* The year and the position are text while they are being typed, because an
   emptied number box is not a number and refusing to let him clear it to type a
   new one would be worse than validating it on the way out. */
function initialValues(project: EditorProject): FormValues {
  return {
    title: project.title,
    slug: project.slug,
    sheet: project.sheet,
    category: project.category,
    year: String(project.year),
    location: project.location,
    buildingType: project.buildingType,
    area: project.area,
    status: project.status,
    role: project.role,
    contribution: project.contribution,
    summary: project.summary,
    body: project.body,
    credit: project.credit,
    tier: project.tier,
    order: String(project.order),
    leadImageId: project.leadImageId,
    leadImageAlt: project.leadImageAlt,
  };
}

function toInput(values: FormValues): ProjectInput {
  return {
    title: values.title,
    slug: values.slug,
    sheet: values.sheet,
    category: values.category,
    year: Number.parseInt(values.year, 10),
    location: values.location,
    buildingType: values.buildingType,
    area: values.area.trim() || null,
    status: values.status,
    role: values.role,
    contribution: values.contribution,
    summary: values.summary,
    body: values.body,
    credit: values.credit,
    tier: values.tier,
    order: Number.parseInt(values.order, 10) || 0,
    leadImageId: values.leadImageId,
    leadImageAlt: values.leadImageAlt,
  };
}

/**
 * The film as the server wants it, or null for a project with no walkthrough.
 *
 * An empty shell is not a film. Sending one would fail the server's check with
 * "a film needs either an uploaded file or a YouTube id" on every project that
 * simply has no walkthrough, which would be the whole archive. null is the
 * honest description of that, and it is also what removes a film that was
 * there before.
 *
 * A caption on its own is deliberately not treated as empty. It is a film with
 * nothing in it, and it comes back marked, rather than being quietly dropped,
 * which is the exact failure this screen was rebuilt to end.
 */
function toFilmInput(film: EditorFilm | null): ProjectPayload['film'] {
  if (!film) return null;

  const sources = film.sources.map((source) => ({
    mediaId: source.media.id,
    height: source.height,
  }));

  /* A French caption counts for the same reason the English one does: it is
     something Ahmad typed, and dropping it here would drop it silently. */
  if (
    sources.length === 0 &&
    !film.youtubeId.trim() &&
    !film.caption.trim() &&
    !film.french.caption.trim()
  ) {
    return null;
  }

  return {
    posterMediaId: film.posterMedia?.id ?? null,
    youtubeId: film.youtubeId,
    caption: film.caption,
    french: film.french,
    sources,
  };
}

/** Everything on the screen, in the one shape the one action takes. */
function buildPayload(
  values: FormValues,
  french: ProjectFrench,
  groups: EditorGroup[],
  drawings: EditorDrawing[],
  film: EditorFilm | null,
  published: boolean,
  baseUpdatedAt: string | null,
): ProjectPayload {
  return {
    fields: toInput(values),
    /* Sent whole every time, blanks included. A field left out would read to
       the save as "leave what is stored alone", and there would then be no way
       at all to clear a translation that is wrong. */
    french,
    baseUpdatedAt,
    published,
    groups: groups.map((group) => ({
      layout: group.layout,
      /* Carried, never edited. A caption belongs to a photograph now: every
         group caption was copied down onto its pictures before this screen
         changed, and the project page prints the picture's own. It still goes
         back exactly as it arrived rather than as nothing, because sending
         nothing empties the column on the first save of every project, and
         that copy of the words is worth keeping until the new ones have made
         the trip out to the database and back at least once. */
      caption: group.caption,
      images: group.images.map((image) => ({
        mediaId: image.mediaId,
        alt: image.alt,
        caption: image.caption ?? null,
        ratio: image.ratio,
        focusX: image.focus.x,
        focusY: image.focus.y,
        french: image.french,
      })),
    })),
    drawings: drawings.map((drawing) => ({
      mediaId: drawing.mediaId,
      alt: drawing.alt,
      drawingType: drawing.drawingType,
      french: drawing.french,
    })),
    film: toFilmInput(film),
  };
}

/**
 * How far the French has got, counted over the boxes that are on the screen.
 *
 * The point of counting is that the boxes can be hidden. Hidden work that
 * nothing mentions is the failure this screen exists to have fixed, so the
 * strip at the top says how much French there is whether it is showing or not.
 */
function countFrench(
  french: ProjectFrench,
  groups: EditorGroup[],
  drawings: EditorDrawing[],
  film: EditorFilm | null,
  hasCover: boolean,
): { written: number; total: number } {
  const boxes: string[] = [
    french.title,
    french.location,
    french.buildingType,
    french.area,
    french.role,
    french.contribution,
    french.summary,
    french.body,
    french.credit,
    /* Only when there is a cover, because that is the only time the English box
       it belongs to is on the screen at all. */
    ...(hasCover ? [french.leadImageAlt] : []),
    ...groups.flatMap((group) =>
      group.images.flatMap((image) => [image.french.alt, image.french.caption]),
    ),
    ...drawings.flatMap((drawing) => [drawing.french.alt, drawing.french.drawingType]),
    /* The walkthrough's caption box is on the screen whether or not the project
       has a film, so it is always one of the boxes to count. */
    film?.french.caption ?? '',
  ];

  return { written: boxes.filter((box) => box.trim()).length, total: boxes.length };
}

/**
 * The same rules the server applies, run here first on the same payload.
 *
 * Here so the answer is instant and nothing goes out that is going to come back
 * refused. There, because this half can be skipped and that half cannot. Both
 * halves key their messages identically, so a message means the same control
 * whichever of them produced it, and neither has to be translated on arrival.
 */
function collectErrors(payload: WholeProjectInput): FieldErrors {
  const errors: FieldErrors = { ...validateProject(payload.fields) };

  /* Namespaced by group, so two pictures in different groups cannot collide on
     images.0.alt and show one message for both. */
  payload.groups.forEach((group, groupIndex) => {
    for (const [key, message] of Object.entries(validateImages(group.images))) {
      errors[`groups.${groupIndex}.${key}`] = message;
    }
  });

  /* Drawings are checked by the same function, so the wording of the message
     has one source, and only the prefix is swapped to say which list it is
     about. */
  for (const [key, message] of Object.entries(validateImages(payload.drawings))) {
    errors[key.replace('images.', 'drawings.')] = message;
  }

  if (payload.film) {
    Object.assign(
      errors,
      validateFilm({
        sourceMediaIds: payload.film.sources.map((source) => source.mediaId),
        youtubeId: payload.film.youtubeId,
        posterMediaId: payload.film.posterMediaId,
      }),
    );
  }

  return errors;
}

/* Named in the order they appear down the screen, so the sentence built from
   them reads the way the eye travels. */
const SECTIONS = [
  'the details',
  'the pictures',
  'the cover',
  'the drawings',
  'the walkthrough',
] as const;

/** Which parts of the screen a refusal is about, from the keys it came back with. */
function troubledSections(errors: FieldErrors): string[] {
  const found = new Set<string>();

  for (const key of Object.keys(errors)) {
    if (key.startsWith('groups.')) found.add('the pictures');
    else if (key.startsWith('drawings.')) found.add('the drawings');
    else if (key === 'film' || key === 'filmPoster') found.add('the walkthrough');
    else if (key === 'leadImageAlt') found.add('the cover');
    else found.add('the details');
  }

  return SECTIONS.filter((section) => found.has(section));
}

function inWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What to say when a save is refused.
 *
 * It names the sections, because one button now covers a screen taller than the
 * window. A marked field is no use to somebody who is looking at the pictures
 * and has no idea the year is the problem, so the message says where to look
 * and the marks say what to fix.
 */
function refusalMessage(errors: FieldErrors): string {
  const sections = troubledSections(errors);
  if (sections.length === 0) return 'Nothing was saved. Try again.';
  return `Nothing was saved. What needs something is marked, in ${inWords(sections)}.`;
}

export function ProjectForm({
  project,
  groups: savedGroups,
  drawings: savedDrawings,
  film: filmOnSite,
}: ProjectFormProps) {
  const { push } = useToast();

  /* Every editable thing on the screen, held here and nowhere else. The panels
     below render it and hand changes back. */
  const [values, setValues] = useState<FormValues>(() => initialValues(project));
  const [french, setFrench] = useState<ProjectFrench>(project.french);
  const [groups, setGroups] = useState<EditorGroup[]>(savedGroups);
  const [drawings, setDrawings] = useState<EditorDrawing[]>(savedDrawings);
  const [film, setFilm] = useState<EditorFilm | null>(filmOnSite);

  /* The film the site is actually showing. FilmEditor compares it against the
     one on screen to tell a film that has only been uploaded from one that has
     been saved, which is the difference between taking a film off and throwing
     away a compression that took four minutes and cannot be repeated from here. */
  const [savedFilm, setSavedFilm] = useState<EditorFilm | null>(filmOnSite);

  /* One map for the whole screen, keyed exactly as saveWholeProject keys it:
     bare names for the fields, groups.<group>.images.<image>.alt for pictures,
     drawings.<index>.alt for sheets, film and filmPoster for the walkthrough.
     It is handed down whole rather than sliced and renumbered on the way, since
     a renumbering step is somewhere for a message to get lost, and a message
     that lands nowhere is how this screen went wrong in the first place. */
  const [errors, setErrors] = useState<FieldErrors>({});
  const [warning, setWarning] = useState<string | null>(null);

  /* Off to begin with, on every project, translated or not. Doubling the boxes
     on a screen that is already two windows tall is a real cost to pay on an
     ordinary edit, and starting hidden costs nothing, because the French is
     saved by the same press either way and the strip says how much there is. */
  const [showFrench, setShowFrench] = useState(false);

  const [published, setPublished] = useState(project.published);

  /* What the site is serving, which is not what the toggle says the moment it
     is pressed. The badge reads from this so it cannot claim a project is on
     the site before the save that puts it there has run. */
  const [liveOnSite, setLiveOnSite] = useState(project.published);
  const { dirty: unsaved, markDirty, snapshot, settle } = useSaveFlag();
  const [saving, startSave] = useTransition();

  /* What the web address box holds right now, which is not what a save in
     flight is holding. That save closed over the values as they were when it
     built its payload, and the box stayed live for the whole round trip, so
     anything that has to reason about the box afterwards asks this. */
  const slugOnScreen = useRef(project.slug);

  /* The version this screen is answering. It moves forward on every save, or a
     second save from the same tab would be refused as stale by its own first. */
  const baseUpdatedAt = useRef(project.updatedAt);

  /* One claim for the whole screen, because there is one button. It covers
     closing the tab, reloading, and leaving the site. Clicking a link inside
     the admin is a client side route change the browser cannot see, so that
     case is GuardedLink's, below. */
  useRegisterUnsaved('project', unsaved);

  const update = useCallback(
    (changes: Partial<FormValues>) => {
      if (changes.slug !== undefined) slugOnScreen.current = changes.slug;
      setValues((current) => ({ ...current, ...changes }));
      markDirty();
    },
    [markDirty],
  );

  /* The French half of the same thing. Kept apart from the English values
     because it does not go to the same place: these words are written to the
     Translation table, and the project's own row stays the English. */
  const updateFrench = useCallback(
    (changes: Partial<ProjectFrench>) => {
      setFrench((current) => ({ ...current, ...changes }));
      markDirty();
    },
    [markDirty],
  );

  /**
   * The three lifted lists, each changed by a function of what is already
   * there rather than of what was there when the caller was rendered.
   *
   * That matters because an upload finishes minutes after it was started and
   * Ahmad keeps working while it runs. Handing back a finished array built from
   * the copy that existed when the files were dropped throws away every
   * description typed since, which looks exactly like the interface losing his
   * work. There is no stale array to build from when the contract is a
   * function, so the panels below cannot make that mistake.
   */
  const changeGroups = useCallback(
    (change: (current: EditorGroup[]) => EditorGroup[]) => {
      setGroups(change);
      markDirty();
    },
    [markDirty],
  );

  const changeDrawings = useCallback(
    (change: (current: EditorDrawing[]) => EditorDrawing[]) => {
      setDrawings(change);
      markDirty();
    },
    [markDirty],
  );

  const changeFilm = useCallback(
    (change: (current: EditorFilm | null) => EditorFilm | null) => {
      setFilm(change);
      markDirty();
    },
    [markDirty],
  );

  const chooseLeadImage = useCallback(
    (mediaId: string | null) => {
      update({ leadImageId: mediaId });
    },
    [update],
  );

  const changeLeadImageAlt = useCallback(
    (alt: string) => {
      update({ leadImageAlt: alt });
    },
    [update],
  );

  const changeFrenchLeadImageAlt = useCallback(
    (alt: string) => {
      updateFrench({ leadImageAlt: alt });
    },
    [updateFrench],
  );

  const save = useCallback(() => {
    /* The payload and the snapshot are taken together, in that order, so the
       number stands for exactly what is being sent and nothing later. An upload
       started ten minutes ago can land while this request is out, and its
       handler appends to a list this payload does not contain. The count then
       moves past the snapshot, settle declines to clear, and the badge and the
       guard stay up over the work that never went. */
    const payload = buildPayload(
      values,
      french,
      groups,
      drawings,
      film,
      published,
      baseUpdatedAt.current,
    );
    const at = snapshot();

    const found = collectErrors(payload);
    if (hasErrors(found)) {
      setErrors(found);
      push(refusalMessage(found), 'error');
      return;
    }

    startSave(async () => {
      const result = await runAction(() => saveWholeProject(project.id, payload));

      if (!result.ok) {
        const returned = result.errors ?? {};
        setErrors(returned);
        push(result.message ?? refusalMessage(returned), 'error');
        return;
      }

      setErrors({});
      setWarning(result.warning ?? null);
      /* What the site shows now is what this payload carried, not whatever is
         on screen by the time it answers. */
      setSavedFilm(payload.film === null ? null : film);
      setLiveOnSite(payload.published);
      /* Answer the next save with the version this one produced. */
      if (result.data?.updatedAt) baseUpdatedAt.current = result.data.updatedAt;
      settle(at);

      /* The web address that came back can differ from the one that was sent,
         because another project already had it. Showing the old one would leave
         him with a link that does not work, so it is worth writing back, but
         only into a box that still holds what was sent. The box is never
         disabled while the save runs, so it can just as easily hold something
         typed since, and that is his and not the server's to overwrite. */
      const savedSlug = result.data?.slug;
      if (savedSlug && savedSlug !== payload.fields.slug) {
        if (slugOnScreen.current === payload.fields.slug) {
          slugOnScreen.current = savedSlug;
          setValues((current) => ({ ...current, slug: savedSlug }));
          push(`Saved. Another project already used that web address, so this one is ${savedSlug}.`);
        } else {
          push(
            `Saved, but not at the web address you asked for: another project already used it, ` +
              `so this one is now ${savedSlug}. What you have since typed in the address box is ` +
              `still there, and still needs saving.`,
            'info',
          );
        }
        return;
      }

      push('Saved.');
    });
  }, [values, french, groups, drawings, film, published, project.id, push, snapshot, settle]);

  /* Putting a project on the site used to write immediately, on its own, which
     meant pressing it with an unsaved caption on screen published the caption
     as it used to be. Going live is not a separate thing from the edit that
     prompted it, so it now waits for the same button as everything else. */
  const togglePublished = useCallback(() => {
    setPublished((current) => !current);
    markDirty();
  }, [markDirty]);

  const { written: frenchWritten, total: frenchTotal } = countFrench(
    french,
    groups,
    drawings,
    film,
    values.leadImageId !== null,
  );

  return (
    <div className="grid gap-6">
      <div className="sticky top-0 z-20 -mx-6 flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-neutral-50/95 px-6 py-3 backdrop-blur">
        <div className="min-w-0">
          <GuardedLink
            href="/admin"
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            All projects
          </GuardedLink>
          <h1 className="truncate text-lg font-semibold">{values.title || 'Untitled project'}</h1>
        </div>

        <Badge variant={published ? 'secondary' : 'warning'}>
          {published === liveOnSite
            ? published
              ? 'On the site'
              : 'Not on the site'
            : published
              ? 'Goes on the site when you save'
              : 'Comes off the site when you save'}
        </Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {liveOnSite && (
            <a
              href={`/work/${project.slug}/`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
            >
              See the page
            </a>
          )}

          <Button type="button" variant="outline" onClick={togglePublished} disabled={saving}>
            {published ? 'Take it off the site' : 'Put it on the site'}
          </Button>

          {/* Beside the button rather than across the screen from it, so the
              badge and the thing that clears it read as one statement. */}
          {unsaved && <Badge variant="warning">Not saved yet</Badge>}

          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving' : 'Save everything'}
          </Button>
        </div>
      </div>

      {warning && (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {warning}
        </p>
      )}

      {/* One switch for the whole screen, in one place, saying what there is and
          what an empty box means. Every box cannot carry that sentence: it is
          the same sentence thirty times over, and it is not about any one of
          them. */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-medium text-sky-950">This project in French</p>
          <p className="mt-0.5 text-xs text-sky-900">
            {frenchWritten} of {frenchTotal} boxes written. Anything you leave empty shows in
            English on the French page, so you can translate as much or as little as you like. The
            grey words in a French box are the English it would show.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          aria-expanded={showFrench}
          onClick={() => setShowFrench((current) => !current)}
        >
          {showFrench ? 'Hide the French boxes' : 'Show the French boxes'}
        </Button>
      </div>

      <FrenchBoxes showing={showFrench}>
        <div className="grid items-start gap-10 lg:grid-cols-2">
          {/* Still a form, for the labelling and for Enter, but with no submit
              button of its own. The one button lives in the bar above, where it
              can save the pictures and the film as well, which no button inside
              this form could honestly claim to do. */}
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div>
              <Field label="Title" htmlFor="project-title" required error={errors.title}>
                <Input
                  value={values.title}
                  onChange={(event) => update({ title: event.target.value })}
                />
              </Field>

              <FrenchBox
                label="Title"
                htmlFor="project-title-fr"
                english={values.title}
                value={french.title}
                onChange={(value) => updateFrench({ title: value })}
              />
            </div>

            {/* No French box on the web address, and none on the sheet number,
                the year, the category or the status. An address is the same
                string in both languages and translating it would break the link;
                the rest are either numbers or fixed values the site translates
                for itself, which is not work to hand to Ahmad. */}
            <Field
              label="Web address"
              htmlFor="project-slug"
              required
              error={errors.slug}
              hint="This is the end of the page's address on the internet. Changing it changes where the page lives, so any link to the old address, in an email you have sent or on somebody else's site, stops working."
            >
              <Input value={values.slug} onChange={(event) => update({ slug: event.target.value })} />
            </Field>

            <div>
              <Field
                label="Summary"
                htmlFor="project-summary"
                required
                error={errors.summary}
                hint="One or two sentences. This is what shows under the title and on the card."
              >
                <Textarea
                  rows={3}
                  value={values.summary}
                  onChange={(event) => update({ summary: event.target.value })}
                />
              </Field>

              <FrenchBox
                label="Summary"
                htmlFor="project-summary-fr"
                english={values.summary}
                value={french.summary}
                onChange={(value) => updateFrench({ summary: value })}
                rows={3}
              />
            </div>

            <div>
              <Field
                label="What you did on it"
                htmlFor="project-contribution"
                required
                error={errors.contribution}
                hint="Kept separate from the summary on purpose. On a team project this is the part that says which work was yours."
              >
                <Textarea
                  rows={3}
                  value={values.contribution}
                  onChange={(event) => update({ contribution: event.target.value })}
                />
              </Field>

              <FrenchBox
                label="What you did on it"
                htmlFor="project-contribution-fr"
                english={values.contribution}
                value={french.contribution}
                onChange={(value) => updateFrench({ contribution: value })}
                rows={3}
              />
            </div>

            <div>
              <Field
                label="Who did the work"
                htmlFor="project-credit"
                required
                error={errors.credit}
                hint="The short line on the card, for example: with Studio Name, or Solo academic project."
              >
                <Input
                  value={values.credit}
                  onChange={(event) => update({ credit: event.target.value })}
                />
              </Field>

              <FrenchBox
                label="Who did the work"
                htmlFor="project-credit-fr"
                english={values.credit}
                value={french.credit}
                onChange={(value) => updateFrench({ credit: value })}
              />
            </div>

            <div>
              <Field
                label="The long description"
                htmlFor="project-body"
                error={errors.body}
                hint="Markdown works here. A line starting with ## is a heading, and text wrapped in **two stars** comes out bold."
              >
                <Textarea
                  rows={10}
                  value={values.body}
                  onChange={(event) => update({ body: event.target.value })}
                />
              </Field>

              <FrenchBox
                label="The long description"
                htmlFor="project-body-fr"
                english={values.body}
                value={french.body}
                onChange={(value) => updateFrench({ body: value })}
                rows={10}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Category" htmlFor="project-category" required error={errors.category}>
                <Select
                  value={values.category}
                  onChange={(event) => update({ category: event.target.value })}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Status" htmlFor="project-status" required error={errors.status}>
                <Select
                  value={values.status}
                  onChange={(event) => update({ status: event.target.value })}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Year" htmlFor="project-year" required error={errors.year}>
                <Input
                  inputMode="numeric"
                  value={values.year}
                  onChange={(event) => update({ year: event.target.value })}
                />
              </Field>

              <Field
                label="Sheet number"
                htmlFor="project-sheet"
                required
                error={errors.sheet}
                hint="Sheet numbers look like A-101."
              >
                <Input
                  value={values.sheet}
                  onChange={(event) => update({ sheet: event.target.value })}
                />
              </Field>

              <div>
                <Field
                  label="Where it is"
                  htmlFor="project-location"
                  required
                  error={errors.location}
                >
                  <Input
                    value={values.location}
                    onChange={(event) => update({ location: event.target.value })}
                  />
                </Field>

                <FrenchBox
                  label="Where it is"
                  htmlFor="project-location-fr"
                  english={values.location}
                  value={french.location}
                  onChange={(value) => updateFrench({ location: value })}
                />
              </div>

              <div>
                <Field
                  label="Kind of building"
                  htmlFor="project-buildingType"
                  required
                  error={errors.buildingType}
                >
                  <Input
                    value={values.buildingType}
                    onChange={(event) => update({ buildingType: event.target.value })}
                  />
                </Field>

                <FrenchBox
                  label="Kind of building"
                  htmlFor="project-buildingType-fr"
                  english={values.buildingType}
                  value={french.buildingType}
                  onChange={(value) => updateFrench({ buildingType: value })}
                />
              </div>

              <div>
                <Field
                  label="Size"
                  htmlFor="project-area"
                  error={errors.area}
                  hint="Optional, for example 2,400 m2."
                >
                  <Input
                    value={values.area}
                    onChange={(event) => update({ area: event.target.value })}
                  />
                </Field>

                {/* A size is usually a number and a unit and needs nothing doing
                    to it, but not always: several of these read "about 2,400 m2
                    over three floors", and those are words. */}
                <FrenchBox
                  label="Size"
                  htmlFor="project-area-fr"
                  english={values.area}
                  value={french.area}
                  onChange={(value) => updateFrench({ area: value })}
                />
              </div>

              <div>
                <Field label="Your role" htmlFor="project-role" required error={errors.role}>
                  <Input
                    value={values.role}
                    onChange={(event) => update({ role: event.target.value })}
                  />
                </Field>

                <FrenchBox
                  label="Your role"
                  htmlFor="project-role-fr"
                  english={values.role}
                  value={french.role}
                  onChange={(value) => updateFrench({ role: value })}
                />
              </div>
            </div>

            <Field
              label="Where it sits on the home page"
              htmlFor="project-tier"
              required
              error={errors.tier}
              hint="Only three projects can be one of the large cards. A fourth moves into the strip instead, and you are told when that happens."
            >
              <Select value={values.tier} onChange={(event) => update({ tier: event.target.value })}>
                {TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_LABELS[tier]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Position"
              htmlFor="project-order"
              error={errors.order}
              hint="Lower numbers come first. You can also drag projects into order on the projects list."
            >
              <Input
                inputMode="numeric"
                value={values.order}
                onChange={(event) => update({ order: event.target.value })}
              />
            </Field>
          </form>

          <div className="grid gap-10">
            <MediaPanel
              slug={project.slug}
              groups={groups}
              drawings={drawings}
              errors={errors}
              onGroupsChange={changeGroups}
              onDrawingsChange={changeDrawings}
              leadImageId={values.leadImageId}
              leadImageAlt={values.leadImageAlt}
              leadImage={project.leadImage}
              onLeadImageChange={chooseLeadImage}
              onLeadImageAltChange={changeLeadImageAlt}
              frenchLeadImageAlt={french.leadImageAlt}
              onFrenchLeadImageAltChange={changeFrenchLeadImageAlt}
            />

            <FilmEditor film={film} savedFilm={savedFilm} errors={errors} onChange={changeFilm} />
          </div>
        </div>
      </FrenchBoxes>
    </div>
  );
}
