'use client';

import Image from 'next/image';
import { Plus, X } from 'lucide-react';
import {
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { DocumentSlot } from '@/components/admin/ContactForm';
import { Dropzone } from '@/components/admin/Dropzone';
import { GuardedLink } from '@/components/admin/GuardedLink';
/* The project screen's French boxes, used here as they are. Two screens that
   invented their own would be two answers to the same question in front of the
   same person; the file is named after where it was written first, and is the
   right thing to rename if a third screen wants it. */
import { FrenchBox, FrenchBoxes } from '@/components/admin/ProjectFrench';
import { SortableList } from '@/components/admin/SortableList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { useSaveFlag } from '@/hooks/use-save-flag';
import type { UploadedItem } from '@/hooks/use-uploads';
import { runAction } from '@/lib/action-result';
import {
  saveProfile,
  saveResumeLists,
  type ProfileInput,
  type ResumeLists,
} from '@/lib/mutations';
import { formatBytes } from '@/lib/upload-policy';
import { hasErrors, validateProfile, type FieldErrors } from '@/lib/validation';

/**
 * The resume screen, in two halves with two save buttons.
 *
 * Two buttons rather than one because there are two writes underneath, and they
 * are not interchangeable: saveProfile upserts a single row, saveResumeLists
 * deletes every list and writes it again. One button over both would mean a
 * corrected job title rewriting seven tables, and a half finished list being
 * republished because a detail above it changed.
 *
 * What the contact page says is not edited here any more, it is edited on the
 * Contact screen, and that includes the contact details shared across pages: the
 * email address, the telephone number and where he is. The PDFs are also editable here. They are
 * still sent by both saves, exactly as this page loaded them, because
 * saveProfile writes the whole row and saveResumeLists rewrites every list. A
 * value left out of a payload is not left alone, it is erased. The cost is a
 * narrow one: saving here after editing the contact screen in another tab puts
 * the older contact details back, because this tab is still holding the values
 * it opened with.
 *
 * Every list keeps a local uid on each row. The rows in the database have no
 * stable identity across a save, since the save deletes and recreates them, so
 * a database id would change under a React key on every save and take the
 * focused field with it.
 *
 * Nothing here is loaded into state by an effect. The lists arrive as props and
 * are read once by the useState initialiser, which is what keeps a background
 * refresh from throwing away half typed work.
 *
 * The French rides along in both payloads, under `french`, and is described
 * where those types are declared below. It is not a third save: a sentence and
 * its translation are one edit, and two buttons over one edit is how half of it
 * gets left behind.
 */

// ------------------------------------------------------------------ types ---

/** One file in the library, as much of it as an editing screen needs. */
export interface FileRef {
  id: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Exactly what getProfile returns, declared here rather than imported from
 * src/lib/queries.ts, because that module is server only. The shape getProfile
 * returns satisfies it, so a page hands its result straight over.
 *
 * The contact screen reads the same thing and imports this type rather than
 * writing a second copy of it. Both screens need all of it, not just their own
 * half, because both of their saves rewrite everything they touch.
 */
export interface ProfileData {
  profile: {
    name: string;
    discipline: string;
    credential: string;
    registration: string;
    location: string;
    yearsExperience: string;
    availability: string;
    issued: string;
    welcome: string;
    positioning: string;
    longBio: string[];
    portraitMedia: FileRef | null;
    portraitAlt: string;
    cvMedia: FileRef | null;
    portfolioMedia: FileRef | null;
    email: string;
    phone: string;
    references: string;
    contactStatus: string;
    contactHeading: string;
    contactBlurb: string;
  } | null;
  facts: { label: string; items: string[] }[];
  social: { label: string; href: string }[];
  experience: {
    role: string;
    firm: string;
    location: string;
    period: string;
    contributions: string[];
  }[];
  education: { credential: string; institution: string; year: string; note: string | null }[];
  skillGroups: { label: string; items: { name: string }[] }[];
  languages: { text: string }[];
  entries: { section: string; title: string; detail: string; year: string }[];
}

// --------------------------------------------------------------- français ---

/**
 * A field of the profile row that has a French box on one of the three screens
 * that edit the profile: Home, Contact and this one.
 *
 * Only sentences are here. A name, an email address, a telephone number, a year
 * and the name of a firm read the same in both languages, so a box for them
 * would be a box Ahmad has to decide about seventeen times and leave empty
 * seventeen times.
 *
 * The About block is a list of paragraphs held in one field, and a translation
 * is one value of one field, so its French is numbered paragraph by paragraph.
 * That way a French paragraph written for the second one falls back to the
 * second English paragraph and not to the whole block.
 */
export type ProfileFrenchField =
  | 'discipline'
  | 'location'
  | 'welcome'
  | 'availability'
  | 'contactStatus'
  | 'contactHeading'
  | 'contactBlurb'
  | 'credential'
  | 'registration'
  | 'yearsExperience'
  | 'issued'
  | 'positioning'
  | 'portraitAlt'
  | 'references'
  | `longBio.${number}`;

/**
 * The French for the profile row, by field.
 *
 * A screen sends the fields it shows and no others, which is the one place the
 * whole row rule below does not apply. saveTranslations writes a field it is
 * handed and leaves alone a field it is not, so the Home screen saving three
 * sentences cannot empty the French of the contact page. A field sent blank is
 * a translation Ahmad deleted, and is deleted.
 */
export type ProfileFrench = Partial<Record<ProfileFrenchField, string>>;

/**
 * The French for the resume lists, one entry per English entry, in the same
 * order.
 *
 * Position rather than row id, because saveResumeLists deletes every list and
 * writes it again: the row an editing screen is looking at has no id yet that
 * will still exist after the save. The action pairs its own new rows with these
 * by position, which it can do because it wrote both.
 *
 * A whole list left out is a list this screen is not translating, and its
 * French is carried across to the new rows untouched. Not the same as an empty
 * array, which says Ahmad cleared every French box in it.
 */
export interface ResumeListsFrench {
  facts?: { label: string; items: string[] }[];
  social?: { label: string }[];
  experience?: { role: string; location: string; period: string; contributions: string[] }[];
  education?: { credential: string; institution: string; note: string }[];
  skillGroups?: { label: string; items: string[] }[];
  languages?: string[];
  entries?: { title: string; detail: string }[];
}

/**
 * Everything French these screens open with, read from the Translation table.
 *
 * The lists are in the same order as the lists in ProfileData beside them,
 * because that position is what pairs a translation with its row. This screen
 * and the Contact screen take the pair; the Home screen has no lists on it and
 * takes the profile half on its own.
 *
 * A screen given none of this shows no French boxes at all, rather than empty
 * ones: it cannot show Ahmad what he has already written, so it must not invite
 * him to write more, and it says nothing about the translations when it saves.
 */
export interface FrenchData {
  profile: ProfileFrench;
  lists: ResumeListsFrench;
}

/**
 * What these screens hand the two profile writes, and what those writes owe
 * back. saveProfile and saveResumeLists are not edited by this lane, so the
 * contract is written here, where the payloads are built.
 *
 * saveProfile, once the row is upserted, must:
 *   saveTranslations('fr', 'Profile', 'profile', input.french)
 * The row id is the fixed 'profile'. It must also clear any longBio.N whose N
 * is at or past the number of paragraphs it just wrote, or a paragraph Ahmad
 * removed leaves its French behind for the next paragraph to inherit.
 *
 * saveResumeLists, which deletes every list and writes it again, must:
 *   1. before deleting, read the ids of every row it is about to delete and
 *      forgetTranslations them, for Fact, SocialLink, ExperienceEntry,
 *      EducationEntry, SkillGroup, Skill, Language and ResumeEntry. Nothing in
 *      the database removes a translation when its row goes, and a cuid handed
 *      out again is not a risk worth taking.
 *   2. after writing, read each list back by its own `order` ascending, which
 *      is the order it was just handed, and pair it by position with the French
 *      array of the same name, then saveTranslations per row against the id it
 *      has just created. Ordering the resume entries by section first, the way
 *      the reading query does, would pair the awards with the volunteering's
 *      French. The fields are the ones named in ResumeListsFrench; a skill's
 *      French name is its own row, model 'Skill', field 'name'; a Fact's lines
 *      are items.0, items.1 and so on, and an experience entry's bullet points
 *      contributions.0 and up.
 *   3. carry across, rather than drop, the French of any list the payload left
 *      out, and of any position past the end of a French array that is shorter
 *      than its English list. The ids changed for the action's own reasons, not
 *      because Ahmad asked, so losing French to that churn would be the action's
 *      fault and not the screen's.
 *
 * Both must regenerate the French addresses as well as the English ones, or the
 * French page keeps serving the translation it was built with.
 *
 * `french` is absent altogether from a screen that was not handed the French to
 * begin with. That screen shows no French boxes, so it has nothing to say about
 * the translations, and a payload of blanks would read as Ahmad having cleared
 * every one of them. Absent means leave all of it exactly as it is.
 */
export type ProfileSave = ProfileInput & { french?: ProfileFrench };
export type ResumeListsSave = ResumeLists & { french?: ResumeListsFrench };

// ------------------------------------------------------------------ rows ---

type Section = 'volunteering' | 'awards' | 'publications' | 'exhibitions';

/**
 * One line of a list, with its French beside it.
 *
 * The French rides on the row rather than in a second array, so dragging a
 * paragraph, removing a bullet point or adding a skill moves or removes its
 * translation with it. Two arrays kept in step by index is exactly the kind of
 * bookkeeping that ends with a French sentence under the wrong English one.
 */
interface TextRow {
  uid: string;
  text: string;
  french: string;
}

interface FactRow {
  uid: string;
  label: string;
  french: { label: string };
  items: TextRow[];
}

interface ExperienceRow {
  uid: string;
  role: string;
  firm: string;
  location: string;
  period: string;
  french: { role: string; location: string; period: string };
  contributions: TextRow[];
}

interface EducationRow {
  uid: string;
  credential: string;
  institution: string;
  year: string;
  note: string;
  french: { credential: string; institution: string; note: string };
}

interface SkillGroupRow {
  uid: string;
  label: string;
  french: { label: string };
  items: TextRow[];
}

interface EntryRow {
  uid: string;
  title: string;
  detail: string;
  year: string;
  french: { title: string; detail: string };
}

/**
 * The boxes in the top half of this screen.
 *
 * Shorter than the profile row it belongs to. Where he is, his email address,
 * his telephone number, the line about what he is looking for, the words on the
 * contact page and the two PDFs are all edited on the Contact screen now, so
 * they are not fields here. The save still sends them, straight through from
 * what the page loaded with.
 */
type ProfileFields = {
  name: string;
  discipline: string;
  credential: string;
  registration: string;
  yearsExperience: string;
  issued: string;
  welcome: string;
  positioning: string;
  portraitAlt: string;
  references: string;
};

/**
 * The French boxes in that half.
 *
 * Shorter than the English list beside it. A name has no French, and what he
 * does and his greeting are translated on the Home screen, where the visitor
 * meets them, so that no field is typed in French in two places.
 */
type ProfileFrenchFields = {
  credential: string;
  registration: string;
  yearsExperience: string;
  issued: string;
  positioning: string;
  portraitAlt: string;
  references: string;
};

// ---------------------------------------------------------------- helpers ---

let rowCounter = 0;

/** A key for one row of one list, stable for as long as the row is on screen. */
function nextUid(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

/** Lines and their French, paired off by position and short of nothing. */
function toTextRows(values: string[], french: string[] = []): TextRow[] {
  return values.map((text, index) => ({ uid: nextUid(), text, french: french[index] ?? '' }));
}

/** The French of a list of lines, in the order the boxes are on screen. */
function frenchOf(rows: TextRow[]): string[] {
  return rows.map((row) => row.french);
}

/** The About paragraphs' French, which is held one numbered field per paragraph. */
function longBioFrench(french: ProfileFrench, count: number): string[] {
  return Array.from({ length: count }, (_, index) => french[`longBio.${index}`] ?? '');
}

/** The same, on the way back out. */
function longBioFields(rows: TextRow[]): ProfileFrench {
  const fields: ProfileFrench = {};
  rows.forEach((row, index) => {
    fields[`longBio.${index}`] = row.french;
  });
  return fields;
}

function replace<T>(rows: T[], index: number, next: T): T[] {
  return rows.map((row, i) => (i === index ? next : row));
}

function without<T>(rows: T[], index: number): T[] {
  return rows.filter((_, i) => i !== index);
}

function reorder<T extends { uid: string }>(rows: T[], idsInOrder: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.uid, row]));
  return idsInOrder.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

const SECTIONS: { id: Section; title: string; description: string }[] = [
  {
    id: 'volunteering',
    title: 'Community and volunteering',
    description: 'These appear on the resume page under the heading Community.',
  },
  {
    id: 'awards',
    title: 'Awards',
    description: 'Kept here and ready to use. No page shows these yet.',
  },
  {
    id: 'publications',
    title: 'Publications',
    description: 'Kept here and ready to use. No page shows these yet.',
  },
  {
    id: 'exhibitions',
    title: 'Exhibitions',
    description: 'Kept here and ready to use. No page shows these yet.',
  },
];

/**
 * The items of one section, with their French.
 *
 * The French arrives as one array over all four sections, in the order the
 * items themselves arrived, so the position in that whole array is what pairs
 * an item with its translation. Filtering first and pairing afterwards would
 * hand the awards their volunteering French.
 */
function entryRowsFor(
  all: ProfileData['entries'],
  section: Section,
  french: NonNullable<ResumeListsFrench['entries']>,
): EntryRow[] {
  return all.flatMap((entry, index) =>
    entry.section === section
      ? [
          {
            uid: nextUid(),
            title: entry.title,
            detail: entry.detail,
            year: entry.year,
            french: {
              title: french[index]?.title ?? '',
              detail: french[index]?.detail ?? '',
            },
          },
        ]
      : [],
  );
}

/** The first ordinary file in a batch. Neither dropzone here accepts video. */
function firstFile(items: UploadedItem[]): FileRef | null {
  for (const item of items) {
    if (item.kind !== 'film') return item.media;
  }
  return null;
}

/** The name Ahmad gave the file, read back off the end of its object key. */
function fileName(key: string): string {
  const last = key.split('/').pop() ?? key;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * The first blank heading in a list, said as a sentence.
 *
 * A row with no heading is not rejected by the save, it is simply written as an
 * empty block, and an empty block is a gap on the public page that takes a while
 * to trace back to here.
 */
function blankIn(section: string, noun: string, values: string[], what: string): string | null {
  const index = values.findIndex((value) => value.trim() === '');
  if (index === -1) return null;
  return `${noun} ${index + 1} under ${section} has no ${what}. Fill it in, or remove it, then save again.`;
}

/** A, B and C. */
function said(items: string[]): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What the contact screen owns and this save still insists on.
 *
 * saveProfile checks the whole row, and the whole row includes three boxes that
 * are not on this screen any more. Without this the save would be refused with
 * nothing marked and nothing here to correct.
 */
const ON_THE_CONTACT_SCREEN: Record<string, string> = {
  location: 'where you are',
  email: 'your email address',
  phone: 'your telephone number',
};

function contactProblem(errors: FieldErrors): string | null {
  const missing = Object.keys(errors)
    .filter((field) => field in ON_THE_CONTACT_SCREEN)
    .map((field) => ON_THE_CONTACT_SCREEN[field]);

  if (missing.length === 0) return null;
  return `Something on the Contact screen is still blank: ${said(missing)}. This save needs it. Fill it in there, then save here again.`;
}

/**
 * A setter that also marks its half of the screen as unsaved.
 *
 * Wrapping the setter rather than each of the fifty or so places that call one
 * is what makes the flag exhaustive. A field wired to a wrapped setter is
 * covered the moment it is written, and no call site is left that can change a
 * savable value quietly, which is the whole failure this guards against: the
 * badge stays off, the leave warning never arms, and the work goes.
 *
 * markDirty is the save flag's own, so every edit also bumps the counter a save
 * in flight is measured against. That is what stops a save that left before the
 * edit from reporting the edit as saved when it comes back.
 */
function marking<T>(
  set: Dispatch<SetStateAction<T>>,
  markDirty: () => void,
): Dispatch<SetStateAction<T>> {
  return (next) => {
    markDirty();
    set(next);
  };
}

// ------------------------------------------------------------ the screen ---

export function ResumeForm({ data, french, portraitImages = [] }: {
  data: ProfileData;
  french?: FrenchData;
  portraitImages?: (FileRef & { originalName: string })[];
}) {
  const { push } = useToast();

  /* Read once, like everything else on this screen, and empty until the page
     that renders it hands over what the Translation table holds. */
  const frenchProfile = french?.profile ?? {};
  const frenchLists = french?.lists ?? {};

  // One flag for each save button, because the two halves are written by two
  // separate actions and saving one leaves the other exactly as unsaved as it
  // was. A single flag would clear the badge over work that is still only on
  // the page, which is the trap this screen already sets by having the header
  // say the halves are independent.
  //
  // Each is a save flag rather than a boolean because this is the longest form
  // in the product and its two writes are the slowest, so the seconds between a
  // payload leaving and its answer arriving are seconds Ahmad spends still
  // typing. A boolean cleared on success would call all of that saved.
  const profileFlag = useSaveFlag();
  const listsFlag = useSaveFlag();

  useRegisterUnsaved('resume:profile', profileFlag.dirty);
  useRegisterUnsaved('resume:lists', listsFlag.dirty);

  const [fields, setFieldsState] = useState<ProfileFields>(() => ({
    name: data.profile?.name ?? '',
    discipline: data.profile?.discipline ?? '',
    credential: data.profile?.credential ?? '',
    registration: data.profile?.registration ?? '',
    yearsExperience: data.profile?.yearsExperience ?? '',
    issued: data.profile?.issued ?? '',
    welcome: data.profile?.welcome ?? '',
    positioning: data.profile?.positioning ?? '',
    portraitAlt: data.profile?.portraitAlt ?? '',
    references: data.profile?.references ?? '',
  }));

  const [frenchFields, setFrenchFieldsState] = useState<ProfileFrenchFields>(() => ({
    credential: frenchProfile.credential ?? '',
    registration: frenchProfile.registration ?? '',
    yearsExperience: frenchProfile.yearsExperience ?? '',
    issued: frenchProfile.issued ?? '',
    positioning: frenchProfile.positioning ?? '',
    portraitAlt: frenchProfile.portraitAlt ?? '',
    references: frenchProfile.references ?? '',
  }));

  const [longBio, setLongBioState] = useState<TextRow[]>(() => {
    const paragraphs = data.profile?.longBio ?? [];
    return toTextRows(paragraphs, longBioFrench(frenchProfile, paragraphs.length));
  });
  const [portrait, setPortraitState] = useState<FileRef | null>(
    () => data.profile?.portraitMedia ?? null,
  );

  const portraitChoices =
    portrait && !portraitImages.some((image) => image.id === portrait.id)
      ? [{ ...portrait, originalName: fileName(portrait.key) }, ...portraitImages]
      : portraitImages;
  const [cv, setCvState] = useState<FileRef | null>(() => data.profile?.cvMedia ?? null);
  const [portfolio, setPortfolioState] = useState<FileRef | null>(() => data.profile?.portfolioMedia ?? null);

  const [facts, setFactsState] = useState<FactRow[]>(() =>
    data.facts.map((fact, index) => ({
      uid: nextUid(),
      label: fact.label,
      french: { label: frenchLists.facts?.[index]?.label ?? '' },
      items: toTextRows(fact.items, frenchLists.facts?.[index]?.items),
    })),
  );
  const [experience, setExperienceState] = useState<ExperienceRow[]>(() =>
    data.experience.map((entry, index) => ({
      uid: nextUid(),
      role: entry.role,
      firm: entry.firm,
      location: entry.location,
      period: entry.period,
      french: {
        role: frenchLists.experience?.[index]?.role ?? '',
        location: frenchLists.experience?.[index]?.location ?? '',
        period: frenchLists.experience?.[index]?.period ?? '',
      },
      contributions: toTextRows(entry.contributions, frenchLists.experience?.[index]?.contributions),
    })),
  );
  const [education, setEducationState] = useState<EducationRow[]>(() =>
    data.education.map((entry, index) => ({
      uid: nextUid(),
      credential: entry.credential,
      institution: entry.institution,
      year: entry.year,
      note: entry.note ?? '',
      french: {
        credential: frenchLists.education?.[index]?.credential ?? '',
        institution: frenchLists.education?.[index]?.institution ?? '',
        note: frenchLists.education?.[index]?.note ?? '',
      },
    })),
  );
  const [skillGroups, setSkillGroupsState] = useState<SkillGroupRow[]>(() =>
    data.skillGroups.map((group, index) => ({
      uid: nextUid(),
      label: group.label,
      french: { label: frenchLists.skillGroups?.[index]?.label ?? '' },
      items: toTextRows(
        group.items.map((item) => item.name),
        frenchLists.skillGroups?.[index]?.items,
      ),
    })),
  );
  const [languages, setLanguagesState] = useState<TextRow[]>(() =>
    toTextRows(
      data.languages.map((language) => language.text),
      frenchLists.languages,
    ),
  );
  const [entries, setEntriesState] = useState<Record<Section, EntryRow[]>>(() => {
    const said = frenchLists.entries ?? [];
    return {
      volunteering: entryRowsFor(data.entries, 'volunteering', said),
      awards: entryRowsFor(data.entries, 'awards', said),
      publications: entryRowsFor(data.entries, 'publications', said),
      exhibitions: entryRowsFor(data.entries, 'exhibitions', said),
    };
  });

  /* Hidden until asked for. This screen is the longest in the product, and a
     French box under every box on it would make an ordinary correction to a job
     title a long scroll past work he is not doing today. Presentation only: the
     French is in state and goes out with the save whether the boxes are showing
     or not. */
  const [showFrench, setShowFrench] = useState(false);

  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [listsNotice, setListsNotice] = useState<string | null>(null);
  const [savingProfile, startProfileSave] = useTransition();
  const [savingLists, startListsSave] = useTransition();

  // Every savable value on this screen is written through one of these rather
  // than through its setter directly, so marking the right half unsaved is not
  // something a call site can forget. The top group is what Save your details
  // writes, the bottom group is what Save the lists writes, and nothing
  // belongs to both.
  const setFields = marking(setFieldsState, profileFlag.markDirty);
  const setFrenchFields = marking(setFrenchFieldsState, profileFlag.markDirty);
  const setLongBio = marking(setLongBioState, profileFlag.markDirty);
  const setPortrait = marking(setPortraitState, profileFlag.markDirty);
  const setCv = marking(setCvState, profileFlag.markDirty);
  const setPortfolio = marking(setPortfolioState, profileFlag.markDirty);

  const setFacts = marking(setFactsState, listsFlag.markDirty);
  const setExperience = marking(setExperienceState, listsFlag.markDirty);
  const setEducation = marking(setEducationState, listsFlag.markDirty);
  const setSkillGroups = marking(setSkillGroupsState, listsFlag.markDirty);
  const setLanguages = marking(setLanguagesState, listsFlag.markDirty);
  const setEntries = marking(setEntriesState, listsFlag.markDirty);

  const setField = (field: keyof ProfileFields, value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  const setFrenchField = (field: keyof ProfileFrenchFields, value: string) =>
    setFrenchFields((current) => ({ ...current, [field]: value }));

  const setEntrySection = (section: Section, rows: EntryRow[]) =>
    setEntries((current) => ({ ...current, [section]: rows }));

  function onSaveProfile() {
    // Taken before the payload is read out of state, and handed to settle when
    // the answer comes back. Anything typed into these boxes in between bumps
    // the counter past this number, settle then leaves the badge up, and the
    // work that never went is still marked as work.
    const at = profileFlag.snapshot();
    const profile = data.profile;

    const input: ProfileSave = {
      ...fields,
      longBio: longBio.map((row) => row.text),
      portraitMediaId: portrait?.id ?? null,

      /* Everything the contact screen owns, exactly as this page loaded it.
         saveProfile upserts the whole row, so a field left out of this object
         is not left alone, it is written back empty. */
      location: profile?.location ?? '',
      availability: profile?.availability ?? '',
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
      contactStatus: profile?.contactStatus ?? '',
      contactHeading: profile?.contactHeading ?? '',
      contactBlurb: profile?.contactBlurb ?? '',
      cvMediaId: cv?.id ?? null,
      portfolioMediaId: portfolio?.id ?? null,

      /* Only the French of the boxes on this screen, and that is not the whole
         row rule failing. A translation is a row of its own per field, so a
         field this payload does not name is left exactly as it was, and one it
         names with nothing is one Ahmad emptied on purpose.

         Left out entirely when this screen was handed no French: it has no
         French boxes then, and blanks from a screen that never showed him a box
         would delete translations he never saw. */
      ...(french && {
        french: {
          credential: frenchFields.credential,
          registration: frenchFields.registration,
          yearsExperience: frenchFields.yearsExperience,
          issued: frenchFields.issued,
          positioning: frenchFields.positioning,
          portraitAlt: frenchFields.portraitAlt,
          references: frenchFields.references,
          ...longBioFields(longBio),
        },
      }),
    };

    // Checked here first so an empty box says so straight away rather than
    // after a round trip. The same rules run again on the server.
    const found = validateProfile(input);
    if (hasErrors(found)) {
      const elsewhere = contactProblem(found);
      setProfileErrors(found);
      setProfileNotice(elsewhere);
      push(
        elsewhere
          ? 'This cannot be saved yet. The note at the top says why.'
          : 'A few of your details still need filling in. They are marked below.',
        'error',
      );
      return;
    }

    startProfileSave(async () => {
      const result = await runAction(() => saveProfile(input));

      if (!result.ok) {
        const back = result.errors ?? {};
        setProfileErrors(back);
        setProfileNotice(contactProblem(back));
        push(result.message ?? 'Your details were not saved. Check the boxes marked below.', 'error');
        return;
      }

      setProfileErrors({});
      setProfileNotice(result.warning ?? null);
      profileFlag.settle(at);
      push('Your details are saved.');
    });
  }

  function onSaveLists() {
    // The same reading, taken before the lists are read out of state. This half
    // is the slower of the two, since the write deletes every list and puts it
    // back, so the window in which a row can be typed into or dragged while the
    // save is out is the wider one.
    const at = listsFlag.snapshot();

    const problem =
      blankIn('At a glance', 'Block', facts.map((fact) => fact.label), 'heading') ??
      blankIn('Experience', 'Role', experience.map((entry) => entry.role), 'job title') ??
      blankIn(
        'Education',
        'Qualification',
        education.map((entry) => entry.credential),
        'name',
      ) ??
      blankIn('Skills', 'Group', skillGroups.map((group) => group.label), 'heading') ??
      SECTIONS.reduce<string | null>(
        (found, section) =>
          found ??
          blankIn(section.title, 'Item', entries[section.id].map((entry) => entry.title), 'title'),
        null,
      );

    if (problem) {
      setListsNotice(problem);
      push('One of the lists is not finished yet. The note at the top says which.', 'error');
      return;
    }

    const lists: ResumeListsSave = {
      facts: facts.map((fact) => ({
        label: fact.label,
        items: fact.items.map((item) => item.text),
      })),
      /* The links under Elsewhere, exactly as this page loaded them. They are
         edited on the Contact screen, and saveResumeLists deletes every list
         and writes it again, so leaving them out would not leave them alone, it
         would delete them. */
      social: data.social.map((link) => ({ label: link.label, href: link.href })),
      experience: experience.map((entry) => ({
        role: entry.role,
        firm: entry.firm,
        location: entry.location,
        period: entry.period,
        contributions: entry.contributions.map((line) => line.text),
      })),
      education: education.map((entry) => ({
        credential: entry.credential,
        institution: entry.institution,
        year: entry.year,
        note: entry.note,
      })),
      skillGroups: skillGroups.map((group) => ({
        label: group.label,
        items: group.items.map((item) => item.text),
      })),
      languages: languages.map((language) => language.text),
      entries: SECTIONS.flatMap((section) =>
        entries[section.id].map((entry) => ({
          section: section.id,
          title: entry.title,
          detail: entry.detail,
          year: entry.year,
        })),
      ),

      /* Each of these is in step with the English list of the same name above,
         entry for entry, because that position is the only handle on a row this
         screen has: the save deletes every list and writes it again, so no id
         it could send would still exist afterwards.

         Left out entirely when this screen was handed no French, for the same
         reason the details above are. */
      ...(french && {
        french: {
          facts: facts.map((fact) => ({
            label: fact.french.label,
            items: frenchOf(fact.items),
          })),
          /* The French of the links under Elsewhere, exactly as this page
             loaded it, for the same reason the English is passed through. */
          social: frenchLists.social,
          experience: experience.map((entry) => ({
            role: entry.french.role,
            location: entry.french.location,
            period: entry.french.period,
            contributions: frenchOf(entry.contributions),
          })),
          education: education.map((entry) => ({
            credential: entry.french.credential,
            institution: entry.french.institution,
            note: entry.french.note,
          })),
          skillGroups: skillGroups.map((group) => ({
            label: group.french.label,
            items: frenchOf(group.items),
          })),
          languages: frenchOf(languages),
          entries: SECTIONS.flatMap((section) =>
            entries[section.id].map((entry) => ({
              title: entry.french.title,
              detail: entry.french.detail,
            })),
          ),
        },
      }),
    };

    startListsSave(async () => {
      const result = await runAction(() => saveResumeLists(lists));

      if (!result.ok) {
        push(result.message ?? 'The lists were not saved. Try again in a moment.', 'error');
        return;
      }

      setListsNotice(result.warning ?? null);
      listsFlag.settle(at);
      push('Your resume lists are saved.');
    });
  }

  /* Every French box on the screen, so the strip at the top can say how far the
     translation has got whether the boxes are showing or not. */
  const frenchBoxes = [
    frenchFields.credential,
    frenchFields.registration,
    frenchFields.yearsExperience,
    frenchFields.issued,
    frenchFields.positioning,
    frenchFields.portraitAlt,
    frenchFields.references,
    ...frenchOf(longBio),
    ...facts.flatMap((fact) => [fact.french.label, ...frenchOf(fact.items)]),
    ...experience.flatMap((entry) => [
      entry.french.role,
      entry.french.location,
      entry.french.period,
      ...frenchOf(entry.contributions),
    ]),
    ...education.flatMap((entry) => [
      entry.french.credential,
      entry.french.institution,
      entry.french.note,
    ]),
    ...skillGroups.flatMap((group) => [group.french.label, ...frenchOf(group.items)]),
    ...frenchOf(languages),
    ...SECTIONS.flatMap((section) =>
      entries[section.id].flatMap((entry) => [entry.french.title, entry.french.detail]),
    ),
  ];

  function renderEntrySection(section: (typeof SECTIONS)[number]) {
    const rows = entries[section.id];

    return (
      <Panel key={section.id} title={section.title} description={section.description}>
        {rows.length === 0 ? (
          <Empty text="Nothing here yet." />
        ) : (
          <SortableList
            items={rows}
            getId={(entry) => entry.uid}
            getLabel={(entry) => entry.title || 'an item with no title'}
            onReorder={(ids) => setEntrySection(section.id, reorder(rows, ids))}
            renderItem={(entry, index) => (
              <div className="grid gap-4">
                <RowHeader
                  title={`Item ${index + 1}`}
                  onRemove={() => setEntrySection(section.id, without(rows, index))}
                  removeLabel={`item ${index + 1}, ${entry.title || 'no title'}`}
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Field label="Title" htmlFor={`${section.id}-${entry.uid}-title`}>
                      <Input
                        value={entry.title}
                        placeholder="Scouts Leader"
                        onChange={(event) =>
                          setEntrySection(
                            section.id,
                            replace(rows, index, { ...entry, title: event.target.value }),
                          )
                        }
                      />
                    </Field>
                    <FrenchBox
                      htmlFor={`${section.id}-${entry.uid}-title-fr`}
                      label="Title"
                      english={entry.title}
                      value={entry.french.title}
                      onChange={(value) =>
                        setEntrySection(
                          section.id,
                          replace(rows, index, {
                            ...entry,
                            french: { ...entry.french, title: value },
                          }),
                        )
                      }
                    />
                  </div>

                  <div>
                    <Field label="Detail" htmlFor={`${section.id}-${entry.uid}-detail`}>
                      <Input
                        value={entry.detail}
                        placeholder="ABCCO Community Centre"
                        onChange={(event) =>
                          setEntrySection(
                            section.id,
                            replace(rows, index, { ...entry, detail: event.target.value }),
                          )
                        }
                      />
                    </Field>
                    <FrenchBox
                      htmlFor={`${section.id}-${entry.uid}-detail-fr`}
                      label="Detail"
                      english={entry.detail}
                      value={entry.french.detail}
                      onChange={(value) =>
                        setEntrySection(
                          section.id,
                          replace(rows, index, {
                            ...entry,
                            french: { ...entry.french, detail: value },
                          }),
                        )
                      }
                    />
                  </div>

                  <Field
                    label="When"
                    htmlFor={`${section.id}-${entry.uid}-year`}
                    hint="Left blank, the page reads Ongoing instead."
                  >
                    <Input
                      value={entry.year}
                      placeholder="2025 to present"
                      onChange={(event) =>
                        setEntrySection(
                          section.id,
                          replace(rows, index, { ...entry, year: event.target.value }),
                        )
                      }
                    />
                  </Field>
                </div>
              </div>
            )}
          />
        )}

        <AddButton
          label="Add an item"
          onClick={() =>
            setEntrySection(section.id, [
              ...rows,
              {
                uid: nextUid(),
                title: '',
                detail: '',
                year: '',
                french: { title: '', detail: '' },
              },
            ])
          }
        />
      </Panel>
    );
  }

  return (
    <FrenchBoxes showing={showFrench}>
    <div className="grid gap-12">
      {/* No strip and no boxes until the page hands over what the Translation
          table holds, because a screen that cannot show him the French he has
          already written is not a screen to write French on. */}
      {french && (
        <FrenchStrip
          title="Your resume in French"
          written={frenchBoxes.filter((value) => value.trim()).length}
          total={frenchBoxes.length}
          showing={showFrench}
          onToggle={() => setShowFrench((current) => !current)}
        />
      )}

      <section>
        <SaveBar
          title="Your details"
          description="Your name, how you describe yourself, your portrait, your PDFs and the writing about you. This button saves everything in this half. The lists below have their own button."
          label="Save your details"
          busy={savingProfile}
          dirty={profileFlag.dirty}
          onSave={onSaveProfile}
        />

        <Moved>
          Your email address, telephone number, where you are and the words on the
          contact page are edited on the{' '}
          <GuardedLink href="/admin/contact" className="underline underline-offset-4">
            Contact
          </GuardedLink>{' '}
          screen now.
        </Moved>

        <Notice text={profileNotice} />

        <div className="grid gap-6">
          <Panel
            title="Who you are"
            description="These lines appear across the site: in the header, the footer, and at the top of the resume page."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                htmlFor="profile-name"
                required
                error={profileErrors.name}
                hint="Shown in the header, the footer and the browser tab."
              >
                <Input
                  value={fields.name}
                  placeholder="Ahmad Assi"
                  onChange={(event) => setField('name', event.target.value)}
                />
              </Field>

              <Field
                label="What you do"
                htmlFor="profile-discipline"
                required
                error={profileErrors.discipline}
                hint="Sits beside your name on the home page and in the footer. For example, Architectural Designer."
              >
                <Input
                  value={fields.discipline}
                  placeholder="Architectural Designer"
                  onChange={(event) => setField('discipline', event.target.value)}
                />
              </Field>

              <div>
                <Field
                  label="Degree"
                  htmlFor="profile-credential"
                  hint="The small line above the title on the resume page."
                >
                  <Input
                    value={fields.credential}
                    placeholder="B.A.S. (Honours), Urbanism"
                    onChange={(event) => setField('credential', event.target.value)}
                  />
                </Field>
                <FrenchBox
                  htmlFor="profile-credential-fr"
                  label="Degree"
                  english={fields.credential}
                  value={frenchFields.credential}
                  onChange={(value) => setFrenchField('credential', value)}
                />
              </div>

              <div>
                <Field
                  label="School or professional body"
                  htmlFor="profile-registration"
                  hint="Kept with your details. No page shows this yet."
                >
                  <Input
                    value={fields.registration}
                    placeholder="Carleton University, Azrieli School of Architecture and Urbanism"
                    onChange={(event) => setField('registration', event.target.value)}
                  />
                </Field>
                <FrenchBox
                  htmlFor="profile-registration-fr"
                  label="School or professional body"
                  english={fields.registration}
                  value={frenchFields.registration}
                  onChange={(value) => setFrenchField('registration', value)}
                />
              </div>

              <div>
                <Field
                  label="Where you are in your career"
                  htmlFor="profile-years"
                  hint="Sits beside your degree on the resume page. For example, Graduated 2025."
                >
                  <Input
                    value={fields.yearsExperience}
                    placeholder="Graduated 2025"
                    onChange={(event) => setField('yearsExperience', event.target.value)}
                  />
                </Field>
                <FrenchBox
                  htmlFor="profile-years-fr"
                  label="Where you are in your career"
                  english={fields.yearsExperience}
                  value={frenchFields.yearsExperience}
                  onChange={(value) => setFrenchField('yearsExperience', value)}
                />
              </div>

              <div>
                <Field
                  label="Date on the printed portfolio"
                  htmlFor="profile-issued"
                  hint="Printed on the cover of the PDF the site generates. For example, 2026.07."
                >
                  <Input
                    value={fields.issued}
                    placeholder="2026.07"
                    onChange={(event) => setField('issued', event.target.value)}
                  />
                </Field>
                <FrenchBox
                  htmlFor="profile-issued-fr"
                  label="Date on the printed portfolio"
                  english={fields.issued}
                  value={frenchFields.issued}
                  onChange={(value) => setFrenchField('issued', value)}
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="How you introduce yourself"
            description="The longer writing about you, on the home page and in link previews."
          >
            <Field
              label="Greeting"
              htmlFor="profile-welcome"
              hint="A short opening line kept with your details. No page shows this yet."
            >
              <Input
                value={fields.welcome}
                placeholder="Hello and welcome to the portfolio of"
                onChange={(event) => setField('welcome', event.target.value)}
              />
            </Field>

            <div>
              <Field
                label="Short description"
                htmlFor="profile-positioning"
                hint="What a search result or a shared link shows under the home page. Two or three sentences."
              >
                <Textarea
                  value={fields.positioning}
                  rows={4}
                  onChange={(event) => setField('positioning', event.target.value)}
                />
              </Field>
              <FrenchBox
                htmlFor="profile-positioning-fr"
                label="Short description"
                english={fields.positioning}
                rows={4}
                value={frenchFields.positioning}
                onChange={(value) => setFrenchField('positioning', value)}
              />
            </div>

            <LineList
              label="About, on the home page"
              hint="One box for each paragraph. Drag to reorder them."
              rows={longBio}
              onChange={setLongBio}
              addLabel="Add a paragraph"
              placeholder="Recent graduate of the Bachelor of Architectural Studies (Honours) program..."
              emptyText="No paragraphs yet, so the About block on the home page is empty."
              multiline
            />
          </Panel>

          <Panel
            title="Your portrait"
            description="Shown at the top of your resume page. Upload a photo or choose one already in your library, then save your details below."
          >
            {portraitChoices.length > 0 && (
              <Field
                label="Previously uploaded portraits"
                htmlFor="profile-portrait-media"
                hint="Use the photo you already uploaded without uploading it again."
              >
                <Select
                  value={portrait?.id ?? ''}
                  onChange={(event) =>
                    setPortrait(portraitChoices.find((image) => image.id === event.target.value) ?? null)
                  }
                >
                  <option value="">Choose a photo</option>
                  {portraitChoices.map((image) => (
                    <option key={image.id} value={image.id}>
                      {image.originalName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {portrait && (
              <div className="flex flex-wrap items-start gap-4">
                <Image
                  src={portrait.key}
                  alt={fields.portraitAlt}
                  width={portrait.width ?? 800}
                  height={portrait.height ?? 600}
                  className="h-40 w-auto rounded-lg border border-neutral-200 object-cover"
                />
                <div className="grid gap-2">
                  <p className="text-xs text-neutral-500">
                    {`${fileName(portrait.key)}, ${formatBytes(portrait.bytes)}`}
                  </p>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPortrait(null)}
                    >
                      Take this portrait off
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Field
                label="What the portrait shows"
                htmlFor="profile-portrait-alt"
                error={profileErrors.portraitAlt}
                hint="One sentence describing the picture, for a reader who cannot see it."
              >
                <Input
                  value={fields.portraitAlt}
                  placeholder="Ahmad Assi, standing in front of a drawing board"
                  onChange={(event) => setField('portraitAlt', event.target.value)}
                />
              </Field>
              <FrenchBox
                htmlFor="profile-portrait-alt-fr"
                label="What the portrait shows"
                english={fields.portraitAlt}
                value={frenchFields.portraitAlt}
                onChange={(value) => setFrenchField('portraitAlt', value)}
              />
            </div>

            <Dropzone
              destination="profile"
              accept="image"
              onUploaded={(items) => {
                const file = firstFile(items);
                if (file) setPortrait(file);
              }}
              label="Drop your portrait here"
              hint="One picture. JPG, PNG, WebP, AVIF, GIF or TIFF, up to 64 MB."
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={onSaveProfile} disabled={savingProfile}>
                {savingProfile ? 'Saving' : 'Save portrait and details'}
              </Button>
              <p role="status" className="text-sm text-neutral-600">
                {profileFlag.dirty
                  ? 'Your changes are not on the site yet. Save to publish them.'
                  : portrait
                    ? 'Your portrait is saved on the resume page.'
                    : 'No portrait is saved on the resume page.'}
              </p>
            </div>
          </Panel>

          <Panel
            title="Your PDFs"
            description="The two files people download from the site. Each button only appears once its file is here."
          >
            <DocumentSlot
              title="Resume PDF"
              hint="The download button on the resume page, and one of the two on the contact page."
              file={cv}
              onClear={() => setCv(null)}
              onUploaded={(items) => {
                const file = firstFile(items);
                if (file) setCv(file);
              }}
            />

            <DocumentSlot
              title="Portfolio PDF"
              hint="A download button on both the resume and contact pages."
              file={portfolio}
              onClear={() => setPortfolio(null)}
              onUploaded={(items) => {
                const file = firstFile(items);
                if (file) setPortfolio(file);
              }}
            />
          </Panel>

          <Panel
            title="How the resume page ends"
            description="The last line under everything else on the resume page."
          >
            <div>
              <Field
                label="References"
                htmlFor="profile-references"
                hint="It is shown in lower case after the word References, so Available upon request reads as References available upon request. Left blank, that is what it falls back to."
              >
                <Input
                  value={fields.references}
                  placeholder="Available upon request"
                  onChange={(event) => setField('references', event.target.value)}
                />
              </Field>
              <FrenchBox
                htmlFor="profile-references-fr"
                label="References"
                english={fields.references}
                value={frenchFields.references}
                onChange={(value) => setFrenchField('references', value)}
              />
            </div>
          </Panel>
        </div>
      </section>

      <section>
        <SaveBar
          title="Your lists"
          description="Everything the resume page lists out. Drag the handle on the left of any row to move it, or focus the handle and use the arrow keys. This button saves all of the lists at once."
          label="Save the lists"
          busy={savingLists}
          dirty={listsFlag.dirty}
          onSave={onSaveLists}
        />

        <Moved>
          The links under Elsewhere are edited on the{' '}
          <GuardedLink href="/admin/contact" className="underline underline-offset-4">
            Contact
          </GuardedLink>{' '}
          screen now, since that is the only page they appear on.
        </Moved>

        <Notice text={listsNotice} />

        <div className="grid gap-6">
          <Panel
            title="At a glance"
            description="The short blocks near the top of the resume page. The first three sit across the page on wide screens, with the fourth centered below them. Each one is a heading with a few lines under it."
          >
            {facts.length === 0 ? (
              <Empty text="No blocks yet, so nothing appears at the top of the resume page." />
            ) : (
              <SortableList
                items={facts}
                getId={(fact) => fact.uid}
                getLabel={(fact) => fact.label || 'a block with no heading'}
                onReorder={(ids) => setFacts(reorder(facts, ids))}
                renderItem={(fact, index) => (
                  <div className="grid gap-4">
                    <RowHeader
                      title={`Block ${index + 1}`}
                      onRemove={() => setFacts(without(facts, index))}
                      removeLabel={`block ${index + 1}, ${fact.label || 'no heading'}`}
                    />

                    <div>
                      <Field label="Heading" htmlFor={`fact-${fact.uid}-label`}>
                        <Input
                          value={fact.label}
                          placeholder="Status"
                          onChange={(event) =>
                            setFacts(replace(facts, index, { ...fact, label: event.target.value }))
                          }
                        />
                      </Field>
                      <FrenchBox
                        htmlFor={`fact-${fact.uid}-label-fr`}
                        label="Heading"
                        english={fact.label}
                        value={fact.french.label}
                        onChange={(value) =>
                          setFacts(replace(facts, index, { ...fact, french: { label: value } }))
                        }
                      />
                    </div>

                    <LineList
                      label="Lines"
                      rows={fact.items}
                      onChange={(items) => setFacts(replace(facts, index, { ...fact, items }))}
                      addLabel="Add a line"
                      placeholder="Seeking a position with a firm"
                      emptyText="No lines under this heading yet."
                    />
                  </div>
                )}
              />
            )}

            <AddButton
              label="Add a block"
              onClick={() =>
                setFacts([...facts, { uid: nextUid(), label: '', french: { label: '' }, items: [] }])
              }
            />
          </Panel>

          <Panel
            title="Education"
            description="Degrees and programs, newest first."
          >
            {education.length === 0 ? (
              <Empty text="Nothing here yet, so the Education section of the resume page is empty." />
            ) : (
              <SortableList
                items={education}
                getId={(entry) => entry.uid}
                getLabel={(entry) => entry.credential || 'a qualification with no name'}
                onReorder={(ids) => setEducation(reorder(education, ids))}
                renderItem={(entry, index) => (
                  <div className="grid gap-4">
                    <RowHeader
                      title={`Qualification ${index + 1}`}
                      onRemove={() => setEducation(without(education, index))}
                      removeLabel={`qualification ${index + 1}, ${entry.credential || 'no name'}`}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Field label="Qualification" htmlFor={`education-${entry.uid}-credential`}>
                          <Input
                            value={entry.credential}
                            placeholder="Bachelor of Architectural Studies (Honours), Urbanism Major"
                            onChange={(event) =>
                              setEducation(
                                replace(education, index, {
                                  ...entry,
                                  credential: event.target.value,
                                }),
                              )
                            }
                          />
                        </Field>
                        <FrenchBox
                          htmlFor={`education-${entry.uid}-credential-fr`}
                          label="Qualification"
                          english={entry.credential}
                          value={entry.french.credential}
                          onChange={(value) =>
                            setEducation(
                              replace(education, index, {
                                ...entry,
                                french: { ...entry.french, credential: value },
                              }),
                            )
                          }
                        />
                      </div>

                      <div>
                        <Field label="School" htmlFor={`education-${entry.uid}-institution`}>
                          <Input
                            value={entry.institution}
                            placeholder="Carleton University"
                            onChange={(event) =>
                              setEducation(
                                replace(education, index, {
                                  ...entry,
                                  institution: event.target.value,
                                }),
                              )
                            }
                          />
                        </Field>
                        <FrenchBox
                          htmlFor={`education-${entry.uid}-institution-fr`}
                          label="School"
                          english={entry.institution}
                          value={entry.french.institution}
                          onChange={(value) =>
                            setEducation(
                              replace(education, index, {
                                ...entry,
                                french: { ...entry.french, institution: value },
                              }),
                            )
                          }
                        />
                      </div>

                      <Field
                        label="Year"
                        htmlFor={`education-${entry.uid}-year`}
                        hint="Left blank, the resume page reads Completed instead."
                      >
                        <Input
                          value={entry.year}
                          placeholder="2025"
                          onChange={(event) =>
                            setEducation(
                              replace(education, index, { ...entry, year: event.target.value }),
                            )
                          }
                        />
                      </Field>

                      <div>
                        <Field
                          label="Note"
                          htmlFor={`education-${entry.uid}-note`}
                          hint="Anything worth adding, an honour for example. Leave it blank and nothing shows."
                        >
                          <Input
                            value={entry.note}
                            placeholder="Dean's Honour List, Faculty of Engineering and Design."
                            onChange={(event) =>
                              setEducation(
                                replace(education, index, { ...entry, note: event.target.value }),
                              )
                            }
                          />
                        </Field>
                        <FrenchBox
                          htmlFor={`education-${entry.uid}-note-fr`}
                          label="Note"
                          english={entry.note}
                          value={entry.french.note}
                          onChange={(value) =>
                            setEducation(
                              replace(education, index, {
                                ...entry,
                                french: { ...entry.french, note: value },
                              }),
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              />
            )}

            <AddButton
              label="Add a qualification"
              onClick={() =>
                setEducation([
                  ...education,
                  {
                    uid: nextUid(),
                    credential: '',
                    institution: '',
                    year: '',
                    note: '',
                    french: { credential: '', institution: '', note: '' },
                  },
                ])
              }
            />
          </Panel>

          <Panel
            title="Experience"
            description="Every job, newest first. What you did there becomes the bullet points under it."
          >
            {experience.length === 0 ? (
              <Empty text="No jobs yet, so the Experience section of the resume page is empty." />
            ) : (
              <SortableList
                items={experience}
                getId={(entry) => entry.uid}
                getLabel={(entry) => entry.role || 'a job with no title'}
                onReorder={(ids) => setExperience(reorder(experience, ids))}
                renderItem={(entry, index) => (
                  <div className="grid gap-4">
                    <RowHeader
                      title={`Role ${index + 1}`}
                      onRemove={() => setExperience(without(experience, index))}
                      removeLabel={`role ${index + 1}, ${entry.role || 'no job title'}`}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Field label="Job title" htmlFor={`experience-${entry.uid}-role`}>
                          <Input
                            value={entry.role}
                            placeholder="Project Support Assistant"
                            onChange={(event) =>
                              setExperience(
                                replace(experience, index, { ...entry, role: event.target.value }),
                              )
                            }
                          />
                        </Field>
                        <FrenchBox
                          htmlFor={`experience-${entry.uid}-role-fr`}
                          label="Job title"
                          english={entry.role}
                          value={entry.french.role}
                          onChange={(value) =>
                            setExperience(
                              replace(experience, index, {
                                ...entry,
                                french: { ...entry.french, role: value },
                              }),
                            )
                          }
                        />
                      </div>

                      <Field label="Firm" htmlFor={`experience-${entry.uid}-firm`}>
                        <Input
                          value={entry.firm}
                          placeholder="SD Consulting and Management Inc."
                          onChange={(event) =>
                            setExperience(
                              replace(experience, index, { ...entry, firm: event.target.value }),
                            )
                          }
                        />
                      </Field>

                      <div>
                        <Field label="Where" htmlFor={`experience-${entry.uid}-location`}>
                          <Input
                            value={entry.location}
                            placeholder="Ottawa, ON"
                            onChange={(event) =>
                              setExperience(
                                replace(experience, index, {
                                  ...entry,
                                  location: event.target.value,
                                }),
                              )
                            }
                          />
                        </Field>
                        <FrenchBox
                          htmlFor={`experience-${entry.uid}-location-fr`}
                          label="Where"
                          english={entry.location}
                          value={entry.french.location}
                          onChange={(value) =>
                            setExperience(
                              replace(experience, index, {
                                ...entry,
                                french: { ...entry.french, location: value },
                              }),
                            )
                          }
                        />
                      </div>

                      <div>
                        <Field
                          label="When"
                          htmlFor={`experience-${entry.uid}-period`}
                          hint="For example, February 2025 to October 2025."
                        >
                          <Input
                            value={entry.period}
                            placeholder="February 2025 to October 2025"
                            onChange={(event) =>
                              setExperience(
                                replace(experience, index, { ...entry, period: event.target.value }),
                              )
                            }
                          />
                        </Field>
                        <FrenchBox
                          htmlFor={`experience-${entry.uid}-period-fr`}
                          label="When"
                          english={entry.period}
                          value={entry.french.period}
                          onChange={(value) =>
                            setExperience(
                              replace(experience, index, {
                                ...entry,
                                french: { ...entry.french, period: value },
                              }),
                            )
                          }
                        />
                      </div>
                    </div>

                    <LineList
                      label="What you did there"
                      hint="One box for each bullet point."
                      rows={entry.contributions}
                      onChange={(contributions) =>
                        setExperience(replace(experience, index, { ...entry, contributions }))
                      }
                      addLabel="Add a bullet point"
                      placeholder="Prepared presentation materials and meeting minutes."
                      emptyText="No bullet points under this job yet."
                      multiline
                    />
                  </div>
                )}
              />
            )}

            <AddButton
              label="Add a job"
              onClick={() =>
                setExperience([
                  ...experience,
                  {
                    uid: nextUid(),
                    role: '',
                    firm: '',
                    location: '',
                    period: '',
                    french: { role: '', location: '', period: '' },
                    contributions: [],
                  },
                ])
              }
            />
          </Panel>

          {SECTIONS.filter((section) => section.id === 'volunteering').map(renderEntrySection)}

          <Panel
            title="Skills"
            description="Each group is a heading with a list of names under it. A group named Software is drawn with a small icon beside every name on the public page. Every other group is shown as plain tags."
          >
            {skillGroups.length === 0 ? (
              <Empty text="No groups yet, so the Skills section of the resume page is empty." />
            ) : (
              <SortableList
                items={skillGroups}
                getId={(group) => group.uid}
                getLabel={(group) => group.label || 'a group with no heading'}
                onReorder={(ids) => setSkillGroups(reorder(skillGroups, ids))}
                renderItem={(group, index) => (
                  <div className="grid gap-4">
                    <RowHeader
                      title={`Group ${index + 1}`}
                      onRemove={() => setSkillGroups(without(skillGroups, index))}
                      removeLabel={`group ${index + 1}, ${group.label || 'no heading'}`}
                    />

                    <div className="flex flex-wrap items-end gap-3">
                      <Field
                        className="min-w-56 flex-1"
                        label="Heading"
                        htmlFor={`skill-${group.uid}-label`}
                      >
                        <Input
                          value={group.label}
                          placeholder="Software"
                          onChange={(event) =>
                            setSkillGroups(
                              replace(skillGroups, index, { ...group, label: event.target.value }),
                            )
                          }
                        />
                      </Field>

                      {/* Said on the row itself, not only in the description
                          above, because the rule turns on the word he typed. */}
                      {group.label.trim().toLowerCase() === 'software' ? (
                        <Badge variant="secondary" className="mb-1.5">
                          Drawn with icons
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="mb-1.5">
                          Shown as tags
                        </Badge>
                      )}
                    </div>

                    {/* Under the row rather than inside it, so the badge stays
                        level with the heading it describes. */}
                    <FrenchBox
                      htmlFor={`skill-${group.uid}-label-fr`}
                      label="Heading"
                      english={group.label}
                      value={group.french.label}
                      onChange={(value) =>
                        setSkillGroups(
                          replace(skillGroups, index, { ...group, french: { label: value } }),
                        )
                      }
                    />

                    <LineList
                      label="Names in this group"
                      rows={group.items}
                      onChange={(items) =>
                        setSkillGroups(replace(skillGroups, index, { ...group, items }))
                      }
                      addLabel="Add a name"
                      placeholder="SketchUp"
                      emptyText="Nothing in this group yet."
                    />
                  </div>
                )}
              />
            )}

            <AddButton
              label="Add a group"
              onClick={() =>
                setSkillGroups([
                  ...skillGroups,
                  { uid: nextUid(), label: '', french: { label: '' }, items: [] },
                ])
              }
            />
          </Panel>

          <Panel
            title="Languages"
            description="Shown as tags at the end of the Skills section, and on the printed PDF."
          >
            <LineList
              label="Languages"
              rows={languages}
              onChange={setLanguages}
              addLabel="Add a language"
              placeholder="French, fluent"
              emptyText="No languages yet."
            />
          </Panel>

          {SECTIONS.filter((section) => section.id !== 'volunteering').map(renderEntrySection)}
        </div>
      </section>
    </div>
    </FrenchBoxes>
  );
}

// ------------------------------------------------------------- furniture ---

function SaveBar({
  title,
  description,
  label,
  busy,
  dirty,
  onSave,
}: {
  title: string;
  description: string;
  label: string;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 bg-neutral-50/95 px-6 py-4 backdrop-blur">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>
      </div>
      {/* Beside this button and no other, because the flag behind it belongs to
          this half alone. */}
      <div className="flex items-center gap-3">
        {dirty && <Badge variant="warning">Not saved yet</Badge>}
        <Button type="button" onClick={onSave} disabled={busy}>
          {busy ? 'Saving' : label}
        </Button>
      </div>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p>
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}

/**
 * Where a box that used to be here went.
 *
 * Quieter than a warning, because nothing is wrong. It exists so that moving
 * the contact boxes to their own screen does not leave him hunting the one form
 * he knows for a telephone number that is no longer in it.
 */
function Moved({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
      {children}
    </p>
  );
}

/**
 * The one switch that reveals the French boxes, and the sentence that says what
 * an empty one means.
 *
 * One for the screen rather than one for each half. The two halves are saved
 * separately because they are two writes, but showing a box is not a write, and
 * two switches beside two identical sentences would only ask Ahmad to work out
 * whether they were the same switch.
 */
function FrenchStrip({
  title,
  written,
  total,
  showing,
  onToggle,
}: {
  title: string;
  written: number;
  total: number;
  showing: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-medium text-sky-950">{title}</p>
        <p className="mt-0.5 text-xs text-sky-900">
          {written} of {total} boxes written. Anything you leave empty shows in English on the
          French page, so you can translate as much or as little as you like. The grey words in a
          French box are the English it would show.
        </p>
      </div>

      <Button type="button" variant="outline" aria-expanded={showing} onClick={onToggle}>
        {showing ? 'Hide the French boxes' : 'Show the French boxes'}
      </Button>
    </div>
  );
}

/** A warning that came back with a save, kept on the page rather than in a toast. */
function Notice({ text }: { text: string | null }) {
  if (!text) return null;

  return (
    <p
      role="status"
      className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      {text}
    </p>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500">
      {text}
    </p>
  );
}

function RowHeader({
  title,
  removeLabel,
  onRemove,
}: {
  title: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-label={`Remove ${removeLabel}`}
        className="text-neutral-500 hover:text-red-700"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Remove
      </Button>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
    </div>
  );
}

/**
 * A list inside a list must not hand its drag to the list around it.
 *
 * Both lists mark their rows draggable, so without this a drag on one bullet
 * point would also pick up the whole job it belongs to, and the two would then
 * disagree about where it was dropped.
 *
 * Only the start of the drag is held back, which is the whole of the fix: with
 * the outer list never told a drag began, its own move and drop handlers see no
 * item in flight and return without doing anything. Blocking the later events
 * as well would cost something real, the area a nested list occupies would stop
 * being somewhere an outer row could be dropped.
 */
function DragBoundary({ children }: { children: ReactNode }) {
  return (
    <div onDragStart={(event) => event.stopPropagation()}>{children}</div>
  );
}

/** A repeatable list of single lines: paragraphs, bullet points, skills, languages. */
function LineList({
  label,
  hint,
  rows,
  onChange,
  addLabel,
  placeholder,
  emptyText,
  multiline = false,
}: {
  label: string;
  hint?: string;
  rows: TextRow[];
  onChange: (rows: TextRow[]) => void;
  addLabel: string;
  placeholder: string;
  emptyText: string;
  multiline?: boolean;
}) {
  return (
    <DragBoundary>
      <div className="grid gap-2">
        <p className="text-sm font-medium text-neutral-800">{label}</p>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}

        {rows.length === 0 ? (
          <Empty text={emptyText} />
        ) : (
          <SortableList
            items={rows}
            getId={(row) => row.uid}
            getLabel={(row) => row.text || 'an empty line'}
            onReorder={(ids) => onChange(reorder(rows, ids))}
            itemClassName="p-2"
            renderItem={(row, index) => (
              <div className="grid gap-1">
                <div className="flex items-start gap-2">
                  {multiline ? (
                    <Textarea
                      value={row.text}
                      rows={3}
                      placeholder={placeholder}
                      aria-label={`${label}, ${index + 1}`}
                      onChange={(event) =>
                        onChange(replace(rows, index, { ...row, text: event.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      value={row.text}
                      placeholder={placeholder}
                      aria-label={`${label}, ${index + 1}`}
                      onChange={(event) =>
                        onChange(replace(rows, index, { ...row, text: event.target.value }))
                      }
                    />
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(without(rows, index))}
                    aria-label={`Remove ${label}, ${index + 1}`}
                    className="text-neutral-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Remove</span>
                  </Button>
                </div>

                {/* Every one of these lists is his writing rather than a date or
                    a file name, so each line gets its French. Removing a line
                    takes its translation with it, since the two travel on the
                    one row. */}
                <FrenchBox
                  htmlFor={`line-${row.uid}-fr`}
                  label={`${label}, ${index + 1}`}
                  english={row.text}
                  rows={multiline ? 3 : undefined}
                  value={row.french}
                  onChange={(value) => onChange(replace(rows, index, { ...row, french: value }))}
                />
              </div>
            )}
          />
        )}

        <AddButton
          label={addLabel}
          onClick={() => onChange([...rows, { uid: nextUid(), text: '', french: '' }])}
        />
      </div>
    </DragBoundary>
  );
}
