'use client';

import { Plus, X } from 'lucide-react';
import {
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import { Dropzone } from '@/components/admin/Dropzone';
import type { FileRef, ProfileData } from '@/components/admin/ResumeForm';
import { SortableList } from '@/components/admin/SortableList';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useSaveFlag } from '@/hooks/use-save-flag';
import type { UploadedItem } from '@/hooks/use-uploads';
import { runAction } from '@/lib/action-result';
import { CONTACT_DEFAULTS } from '@/lib/contact-defaults';
import { mediaUrl } from '@/lib/media-url';
import { saveProfile, saveResumeLists, type ProfileInput, type ResumeLists } from '@/lib/mutations';
import { formatBytes } from '@/lib/upload-policy';
import { hasErrors, validateProfile, type FieldErrors } from '@/lib/validation';

/**
 * The contact screen: everything the public contact page shows, and nothing
 * else.
 *
 * These boxes were first written into the resume screen, because that is where
 * the profile row was already being edited, not because anyone would look for
 * the contact page there. Each of them now lives here and only here, so there
 * is never a question of which of two copies of a telephone number is the one
 * the site reads.
 *
 * Two save buttons, for the same reason the resume screen has two. The words
 * and the files are one row that saveProfile upserts; the links are one of
 * seven lists that saveResumeLists deletes and writes again. A single button
 * over both would rewrite every list on the site to correct a spelling.
 *
 * Both saves send back more than this screen shows, and that is deliberate.
 * saveProfile writes the whole profile row and saveResumeLists rewrites every
 * list, so anything missing from a payload is not left alone, it is erased.
 * Everything the resume screen owns is therefore passed straight through from
 * what this page loaded with. The cost of that is a narrow one: saving here
 * after editing the resume screen in another tab puts the older resume text
 * back, because this tab is still holding the values it opened with.
 *
 * Nothing here is loaded into state by an effect. The values arrive as props
 * and are read once by the useState initialiser, which is what keeps a
 * background refresh from throwing away half typed work.
 */

// ------------------------------------------------------------------ types ---

/** The seven boxes on this screen that belong to the profile row. */
interface ContactFields {
  contactStatus: string;
  contactHeading: string;
  contactBlurb: string;
  email: string;
  phone: string;
  location: string;
  availability: string;
}

interface SocialRow {
  uid: string;
  label: string;
  href: string;
}

// ---------------------------------------------------------------- helpers ---

let rowCounter = 0;

/** A key for one link, stable for as long as the row is on screen. */
function nextUid(): string {
  rowCounter += 1;
  return `contact-row-${rowCounter}`;
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

/** The first ordinary file in a batch. The dropzones here accept PDFs only. */
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
 * The first link with no name, said as a sentence.
 *
 * A nameless link is not rejected by the save, it is published as a blank line
 * under Elsewhere, and a blank line on the contact page takes a while to trace
 * back to here.
 */
function blankLink(links: SocialRow[]): string | null {
  const index = links.findIndex((link) => link.label.trim() === '');
  if (index === -1) return null;
  return `Link ${index + 1} has no name. Fill it in, or remove it, then save again.`;
}

/** A, B and C. */
function said(items: string[]): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * What the resume screen owns and this save still insists on.
 *
 * saveProfile checks the whole row, and the whole row includes the name and the
 * discipline, which are edited next door. Without this the save would be
 * refused with nothing marked on screen and nothing here to correct.
 */
const ON_THE_RESUME_SCREEN: Record<string, string> = {
  name: 'your name',
  discipline: 'what you do',
};

function resumeProblem(errors: FieldErrors): string | null {
  const missing = Object.keys(errors)
    .filter((field) => field in ON_THE_RESUME_SCREEN)
    .map((field) => ON_THE_RESUME_SCREEN[field]);

  if (missing.length === 0) return null;
  return `Something on the Resume screen is still blank: ${said(missing)}. This save needs it. Fill it in there, then save here again.`;
}

/**
 * A setter that also marks its half of the screen as unsaved.
 *
 * Wrapping the setter rather than each call site is what makes the flag
 * exhaustive: a field wired to a wrapped setter is covered the moment it is
 * written, and no call site is left that can change a savable value quietly.
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

export function ContactForm({ data }: { data: ProfileData }) {
  const { push } = useToast();

  // One flag for each save button. Saving the words leaves the links exactly as
  // unsaved as they were, so a single flag would clear the badge over work that
  // is still only on the page.
  const pageFlag = useSaveFlag();
  const linksFlag = useSaveFlag();

  useRegisterUnsaved('contact:page', pageFlag.dirty);
  useRegisterUnsaved('contact:links', linksFlag.dirty);

  const [fields, setFieldsState] = useState<ContactFields>(() => ({
    contactStatus: data.profile?.contactStatus ?? '',
    contactHeading: data.profile?.contactHeading ?? '',
    contactBlurb: data.profile?.contactBlurb ?? '',
    email: data.profile?.email ?? '',
    phone: data.profile?.phone ?? '',
    location: data.profile?.location ?? '',
    availability: data.profile?.availability ?? '',
  }));

  const [cv, setCvState] = useState<FileRef | null>(() => data.profile?.cvMedia ?? null);
  const [portfolio, setPortfolioState] = useState<FileRef | null>(
    () => data.profile?.portfolioMedia ?? null,
  );
  const [social, setSocialState] = useState<SocialRow[]>(() =>
    data.social.map((link) => ({ uid: nextUid(), label: link.label, href: link.href })),
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [linksNotice, setLinksNotice] = useState<string | null>(null);
  const [savingPage, startPageSave] = useTransition();
  const [savingLinks, startLinksSave] = useTransition();

  // Every savable value goes through one of these rather than its setter, so
  // marking the right half unsaved is not something a call site can forget.
  const setFields = marking(setFieldsState, pageFlag.markDirty);
  const setCv = marking(setCvState, pageFlag.markDirty);
  const setPortfolio = marking(setPortfolioState, pageFlag.markDirty);
  const setSocial = marking(setSocialState, linksFlag.markDirty);

  const setField = (field: keyof ContactFields, value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  function onSavePage() {
    // Taken before the payload is read out of state, and handed to settle when
    // the answer comes back. Anything typed in between bumps the counter past
    // this number, and settle then leaves the badge up, because the work that
    // never went is still work.
    const at = pageFlag.snapshot();
    const profile = data.profile;

    const input: ProfileInput = {
      /* Everything the resume screen owns, exactly as this page loaded it.
         saveProfile upserts the whole row, so a field left out of this object
         is not left alone, it is written back empty. */
      name: profile?.name ?? '',
      discipline: profile?.discipline ?? '',
      credential: profile?.credential ?? '',
      registration: profile?.registration ?? '',
      yearsExperience: profile?.yearsExperience ?? '',
      issued: profile?.issued ?? '',
      welcome: profile?.welcome ?? '',
      positioning: profile?.positioning ?? '',
      longBio: profile?.longBio ?? [],
      portraitMediaId: profile?.portraitMedia?.id ?? null,
      portraitAlt: profile?.portraitAlt ?? '',
      references: profile?.references ?? '',

      ...fields,
      cvMediaId: cv?.id ?? null,
      portfolioMediaId: portfolio?.id ?? null,
    };

    // Checked here first so an empty telephone box says so straight away rather
    // than after a round trip. The same rules run again on the server.
    const found = validateProfile(input);
    if (hasErrors(found)) {
      const elsewhere = resumeProblem(found);
      setErrors(found);
      setPageNotice(elsewhere);
      push(
        elsewhere
          ? 'This cannot be saved yet. The note at the top says why.'
          : 'A few of your details still need filling in. They are marked below.',
        'error',
      );
      return;
    }

    startPageSave(async () => {
      const result = await runAction(() => saveProfile(input));

      if (!result.ok) {
        const back = result.errors ?? {};
        setErrors(back);
        setPageNotice(resumeProblem(back));
        push(
          result.message ?? 'Your contact page was not saved. Check the boxes marked below.',
          'error',
        );
        return;
      }

      setErrors({});
      setPageNotice(result.warning ?? null);
      pageFlag.settle(at);
      push('Your contact page is saved.');
    });
  }

  function onSaveLinks() {
    const at = linksFlag.snapshot();

    const problem = blankLink(social);
    if (problem) {
      setLinksNotice(problem);
      push('One of the links is not finished yet. The note above says which.', 'error');
      return;
    }

    const lists: ResumeLists = {
      social: social.map((link) => ({ label: link.label, href: link.href })),

      /* The five lists the resume screen owns, exactly as this page loaded
         them. saveResumeLists deletes every list and writes it again, so a list
         left out of this object is not left alone, it is deleted. */
      facts: data.facts.map((fact) => ({ label: fact.label, items: fact.items })),
      experience: data.experience.map((entry) => ({
        role: entry.role,
        firm: entry.firm,
        location: entry.location,
        period: entry.period,
        contributions: entry.contributions,
      })),
      education: data.education.map((entry) => ({
        credential: entry.credential,
        institution: entry.institution,
        year: entry.year,
        note: entry.note,
      })),
      skillGroups: data.skillGroups.map((group) => ({
        label: group.label,
        items: group.items.map((item) => item.name),
      })),
      languages: data.languages.map((language) => language.text),
      entries: data.entries.map((entry) => ({
        /* The column is an enum of exactly these four sections, so whatever the
           database holds is one of them. Dropping the rows this file did not
           recognise would delete them, which is the opposite of passing them
           through. */
        section: entry.section as ResumeLists['entries'][number]['section'],
        title: entry.title,
        detail: entry.detail,
        year: entry.year,
      })),
    };

    startLinksSave(async () => {
      const result = await runAction(() => saveResumeLists(lists));

      if (!result.ok) {
        push(result.message ?? 'The links were not saved. Try again in a moment.', 'error');
        return;
      }

      setLinksNotice(result.warning ?? null);
      linksFlag.settle(at);
      push('Your links are saved.');
    });
  }

  return (
    <div className="grid gap-12">
      <section>
        <SaveBar
          title="Your contact page"
          description="The words at the top, how people reach you, and the two files they can download. This button saves everything in this half. The links below have their own button."
          label="Save the contact page"
          busy={savingPage}
          dirty={pageFlag.dirty}
          onSave={onSavePage}
        />

        <Notice text={pageNotice} />

        <div className="grid gap-6">
          <Panel
            title="The top of the page"
            description="The two small lines around the word Contact, at the very top."
          >
            <Field
              label="Line above the title"
              htmlFor="contact-status"
              hint="Sits beside where you are. Left blank it reads Available now."
            >
              <Input
                value={fields.contactStatus}
                placeholder={CONTACT_DEFAULTS.status}
                onChange={(event) => setField('contactStatus', event.target.value)}
              />
            </Field>

            <Field
              label="What you are looking for"
              htmlFor="contact-availability"
              hint="The sentence under the word Contact. It is also printed on the portfolio PDF the site makes."
            >
              <Input
                value={fields.availability}
                placeholder="Seeking a position with a professional firm"
                onChange={(event) => setField('availability', event.target.value)}
              />
            </Field>
          </Panel>

          <Panel
            title="The invitation"
            description="The block on the left of the page, above your email address."
          >
            <Field
              label="Heading"
              htmlFor="contact-heading"
              hint="Above the invitation to write. Left blank it reads Write to me."
            >
              <Input
                value={fields.contactHeading}
                placeholder={CONTACT_DEFAULTS.heading}
                onChange={(event) => setField('contactHeading', event.target.value)}
              />
            </Field>

            <Field
              label="The invitation itself"
              htmlFor="contact-blurb"
              hint="A short paragraph under the heading, saying what to send you and what you will send back. Left blank it falls back to the wording the site launched with."
            >
              <Textarea
                rows={4}
                value={fields.contactBlurb}
                placeholder={CONTACT_DEFAULTS.blurb}
                onChange={(event) => setField('contactBlurb', event.target.value)}
              />
            </Field>
          </Panel>

          <Panel
            title="How people reach you"
            description="Your email address is the only route on the contact page, so it has to be right. These three also appear on the home page, the resume page and the footer of every page."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email address" htmlFor="contact-email" required error={errors.email}>
                <Input
                  type="email"
                  value={fields.email}
                  placeholder="you@example.com"
                  onChange={(event) => setField('email', event.target.value)}
                />
              </Field>

              <Field label="Telephone number" htmlFor="contact-phone" required error={errors.phone}>
                <Input
                  type="tel"
                  value={fields.phone}
                  placeholder="613-291-8074"
                  onChange={(event) => setField('phone', event.target.value)}
                />
              </Field>

              <Field
                label="Where you are"
                htmlFor="contact-location"
                required
                error={errors.location}
                hint="Shown beside the line above the title, and again under Based in."
              >
                <Input
                  value={fields.location}
                  placeholder="Ottawa, Ontario"
                  onChange={(event) => setField('location', event.target.value)}
                />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Your PDFs"
            description="The two files people download from the site. Each button only appears once its file is here."
          >
            <DocumentSlot
              title="Resume PDF"
              hint="One of the two download buttons on this page, and the one on your resume page."
              file={cv}
              onClear={() => setCv(null)}
              onUploaded={(items) => {
                const file = firstFile(items);
                if (file) setCv(file);
              }}
            />

            <DocumentSlot
              title="Portfolio PDF"
              hint="The other download button on this page."
              file={portfolio}
              onClear={() => setPortfolio(null)}
              onUploaded={(items) => {
                const file = firstFile(items);
                if (file) setPortfolio(file);
              }}
            />
          </Panel>
        </div>
      </section>

      <section>
        <SaveBar
          title="Where else you are"
          description="The links under Elsewhere on the contact page. Leave this empty and the whole block is left off. This button saves the links only."
          label="Save the links"
          busy={savingLinks}
          dirty={linksFlag.dirty}
          onSave={onSaveLinks}
        />

        <Notice text={linksNotice} />

        <Panel
          title="Links"
          description="Each one is a name and an address. Drag the handle on the left of any row to move it, or focus the handle and use the arrow keys."
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
