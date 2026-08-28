'use client';

import { useState, useTransition } from 'react';

import { SiteFilmEditor, type SiteFilmValue } from '@/components/admin/HeroFilmEditor';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useSaveFlag } from '@/hooks/use-save-flag';
import { runAction } from '@/lib/action-result';
import { saveProfile, type ProfileInput } from '@/lib/mutations';
import { hasErrors, validateProfile, type FieldErrors } from '@/lib/validation';

/**
 * The home page, edited in the order a visitor meets it.
 *
 * Top to bottom: the film behind the name, then the words at the top, then the
 * film behind About and Get in touch at the foot of the page. That order is the
 * whole idea of the screen. Grouping by what the thing is in the database, one
 * screen for films and another for text, is how the hero film ended up under
 * Settings, a place nobody looking for the home page would think to open.
 *
 * Three saves, not one, and each sits with what it saves. The two films are
 * separate rows written by separate actions, and the words are a third write
 * over the whole profile, so one button over all three would mean a corrected
 * spelling of a name re-uploading nothing and a film upload rewriting the
 * profile. Each half also stays unsaved on its own, which is what the badges
 * beside each button are saying.
 */

/**
 * Exactly what this screen reads, declared here rather than imported from
 * src/lib/queries.ts, because that module is server only. The shape getProfile
 * returns satisfies it, so the page hands its result straight over.
 *
 * Every field is here, not only the three with boxes on this screen, because
 * saveProfile writes the whole row. What is not sent is not left alone, it is
 * overwritten with nothing, so the untouched fields have to make the round trip
 * as they were.
 */
export interface HomeProfile {
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
  portraitMedia: { id: string } | null;
  portraitAlt: string;
  cvMedia: { id: string } | null;
  portfolioMedia: { id: string } | null;
  email: string;
  phone: string;
  references: string;
  contactStatus: string;
  contactHeading: string;
  contactBlurb: string;
}

/** The three boxes on this screen. The rest of the profile is carried, not shown. */
type TopFields = {
  welcome: string;
  name: string;
  discipline: string;
  location: string;
};

/**
 * A missing detail this screen has no box for.
 *
 * validateProfile checks the whole profile, so a save from here can be refused
 * over an email address that is edited on the Resume screen. Without this the
 * button would appear to do nothing at all, which is the worst way for a
 * refusal to arrive.
 */
function elsewhereErrors(errors: FieldErrors): string[] {
  const mine = new Set(['name', 'discipline', 'location', 'welcome']);
  return Object.entries(errors)
    .filter(([field]) => !mine.has(field))
    .map(([, message]) => message);
}

export function HomeForm({
  profile,
  hero,
  closing,
}: {
  profile: HomeProfile | null;
  hero: SiteFilmValue | null;
  closing: SiteFilmValue | null;
}) {
  const { push } = useToast();

  /* Counts edits rather than latching a boolean. A save leaves the boxes live
     while it is out, and on a slow line that is seconds in which a sentence can
     be typed into a field the payload had already left without. See
     src/hooks/use-save-flag.ts. */
  const flag = useSaveFlag();
  useRegisterUnsaved('home:words', flag.dirty);

  const [fields, setFields] = useState<TopFields>(() => ({
    name: profile?.name ?? '',
    discipline: profile?.discipline ?? '',
    location: profile?.location ?? '',
    welcome: profile?.welcome ?? '',
  }));

  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const setField = (field: keyof TopFields, value: string) => {
    flag.markDirty();
    setFields((current) => ({ ...current, [field]: value }));
  };

  function onSave() {
    // Taken before the payload is read out of state, and handed to settle when
    // the answer comes back. Anything typed into these boxes in between bumps
    // the counter past this number, settle then leaves the badge up, and the
    // work that never went is still marked as work.
    const at = flag.snapshot();

    /* The whole profile goes, because saveProfile writes the whole row. The
       fields with no box on this screen are sent back exactly as they arrived,
       which is what stops editing a name from emptying the contact page. */
    const input: ProfileInput = {
      name: fields.name,
      discipline: fields.discipline,
      location: fields.location,
      welcome: fields.welcome,
      credential: profile?.credential ?? '',
      registration: profile?.registration ?? '',
      yearsExperience: profile?.yearsExperience ?? '',
      availability: profile?.availability ?? '',
      issued: profile?.issued ?? '',
      positioning: profile?.positioning ?? '',
      longBio: profile?.longBio ?? [],
      portraitMediaId: profile?.portraitMedia?.id ?? null,
      portraitAlt: profile?.portraitAlt ?? '',
      cvMediaId: profile?.cvMedia?.id ?? null,
      portfolioMediaId: profile?.portfolioMedia?.id ?? null,
      email: profile?.email ?? '',
      phone: profile?.phone ?? '',
      references: profile?.references ?? '',
      contactStatus: profile?.contactStatus ?? '',
      contactHeading: profile?.contactHeading ?? '',
      contactBlurb: profile?.contactBlurb ?? '',
    };

    // Checked here first so an empty name says so straight away rather than
    // after a round trip. The same rules run again on the server.
    const found = validateProfile(input);
    if (hasErrors(found)) {
      setErrors(found);
      setNotice(null);
      push('A couple of these still need filling in. They are marked below.', 'error');
      return;
    }

    startSave(async () => {
      const result = await runAction(() => saveProfile(input));

      if (!result.ok) {
        setErrors(result.errors ?? {});
        push(result.message ?? 'Nothing was saved. Check the boxes marked below.', 'error');
        return;
      }

      setErrors({});
      setNotice(result.warning ?? null);
      flag.settle(at);
      push('Saved. The home page reads this now.');
    });
  }

  const missingElsewhere = elsewhereErrors(errors);

  return (
    <div className="grid gap-12">
      <SiteFilmEditor film={hero} slot="hero" />

      <section className="grid gap-6 border-t border-neutral-200 pt-10" aria-labelledby="home-words">
        <div className="grid gap-1">
          <h2 id="home-words" className="text-lg font-semibold tracking-tight">
            Your name, at the top of the page
          </h2>
          <p className="text-sm text-neutral-600">
            The large name over the film, and the small line above it. These also appear in the
            header and the footer of every other page, so a change here is a change across the
            site.
          </p>
        </div>

        {notice && (
          <p
            role="status"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {notice}
          </p>
        )}

        {missingElsewhere.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <p className="font-medium">Nothing was saved</p>
            <p className="mt-1">
              Some of your details are missing, and they are not on this screen. Open Resume and
              fill them in, then come back here.
            </p>
            <ul className="mt-1 grid gap-1">
              {missingElsewhere.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-5 rounded-xl border border-neutral-200 bg-white p-6">
          <Field
            label="Your name"
            htmlFor="home-name"
            required
            error={errors.name}
            hint="Set large across the top of the home page. Your first name sits on one line and the rest underneath."
          >
            <Input
              value={fields.name}
              placeholder="Ahmad Assi"
              onChange={(event) => setField('name', event.target.value)}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="What you do"
              htmlFor="home-discipline"
              required
              error={errors.discipline}
              hint="The small line above your name, on the left of the slash."
            >
              <Input
                value={fields.discipline}
                placeholder="Architectural Designer"
                onChange={(event) => setField('discipline', event.target.value)}
              />
            </Field>

            <Field
              label="Where you are"
              htmlFor="home-location"
              required
              error={errors.location}
              hint="The right of the slash, in that same small line."
            >
              <Input
                value={fields.location}
                placeholder="Ottawa, Ontario"
                onChange={(event) => setField('location', event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="The sentences under your name"
            htmlFor="home-welcome"
            required
            error={errors.welcome}
            hint="The short paragraph directly under your name on the home page, saying what you studied and what you work on. Two or three sentences reads best."
          >
            <Textarea
              rows={4}
              value={fields.welcome}
              placeholder="A graduate of the Bachelor of Architectural Studies at Carleton University, majoring in urbanism."
              onChange={(event) => setField('welcome', event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? 'Saving' : 'Save'}
          </Button>
          {flag.dirty && <Badge variant="warning">Not saved yet</Badge>}
          {!saving && (
            <p className="text-sm text-neutral-600">
              {flag.dirty
                ? 'You have changes that are not on the site yet.'
                : 'Nothing has changed since you last saved.'}
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-6 border-t border-neutral-200 pt-10">
        <SiteFilmEditor film={closing} slot="closing" />

        {/* The band this film plays behind is written on another screen, and
            nothing on this one hints at that. */}
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          The writing in that band, the About paragraphs and the ways to reach you, is edited on the
          Resume screen.
        </p>
      </section>
    </div>
  );
}
