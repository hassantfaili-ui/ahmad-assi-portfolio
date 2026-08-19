import type { Collection } from 'tinacms';
import { filmField } from '../fields/film';

/**
 * One project, one markdown file, exactly as before.
 *
 * Every field name here matches the frontmatter key it already had under
 * Keystatic, so not a single content file needed rewriting when the editor
 * changed. `src/content/projects/lincoln-beach-center.md` parses the same way
 * it always did; only the thing reading it is new.
 *
 * The order of the fields is the order Ahmad meets them in the sidebar, so it
 * runs identity, then placement, then pictures, rather than schema order.
 */

/**
 * One image or drawing slot: the file and the sentence that describes it.
 *
 * Alt text is required for the same reason it always was. It is what a screen
 * reader says out loud, and an image with none is a hole in the page for the
 * person who most needs the description. The editor refuses to save without it
 * rather than letting it through and hoping somebody notices later.
 */
const imageSlot = [
  {
    type: 'image' as const,
    name: 'src',
    label: 'Image',
    description: 'Choose a file, or drag one in. It is stored with the site.',
    required: true,
  },
  {
    type: 'string' as const,
    name: 'alt',
    label: 'Alt text',
    description: 'Describe the drawing for someone who cannot see it. Required.',
    required: true,
  },
];

export const ProjectsCollection: Collection = {
  name: 'projects',
  label: 'Projects',
  path: 'src/content/projects',
  format: 'md',
  /* The address of the page this document draws, so the admin can open the real
     project page and let Ahmad edit on top of it rather than beside it. This one
     line is the whole difference between a form and inline editing. */
  ui: {
    router: ({ document }) => `/work/${document._sys.filename}`,
    filename: {
      /* Derived from the title, the way Keystatic's slug field did, so a new
         project lands at /work/a-readable-name without anybody typing one. */
      slugify: (values) =>
        `${values?.title ?? ''}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60),
    },
  },
  fields: [
    {
      type: 'string',
      name: 'title',
      label: 'Project title',
      isTitle: true,
      required: true,
    },
    {
      type: 'string',
      name: 'sheet',
      label: 'Sheet number',
      description: 'Formatted like A-107. Each project needs its own.',
      required: true,
      ui: {
        validate: (value?: string) =>
          value && !/^A-\d{3}$/.test(value) ? 'Sheet numbers look like A-107' : undefined,
      },
    },
    {
      type: 'string',
      name: 'category',
      label: 'Category',
      required: true,
      options: ['Residential', 'Cultural', 'Commercial', 'Academic', 'Competition'],
    },
    { type: 'number', name: 'year', label: 'Year', required: true },
    { type: 'string', name: 'location', label: 'Location', required: true },
    { type: 'string', name: 'buildingType', label: 'Building type', required: true },
    {
      type: 'string',
      name: 'area',
      label: 'Area',
      description: 'For example 240 m2. Optional.',
    },
    {
      type: 'string',
      name: 'status',
      label: 'Status',
      required: true,
      options: [
        'Built',
        'Under construction',
        'Design development',
        'Unbuilt',
        'Competition',
        'Academic',
      ],
    },
    {
      type: 'string',
      name: 'role',
      label: 'Your role',
      description: 'For example Project architect.',
      required: true,
    },
    {
      type: 'string',
      name: 'contribution',
      label: 'What you personally did',
      description:
        'Kept separate from the project description on purpose. On team projects this is what a reviewer is assessing.',
      required: true,
      ui: { component: 'textarea' },
    },
    {
      type: 'string',
      name: 'summary',
      label: 'One line summary',
      description: 'Shown under the project title and in search results.',
      required: true,
      ui: { component: 'textarea' },
    },
    {
      type: 'string',
      name: 'credit',
      label: 'Credit, short',
      description:
        'Who did the work, in a few words, for the project card. For example ' +
        'Sole author, With Kyle Mo, Group of five. Required: a portfolio that ' +
        'does not say which projects were group work is misleading, and a ' +
        'reviewer assumes the worst when it is missing.',
      required: true,
    },
    {
      type: 'string',
      name: 'tier',
      label: 'Where it sits on the projects page',
      description:
        'The top three are the large cards. The set is the strip under them. ' +
        'The archive is the short list at the bottom, for coursework that ' +
        'should stay on the site without competing with the strong work. ' +
        'Only three can be in the top three: a fourth falls into the set ' +
        'rather than disappearing.',
      options: [
        { value: 'lead', label: 'The top three, large card' },
        { value: 'set', label: 'The set, in the strip' },
        { value: 'index', label: 'The archive, a line in the list' },
      ],
    },
    {
      type: 'number',
      name: 'order',
      label: 'Order in the set',
      description: 'Lower numbers come first.',
    },
    {
      type: 'object',
      name: 'leadImage',
      label: 'Lead image',
      fields: imageSlot,
    },
    {
      type: 'object',
      name: 'imageGroups',
      label: 'Image groups',
      list: true,
      ui: {
        itemProps: (item) => ({ label: item?.layout || 'Group' }),
      },
      fields: [
        {
          type: 'string',
          name: 'layout',
          label: 'Layout',
          options: [
            { value: 'full', label: 'Full width, one image' },
            { value: 'pair', label: 'Pair, two side by side' },
            { value: 'triptych', label: 'Triptych, three across' },
          ],
        },
        {
          type: 'string',
          name: 'caption',
          label: 'Caption',
          ui: { component: 'textarea' },
        },
        {
          type: 'object',
          name: 'images',
          label: 'Images',
          list: true,
          ui: { itemProps: (item) => ({ label: item?.alt || 'Image' }) },
          fields: imageSlot,
        },
      ],
    },
    {
      type: 'object',
      name: 'drawings',
      label: 'Drawings',
      description: 'Plans, sections and elevations. These open full screen.',
      list: true,
      ui: { itemProps: (item) => ({ label: item?.drawingType || 'Drawing' }) },
      fields: [
        ...imageSlot,
        {
          type: 'string',
          name: 'drawingType',
          label: 'Drawing type',
          description: 'For example Ground floor plan, Long section.',
        },
      ],
    },
    {
      type: 'object',
      name: 'film',
      label: 'Walkthrough film',
      description:
        'Leave every box empty if this project has no film. A film needs a poster ' +
        'frame and either an uploaded file or a YouTube link.',
      fields: [
        filmField,
        {
          type: 'string',
          name: 'youtube',
          label: 'YouTube id or link',
          description:
            'An alternative to uploading. Unlisted is fine. Paste the id or the whole link. ' +
            'Ignored when a film file is set above.',
        },
        {
          type: 'image',
          name: 'poster',
          label: 'Poster frame',
          description: 'The still shown before the film plays. Required for a film to appear.',
        },
        {
          type: 'string',
          name: 'caption',
          label: 'Caption',
          ui: { component: 'textarea' },
        },
      ],
    },
    {
      type: 'rich-text',
      name: 'body',
      label: 'Brief',
      isBody: true,
    },
  ],
};
