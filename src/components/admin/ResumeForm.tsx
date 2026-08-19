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

import { Dropzone } from '@/components/admin/Dropzone';
import { SortableList } from '@/components/admin/SortableList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { useSaveFlag } from '@/hooks/use-save-flag';
import type { UploadedItem } from '@/hooks/use-uploads';
import { runAction } from '@/lib/action-result';
import { mediaUrl } from '@/lib/media-url';
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
 * corrected telephone number rewriting seven tables, and a half finished list
 * being republished because a detail above it changed.
 *
 * Every list keeps a local uid on each row. The rows in the database have no
 * stable identity across a save, since the save deletes and recreates them, so
 * a database id would change under a React key on every save and take the
 * focused field with it.
 *
 * Nothing here is loaded into state by an effect. The lists arrive as props and
 * are read once by the useState initialiser, which is what keeps a background
 * refresh from throwing away half typed work.
 */

// ------------------------------------------------------------------ types ---

interface FileRef {
  id: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Exactly what this screen reads, declared here rather than imported from
 * src/lib/queries.ts, because that module is server only. The shape getProfile
 * returns satisfies it, so the page hands its result straight over.
 */
export interface ResumeData {
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

type Section = 'volunteering' | 'awards' | 'publications' | 'exhibitions';

interface TextRow {
  uid: string;
  text: string;
}

interface FactRow {
  uid: string;
  label: string;
  items: TextRow[];
}

interface SocialRow {
  uid: string;
  label: string;
  href: string;
}

interface ExperienceRow {
  uid: string;
  role: string;
  firm: string;
  location: string;
  period: string;
  contributions: TextRow[];
}

interface EducationRow {
  uid: string;
  credential: string;
  institution: string;
  year: string;
  note: string;
}

interface SkillGroupRow {
  uid: string;
  label: string;
  items: TextRow[];
}

interface EntryRow {
  uid: string;
  title: string;
  detail: string;
  year: string;
}

type ProfileFields = {
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
  portraitAlt: string;
  email: string;
  phone: string;
  references: string;
};

// ---------------------------------------------------------------- helpers ---

let rowCounter = 0;

/** A key for one row of one list, stable for as long as the row is on screen. */
function nextUid(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

function toTextRows(values: string[]): TextRow[] {
  return values.map((text) => ({ uid: nextUid(), text }));
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

function entryRowsFor(all: ResumeData['entries'], section: Section): EntryRow[] {
  return all
    .filter((entry) => entry.section === section)
    .map((entry) => ({
      uid: nextUid(),
      title: entry.title,
      detail: entry.detail,
      year: entry.year,
    }));
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

export function ResumeForm({ data }: { data: ResumeData }) {
  const { push } = useToast();

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
    location: data.profile?.location ?? '',
    yearsExperience: data.profile?.yearsExperience ?? '',
    availability: data.profile?.availability ?? '',
    issued: data.profile?.issued ?? '',
    welcome: data.profile?.welcome ?? '',
    positioning: data.profile?.positioning ?? '',
    portraitAlt: data.profile?.portraitAlt ?? '',
    email: data.profile?.email ?? '',
    phone: data.profile?.phone ?? '',
    references: data.profile?.references ?? '',
  }));

  const [longBio, setLongBioState] = useState<TextRow[]>(() =>
    toTextRows(data.profile?.longBio ?? []),
  );
  const [portrait, setPortraitState] = useState<FileRef | null>(
    () => data.profile?.portraitMedia ?? null,
  );
  const [cv, setCvState] = useState<FileRef | null>(() => data.profile?.cvMedia ?? null);
  const [portfolio, setPortfolioState] = useState<FileRef | null>(
    () => data.profile?.portfolioMedia ?? null,
  );

  const [facts, setFactsState] = useState<FactRow[]>(() =>
    data.facts.map((fact) => ({ uid: nextUid(), label: fact.label, items: toTextRows(fact.items) })),
  );
  const [social, setSocialState] = useState<SocialRow[]>(() =>
    data.social.map((link) => ({ uid: nextUid(), label: link.label, href: link.href })),
  );
  const [experience, setExperienceState] = useState<ExperienceRow[]>(() =>
    data.experience.map((entry) => ({
      uid: nextUid(),
      role: entry.role,
      firm: entry.firm,
      location: entry.location,
      period: entry.period,
      contributions: toTextRows(entry.contributions),
    })),
  );
  const [education, setEducationState] = useState<EducationRow[]>(() =>
    data.education.map((entry) => ({
      uid: nextUid(),
      credential: entry.credential,
      institution: entry.institution,
      year: entry.year,
      note: entry.note ?? '',
    })),
  );
  const [skillGroups, setSkillGroupsState] = useState<SkillGroupRow[]>(() =>
    data.skillGroups.map((group) => ({
      uid: nextUid(),
      label: group.label,
      items: toTextRows(group.items.map((item) => item.name)),
    })),
  );
  const [languages, setLanguagesState] = useState<TextRow[]>(() =>
    toTextRows(data.languages.map((language) => language.text)),
  );
  const [entries, setEntriesState] = useState<Record<Section, EntryRow[]>>(() => ({
    volunteering: entryRowsFor(data.entries, 'volunteering'),
    awards: entryRowsFor(data.entries, 'awards'),
    publications: entryRowsFor(data.entries, 'publications'),
    exhibitions: entryRowsFor(data.entries, 'exhibitions'),
  }));

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
  const setLongBio = marking(setLongBioState, profileFlag.markDirty);
  const setPortrait = marking(setPortraitState, profileFlag.markDirty);
  const setCv = marking(setCvState, profileFlag.markDirty);
  const setPortfolio = marking(setPortfolioState, profileFlag.markDirty);

  const setFacts = marking(setFactsState, listsFlag.markDirty);
  const setSocial = marking(setSocialState, listsFlag.markDirty);
  const setExperience = marking(setExperienceState, listsFlag.markDirty);
  const setEducation = marking(setEducationState, listsFlag.markDirty);
  const setSkillGroups = marking(setSkillGroupsState, listsFlag.markDirty);
  const setLanguages = marking(setLanguagesState, listsFlag.markDirty);
  const setEntries = marking(setEntriesState, listsFlag.markDirty);

  const setField = (field: keyof ProfileFields, value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  const setEntrySection = (section: Section, rows: EntryRow[]) =>
    setEntries((current) => ({ ...current, [section]: rows }));

  function onSaveProfile() {
    // Taken before the payload is read out of state, and handed to settle when
    // the answer comes back. Anything typed into these boxes in between bumps
    // the counter past this number, settle then leaves the badge up, and the
    // work that never went is still marked as work.
    const at = profileFlag.snapshot();

    const input: ProfileInput = {
      ...fields,
      longBio: longBio.map((row) => row.text),
      portraitMediaId: portrait?.id ?? null,
      cvMediaId: cv?.id ?? null,
      portfolioMediaId: portfolio?.id ?? null,
    };

    // Checked here first so an empty telephone box says so straight away rather
    // than after a round trip. The same rules run again on the server.
    const found = validateProfile(input);
    if (hasErrors(found)) {
      setProfileErrors(found);
      setProfileNotice(null);
      push('A few of your details still need filling in. They are marked below.', 'error');
      return;
    }

    startProfileSave(async () => {
      const result = await runAction(() => saveProfile(input));

      if (!result.ok) {
        setProfileErrors(result.errors ?? {});
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
      blankIn('Elsewhere', 'Link', social.map((link) => link.label), 'name') ??
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

    const lists: ResumeLists = {
      facts: facts.map((fact) => ({
        label: fact.label,
        items: fact.items.map((item) => item.text),
      })),
      social: social.map((link) => ({ label: link.label, href: link.href })),
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

  return (
    <div className="grid gap-12">
      <section>
        <SaveBar
          title="Your details"
          description="Your name, how you describe yourself, your portrait, your PDFs and how people reach you. This button saves everything in this half. The lists below have their own button."
          label="Save your details"
          busy={savingProfile}
          dirty={profileFlag.dirty}
          onSave={onSaveProfile}
        />

        <Notice text={profileNotice} />

        <div className="grid gap-6">
          <Panel
            title="Who you are"
            description="These lines appear across the site: in the header, the footer, and at the top of the resume and contact pages."
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

              <Field
                label="Where you are"
                htmlFor="profile-location"
                required
                error={profileErrors.location}
                hint="Shown on the home page, the resume page, the contact page and in the footer."
              >
                <Input
                  value={fields.location}
                  placeholder="Ottawa, Ontario"
                  onChange={(event) => setField('location', event.target.value)}
                />
              </Field>

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

              <Field
                label="What you are looking for"
                htmlFor="profile-availability"
                hint="The sentence under the Contact heading, and on the printed PDF."
              >
                <Input
                  value={fields.availability}
                  placeholder="Seeking a position with a professional firm"
                  onChange={(event) => setField('availability', event.target.value)}
                />
              </Field>

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
            description="Dropping a picture here puts it in your library. It is attached to your details when you press Save your details."
          >
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
              hint="The other download button on the contact page."
              file={portfolio}
              onClear={() => setPortfolio(null)}
              onUploaded={(items) => {
                const file = firstFile(items);
                if (file) setPortfolio(file);
              }}
            />
          </Panel>

          <Panel
            title="How to reach you"
            description="Your email address is the only route on the contact page, so it has to be right."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Email address"
                htmlFor="profile-email"
                required
                error={profileErrors.email}
              >
                <Input
                  type="email"
                  value={fields.email}
                  placeholder="you@example.com"
                  onChange={(event) => setField('email', event.target.value)}
                />
              </Field>

              <Field
                label="Telephone number"
                htmlFor="profile-phone"
                required
                error={profileErrors.phone}
              >
                <Input
                  type="tel"
                  value={fields.phone}
                  placeholder="613-291-8074"
                  onChange={(event) => setField('phone', event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="References"
              htmlFor="profile-references"
              hint="The last line of the resume page. It is shown in lower case after the word References, so Available upon request reads as References available upon request. Left blank, that is what it falls back to."
            >
              <Input
                value={fields.references}
                placeholder="Available upon request"
                onChange={(event) => setField('references', event.target.value)}
              />
            </Field>
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

        <Notice text={listsNotice} />

        <div className="grid gap-6">
          <Panel
            title="At a glance"
            description="The short blocks near the top of the resume page. Four of them fit across the page. Each one is a heading with a few lines under it."
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

                    <Field label="Heading" htmlFor={`fact-${fact.uid}-label`}>
                      <Input
                        value={fact.label}
                        placeholder="Status"
                        onChange={(event) =>
                          setFacts(replace(facts, index, { ...fact, label: event.target.value }))
                        }
                      />
                    </Field>

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
              onClick={() => setFacts([...facts, { uid: nextUid(), label: '', items: [] }])}
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

                      <Field label="Where" htmlFor={`experience-${entry.uid}-location`}>
                        <Input
                          value={entry.location}
                          placeholder="Ottawa, ON"
                          onChange={(event) =>
                            setExperience(
                              replace(experience, index, { ...entry, location: event.target.value }),
                            )
                          }
                        />
                      </Field>

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
                    contributions: [],
                  },
                ])
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
                  { uid: nextUid(), credential: '', institution: '', year: '', note: '' },
                ])
              }
            />
          </Panel>

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
              onClick={() => setSkillGroups([...skillGroups, { uid: nextUid(), label: '', items: [] }])}
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

          <Panel
            title="Elsewhere"
            description="Links under Elsewhere on the contact page. Leave this empty and the whole block is left off."
          >
            {social.length === 0 ? (
              <Empty text="No links yet, so nothing appears under Elsewhere." />
            ) : (
              <SortableList
                items={social}
                getId={(link) => link.uid}
                getLabel={(link) => link.label || 'a link with no name'}
                onReorder={(ids) => setSocial(reorder(social, ids))}
                renderItem={(link, index) => (
                  <div className="grid gap-4">
                    <RowHeader
                      title={`Link ${index + 1}`}
                      onRemove={() => setSocial(without(social, index))}
                      removeLabel={`link ${index + 1}, ${link.label || 'no name'}`}
                    />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="What it says" htmlFor={`social-${link.uid}-label`}>
                        <Input
                          value={link.label}
                          placeholder="LinkedIn"
                          onChange={(event) =>
                            setSocial(replace(social, index, { ...link, label: event.target.value }))
                          }
                        />
                      </Field>

                      <Field
                        label="Where it goes"
                        htmlFor={`social-${link.uid}-href`}
                        hint="The full address, starting with https://"
                      >
                        <Input
                          value={link.href}
                          placeholder="https://www.linkedin.com/in/"
                          onChange={(event) =>
                            setSocial(replace(social, index, { ...link, href: event.target.value }))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}
              />
            )}

            <AddButton
              label="Add a link"
              onClick={() => setSocial([...social, { uid: nextUid(), label: '', href: '' }])}
            />
          </Panel>

          {SECTIONS.map((section) => {
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
                      { uid: nextUid(), title: '', detail: '', year: '' },
                    ])
                  }
                />
              </Panel>
            );
          })}
        </div>
      </section>
    </div>
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
            )}
          />
        )}

        <AddButton label={addLabel} onClick={() => onChange([...rows, { uid: nextUid(), text: '' }])} />
      </div>
    </DragBoundary>
  );
}

/** One of the two downloadable PDFs, with whatever is on the site now. */
function DocumentSlot({
  title,
  hint,
  file,
  onClear,
  onUploaded,
}: {
  title: string;
  hint: string;
  file: FileRef | null;
  onClear: () => void;
  onUploaded: (items: UploadedItem[]) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-800">{title}</p>
          <p className="text-xs text-neutral-500">{hint}</p>
        </div>

        {file && (
          <div className="flex items-center gap-2">
            <a
              href={mediaUrl(file.key)}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4 hover:text-neutral-600"
            >
              Open it
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Take it off
            </Button>
          </div>
        )}
      </div>

      {file ? (
        <p className="text-xs text-neutral-500">
          {`${fileName(file.key)}, ${formatBytes(file.bytes)}`}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          Nothing here yet, so no button for it appears on the site.
        </p>
      )}

      <Dropzone
        destination="document"
        accept="document"
        onUploaded={onUploaded}
        label={`Drop the ${title} here`}
        hint="One PDF, up to 32 MB. Dropping a new one replaces the one above."
      />
    </div>
  );
}
