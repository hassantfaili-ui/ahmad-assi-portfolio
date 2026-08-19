'use client';

import Link from 'next/link';
import { useCallback, useState, useTransition } from 'react';

import { FilmEditor, type EditorFilm } from '@/components/admin/FilmEditor';
import {
  MediaPanel,
  type EditorDrawing,
  type EditorGroup,
  type EditorMedia,
} from '@/components/admin/MediaPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { saveProject, setProjectPublished } from '@/lib/mutations';
import {
  CATEGORIES,
  STATUSES,
  STATUS_LABELS,
  TIERS,
  hasErrors,
  validateProject,
  type FieldErrors,
  type ProjectInput,
} from '@/lib/validation';

/**
 * The whole editing screen: the words on the left, the pictures on the right.
 *
 * MediaPanel is rendered from here rather than beside here, and that is the one
 * thing about this file worth explaining. The cover is chosen from the
 * project's own pictures, which MediaPanel holds, but it is stored on the
 * project row and saved by saveProject, which this form calls. One of the two
 * has to own it. Putting it here means the cover cannot be saved without the
 * details it belongs to, which is the pairing that matches how it is stored.
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
  leadImageId: string | null;
  leadImageAlt: string;
  leadImage: EditorMedia | null;
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

export function ProjectForm({ project, groups, drawings, film }: ProjectFormProps) {
  const { push } = useToast();

  const [values, setValues] = useState<FormValues>(() => initialValues(project));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [published, setPublished] = useState(project.published);
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();

  const update = useCallback((changes: Partial<FormValues>) => {
    setValues((current) => ({ ...current, ...changes }));
    setUnsaved(true);
  }, []);

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

  const save = useCallback(() => {
    const input = toInput(values);

    /* Checked here first so the answer is instant and nothing is sent that is
       going to come back refused. The server checks the same rules again,
       because this half can be skipped and that half cannot. */
    const found = validateProject(input);
    if (hasErrors(found)) {
      setErrors(found);
      push('Some of this is still missing. The parts that need something are marked.', 'error');
      return;
    }

    startSave(async () => {
      const result = await saveProject(project.id, input);

      if (!result.ok) {
        setErrors(result.errors ?? {});
        push(result.message ?? 'Nothing was saved. The parts that need something are marked.', 'error');
        return;
      }

      setErrors({});
      setWarning(result.warning ?? null);
      setUnsaved(false);

      /* The web address that came back can differ from the one typed, because
         another project already had it. Showing the old one would leave him
         with a link that does not work. */
      const savedSlug = result.data?.slug;
      if (savedSlug && savedSlug !== input.slug) {
        setValues((current) => ({ ...current, slug: savedSlug }));
        push(`Saved. Another project already used that web address, so this one is ${savedSlug}.`);
        return;
      }

      push('Saved.');
    });
  }, [values, project.id, push]);

  const togglePublished = useCallback(() => {
    const next = !published;
    startPublish(async () => {
      const result = await setProjectPublished(project.id, next);

      if (!result.ok) {
        push(result.message ?? 'That did not change. Try again.', 'error');
        return;
      }

      setPublished(next);
      push(next ? 'This project is on the site now.' : 'This project is off the site now.');
    });
  }, [published, project.id, push]);

  return (
    <div className="grid gap-6">
      <div className="sticky top-0 z-20 -mx-6 flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-neutral-50/95 px-6 py-3 backdrop-blur">
        <div className="min-w-0">
          <Link href="/admin" className="text-xs text-neutral-500 hover:text-neutral-900">
            All projects
          </Link>
          <h1 className="truncate text-lg font-semibold">{values.title || 'Untitled project'}</h1>
        </div>

        <Badge variant={published ? 'secondary' : 'warning'}>
          {published ? 'On the site' : 'Not on the site'}
        </Badge>
        {unsaved && <Badge variant="warning">Not saved yet</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {published && (
            <a
              href={`/work/${project.slug}/`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
            >
              See the page
            </a>
          )}

          <Button type="button" variant="outline" onClick={togglePublished} disabled={publishing}>
            {published ? 'Take it off the site' : 'Put it on the site'}
          </Button>

          <Button type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving' : 'Save the details'}
          </Button>
        </div>
      </div>

      {warning && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {warning}
        </p>
      )}

      <div className="grid items-start gap-10 lg:grid-cols-2">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Field label="Title" htmlFor="project-title" required error={errors.title}>
            <Input
              value={values.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Field>

          <Field
            label="Web address"
            htmlFor="project-slug"
            required
            error={errors.slug}
            hint="This is the end of the page's address on the internet. Changing it changes where the page lives, so any link to the old address, in an email you have sent or on somebody else's site, stops working."
          >
            <Input value={values.slug} onChange={(event) => update({ slug: event.target.value })} />
          </Field>

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

            <Field label="Where it is" htmlFor="project-location" required error={errors.location}>
              <Input
                value={values.location}
                onChange={(event) => update({ location: event.target.value })}
              />
            </Field>

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

            <Field label="Your role" htmlFor="project-role" required error={errors.role}>
              <Input
                value={values.role}
                onChange={(event) => update({ role: event.target.value })}
              />
            </Field>
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

          <div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving' : 'Save the details'}
            </Button>
          </div>
        </form>

        <div className="grid gap-10">
          <MediaPanel
            projectId={project.id}
            slug={project.slug}
            initialGroups={groups}
            initialDrawings={drawings}
            leadImageId={values.leadImageId}
            leadImageAlt={values.leadImageAlt}
            leadImage={project.leadImage}
            leadImageAltError={errors.leadImageAlt}
            onLeadImageChange={chooseLeadImage}
            onLeadImageAltChange={changeLeadImageAlt}
          />

          <FilmEditor projectId={project.id} initialFilm={film} />
        </div>
      </div>
    </div>
  );
}
