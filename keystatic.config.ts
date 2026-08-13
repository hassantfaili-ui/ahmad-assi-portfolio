import { config, fields, collection, singleton } from '@keystatic/core';

/**
 * The visual editor. Run `npm run dev` and open /keystatic.
 *
 * Storage is local, so edits are written straight to the files in this
 * repository and reviewed like any other change. Switch `kind` to 'github'
 * once Ahmad has a GitHub account and hosting, and the same schemas serve an
 * online editor with no other change.
 */

/**
 * One image or drawing slot.
 *
 * `src` is a real upload field, not a path to type. Choosing a file writes it
 * into public/media and stores /media/<name>, which is the same string the site
 * already expects, so nothing else had to change. Removing an image in the
 * editor removes it from the page.
 *
 * It is required on purpose: an entry saved with no image would fail the content
 * schema at build time and stop the site deploying, which is a bad way to find
 * out. Better that the editor refuses to save it.
 */
const imageSlot = {
  src: fields.image({
    label: 'Image',
    description: 'Choose a file, or drag one in. It is stored with the site.',
    directory: 'public/media',
    publicPath: '/media/',
    validation: { isRequired: true },
  }),
  alt: fields.text({
    label: 'Alt text',
    description: 'Describe the drawing for someone who cannot see it. Required.',
    validation: { isRequired: true },
  }),
  kind: fields.select({
    label: 'Placeholder type',
    description: 'Which kind of line work to draw while there is no real file.',
    options: [
      { label: 'Interior perspective', value: 'photo' },
      { label: 'Plan', value: 'plan' },
      { label: 'Section', value: 'section' },
      { label: 'Elevation', value: 'elevation' },
      { label: 'Axonometric', value: 'axonometric' },
      { label: 'Site plan', value: 'site' },
    ],
    defaultValue: 'photo',
  }),
  seed: fields.integer({
    label: 'Placeholder seed',
    description: 'Change this number to redraw the placeholder differently.',
    defaultValue: 1,
  }),
};

const dated = (label: string) =>
  fields.array(
    fields.object({
      title: fields.text({ label: 'Title' }),
      detail: fields.text({ label: 'Detail' }),
      year: fields.text({ label: 'Year' }),
    }),
    { label, itemLabel: (props) => props.fields.title.value || 'Untitled' },
  );

/**
 * Where saving writes to.
 *
 * With PUBLIC_KEYSTATIC_GITHUB_REPO set, the editor commits straight to the
 * repository over GitHub, Netlify rebuilds, and the change is live in about a
 * minute. Without it, saving writes to the files on this machine, which is what
 * `npm run dev` does.
 *
 * Either way every edit is an ordinary, reviewable commit rather than something
 * that happened invisibly inside a database.
 *
 * This file is loaded in the browser as well as on the server, so the value has
 * to come from import.meta.env, which Vite replaces at build time. Reading
 * process.env here throws "process is not defined" and the whole editor fails to
 * hydrate.
 */
const repo = import.meta.env.PUBLIC_KEYSTATIC_GITHUB_REPO;

export default config({
  storage: repo
    ? { kind: 'github', repo: repo as `${string}/${string}` }
    : { kind: 'local' },
  ui: {
    brand: { name: 'Ahmad Assi, architect' },
    navigation: { Content: ['projects', 'resume'] },
  },

  collections: {
    projects: collection({
      label: 'Projects',
      slugField: 'title',
      path: 'src/content/projects/*',
      format: { contentField: 'content' },
      columns: ['sheet', 'category', 'year'],
      schema: {
        title: fields.slug({ name: { label: 'Project title' } }),
        sheet: fields.text({
          label: 'Sheet number',
          description: 'Formatted like A-107. Each project needs its own.',
          defaultValue: 'A-107',
          validation: { pattern: { regex: /^A-\d{3}$/, message: 'Sheet numbers look like A-107' } },
        }),
        category: fields.select({
          label: 'Category',
          options: [
            { label: 'Residential', value: 'Residential' },
            { label: 'Cultural', value: 'Cultural' },
            { label: 'Commercial', value: 'Commercial' },
            { label: 'Academic', value: 'Academic' },
            { label: 'Competition', value: 'Competition' },
          ],
          defaultValue: 'Residential',
        }),
        year: fields.integer({ label: 'Year', defaultValue: 2026 }),
        location: fields.text({ label: 'Location' }),
        buildingType: fields.text({ label: 'Building type' }),
        area: fields.text({ label: 'Area', description: 'For example 240 m2. Optional.' }),
        status: fields.select({
          label: 'Status',
          options: [
            { label: 'Built', value: 'Built' },
            { label: 'Under construction', value: 'Under construction' },
            { label: 'Design development', value: 'Design development' },
            { label: 'Unbuilt', value: 'Unbuilt' },
            { label: 'Competition', value: 'Competition' },
            { label: 'Academic', value: 'Academic' },
          ],
          defaultValue: 'Built',
        }),
        role: fields.text({ label: 'Your role', description: 'For example Project architect.' }),
        contribution: fields.text({
          label: 'What you personally did',
          description:
            'Kept separate from the project description on purpose. On team projects this is what a reviewer is assessing.',
          multiline: true,
        }),
        summary: fields.text({
          label: 'One line summary',
          description: 'Shown under the project title and in search results.',
          multiline: true,
        }),
        leadImage: fields.object(imageSlot, { label: 'Lead image' }),
        imageGroups: fields.array(
          fields.object({
            layout: fields.select({
              label: 'Layout',
              options: [
                { label: 'Full width, one image', value: 'full' },
                { label: 'Pair, two side by side', value: 'pair' },
                { label: 'Triptych, three across', value: 'triptych' },
              ],
              defaultValue: 'pair',
            }),
            caption: fields.text({ label: 'Caption', multiline: true }),
            images: fields.array(fields.object(imageSlot), {
              label: 'Images',
              itemLabel: (props) => props.fields.alt.value || 'Image',
            }),
          }),
          { label: 'Image groups', itemLabel: (props) => props.fields.layout.value },
        ),
        drawings: fields.array(
          fields.object({
            ...imageSlot,
            drawingType: fields.text({
              label: 'Drawing type',
              description: 'For example Ground floor plan, Long section.',
            }),
          }),
          {
            label: 'Drawings',
            description: 'Plans, sections and elevations. These open full screen.',
            itemLabel: (props) => props.fields.drawingType.value || 'Drawing',
          },
        ),
        film: fields.conditional(
          fields.checkbox({ label: 'This project has a walkthrough film', defaultValue: false }),
          {
            false: fields.empty(),
            true: fields.object({
              youtube: fields.text({
                label: 'YouTube id or link',
                description:
                  'Preferred for anything long or high resolution. Unlisted is fine. Paste the id or the whole link. Leave empty to use a file instead.',
              }),
              src: fields.text({
                label: 'Film file',
                description:
                  'Only if there is no YouTube id. A path under /media, for example /media/lincoln-beach-film.mp4. Keep files under 100MB or GitHub will reject them.',
              }),
              poster: fields.text({
                label: 'Poster frame',
                description: 'A still shown before it plays, for example /media/lincoln-beach-film-poster.jpg',
              }),
              caption: fields.text({ label: 'Caption', multiline: true }),
            }),
          },
        ),
        credit: fields.text({
          label: 'Credit, short',
          description:
            'Who did the work, in a few words, for the project card. For example ' +
            'Sole author, With Kyle Mo, Group of five. Required: a portfolio that ' +
            'does not say which projects were group work is misleading, and a ' +
            'reviewer assumes the worst when it is missing.',
          validation: { isRequired: true },
        }),
        tier: fields.select({
          label: 'Where it sits on the home page',
          description:
            'Lead projects are the large cards at the top, and there should be three. ' +
            'The set is the strip below them. The index is the short list at the ' +
            'bottom, for thin coursework that should stay on the site without ' +
            'competing with the strong work.',
          options: [
            { label: 'Lead, large card at the top', value: 'lead' },
            { label: 'The set, in the strip', value: 'set' },
            { label: 'The index, a line in the list', value: 'index' },
          ],
          defaultValue: 'set',
        }),
        order: fields.integer({
          label: 'Order in the set',
          description: 'Lower numbers come first.',
          defaultValue: 99,
        }),
        content: fields.markdoc({ label: 'Brief', extension: 'md' }),
      },
    }),
  },

  singletons: {
    resume: singleton({
      label: 'Resume',
      path: 'src/data/resume',
      format: { data: 'json' },
      schema: {
        name: fields.text({ label: 'Name' }),
        discipline: fields.text({ label: 'Discipline' }),
        credential: fields.text({ label: 'Credentials', description: 'For example OAA, MRAIC.' }),
        registration: fields.text({ label: 'Registration' }),
        location: fields.text({ label: 'Location' }),
        yearsExperience: fields.text({ label: 'Years in practice' }),
        availability: fields.text({ label: 'Availability' }),
        issued: fields.text({
          label: 'Issue date',
          description: 'Appears in the title block, formatted like 2026.07.',
        }),
        welcome: fields.text({
          label: 'Welcome line',
          description: 'The small line above the name on the home page.',
        }),
        positioning: fields.text({
          label: 'Introduction',
          description: 'The paragraph under the name on the home page.',
          multiline: true,
        }),
        longBio: fields.array(fields.text({ label: 'Paragraph', multiline: true }), {
          label: 'Biography',
          itemLabel: (props) => (props.value || '').slice(0, 48) || 'Paragraph',
        }),
        portraitAlt: fields.text({ label: 'Portrait alt text' }),
        cvFile: fields.text({
          label: 'CV PDF path',
          description:
            'Put the PDF in public/cv/ and enter its path, for example /cv/ahmad-assi-cv.pdf. Leave empty to hide the download button.',
        }),
        portfolioFile: fields.text({
          label: 'Portfolio PDF path',
          description:
            'Generated from this site by npm run portfolio, so the PDF and the ' +
            'link always show the same projects in the same order. Leave empty to ' +
            'hide the download button.',
        }),
        email: fields.text({ label: 'Email' }),
        phone: fields.text({ label: 'Phone' }),
        social: fields.array(
          fields.object({
            label: fields.text({ label: 'Name' }),
            href: fields.url({ label: 'Link' }),
          }),
          { label: 'Social links', itemLabel: (props) => props.fields.label.value || 'Link' },
        ),
        facts: fields.array(
          fields.object({
            label: fields.text({ label: 'Label' }),
            value: fields.text({ label: 'Value' }),
          }),
          {
            label: 'Cover sheet facts',
            description: 'The four scannable facts under the cover rule.',
            itemLabel: (props) => props.fields.label.value || 'Fact',
          },
        ),
        experience: fields.array(
          fields.object({
            role: fields.text({ label: 'Role' }),
            firm: fields.text({ label: 'Firm' }),
            location: fields.text({ label: 'Location' }),
            period: fields.text({ label: 'Period', description: 'For example 2021 to present.' }),
            contributions: fields.array(fields.text({ label: 'Contribution', multiline: true }), {
              label: 'Contributions',
              itemLabel: (props) => (props.value || '').slice(0, 48) || 'Contribution',
            }),
          }),
          {
            label: 'Experience',
            itemLabel: (props) =>
              `${props.fields.role.value || 'Role'}, ${props.fields.firm.value || ''}`,
          },
        ),
        education: fields.array(
          fields.object({
            credential: fields.text({ label: 'Credential' }),
            institution: fields.text({ label: 'Institution' }),
            year: fields.text({ label: 'Year' }),
            note: fields.text({ label: 'Note', multiline: true }),
          }),
          { label: 'Education', itemLabel: (props) => props.fields.credential.value || 'Degree' },
        ),
        skillGroups: fields.array(
          fields.object({
            label: fields.text({ label: 'Group name' }),
            items: fields.array(fields.text({ label: 'Skill' }), {
              label: 'Skills',
              itemLabel: (props) => props.value || 'Skill',
            }),
          }),
          { label: 'Skill groups', itemLabel: (props) => props.fields.label.value || 'Group' },
        ),
        languages: fields.array(fields.text({ label: 'Language' }), {
          label: 'Languages',
          itemLabel: (props) => props.value || 'Language',
        }),
        volunteering: dated('Volunteering and community'),
        awards: dated('Awards'),
        publications: dated('Writing'),
        exhibitions: dated('Exhibitions'),
        references: fields.text({
          label: 'References note',
          description: 'Shown at the foot of the resume page.',
        }),
      },
    }),
  },
});
