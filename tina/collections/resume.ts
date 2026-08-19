import type { Collection } from 'tinacms';

/** Title, detail and year: the shape every dated list on the resume shares. */
const dated = (name: string, label: string) => ({
  type: 'object' as const,
  name,
  label,
  list: true,
  ui: { itemProps: (item: { title?: string }) => ({ label: item?.title || 'Untitled' }) },
  fields: [
    { type: 'string' as const, name: 'title', label: 'Title' },
    { type: 'string' as const, name: 'detail', label: 'Detail' },
    { type: 'string' as const, name: 'year', label: 'Year' },
  ],
});

/**
 * One person's record, so one file rather than a collection.
 *
 * Tina has no singleton, so this is a collection pinned to a single document
 * with creating and deleting turned off. `match` keeps it to resume.json alone,
 * which matters because src/data is an ordinary source folder and anything else
 * that lands there must not turn into an editable page.
 *
 * It drives two pages, the resume and the contact details, which is why the
 * router points at the resume: that is where most of these fields are visible,
 * so it is the useful thing to open when Ahmad clicks Resume in the sidebar.
 */
export const ResumeCollection: Collection = {
  name: 'resume',
  label: 'Resume',
  path: 'src/data',
  format: 'json',
  match: { include: 'resume' },
  ui: {
    router: () => '/resume',
    allowedActions: { create: false, delete: false },
  },
  fields: [
    { type: 'string', name: 'name', label: 'Name', isTitle: true, required: true },
    { type: 'string', name: 'discipline', label: 'Discipline' },
    {
      type: 'string',
      name: 'credential',
      label: 'Credentials',
      description: 'For example OAA, MRAIC.',
    },
    { type: 'string', name: 'registration', label: 'Registration' },
    { type: 'string', name: 'location', label: 'Location' },
    { type: 'string', name: 'yearsExperience', label: 'Years in practice' },
    { type: 'string', name: 'availability', label: 'Availability' },
    {
      type: 'string',
      name: 'issued',
      label: 'Issue date',
      description: 'Appears in the title block, formatted like 2026.07.',
    },
    {
      type: 'string',
      name: 'welcome',
      label: 'Welcome line',
      description: 'The small line above the name on the home page.',
    },
    {
      type: 'string',
      name: 'positioning',
      label: 'Introduction',
      description: 'The paragraph under the name on the home page.',
      ui: { component: 'textarea' },
    },
    {
      type: 'string',
      name: 'longBio',
      label: 'Biography',
      list: true,
      ui: { component: 'textarea' },
    },
    { type: 'string', name: 'portraitAlt', label: 'Portrait alt text' },
    {
      type: 'string',
      name: 'cvFile',
      label: 'CV PDF path',
      description:
        'Put the PDF in public/cv/ and enter its path, for example /cv/ahmad-assi-cv.pdf. Leave empty to hide the download button.',
    },
    {
      type: 'string',
      name: 'portfolioFile',
      label: 'Portfolio PDF path',
      description:
        'Generated from this site by npm run portfolio, so the PDF and the ' +
        'link always show the same projects in the same order. Leave empty to ' +
        'hide the download button.',
    },
    { type: 'string', name: 'email', label: 'Email' },
    { type: 'string', name: 'phone', label: 'Phone' },
    {
      type: 'object',
      name: 'social',
      label: 'Social links',
      list: true,
      ui: { itemProps: (item) => ({ label: item?.label || 'Link' }) },
      fields: [
        { type: 'string', name: 'label', label: 'Name' },
        { type: 'string', name: 'href', label: 'Link' },
      ],
    },
    {
      type: 'object',
      name: 'facts',
      label: 'Cover sheet facts',
      description: 'The four scannable facts under the cover rule.',
      list: true,
      ui: { itemProps: (item) => ({ label: item?.label || 'Fact' }) },
      fields: [
        { type: 'string', name: 'label', label: 'Label' },
        { type: 'string', name: 'value', label: 'Value' },
      ],
    },
    {
      type: 'object',
      name: 'experience',
      label: 'Experience',
      list: true,
      ui: {
        itemProps: (item) => ({ label: `${item?.role || 'Role'}, ${item?.firm || ''}` }),
      },
      fields: [
        { type: 'string', name: 'role', label: 'Role' },
        { type: 'string', name: 'firm', label: 'Firm' },
        { type: 'string', name: 'location', label: 'Location' },
        {
          type: 'string',
          name: 'period',
          label: 'Period',
          description: 'For example 2021 to present.',
        },
        {
          type: 'string',
          name: 'contributions',
          label: 'Contributions',
          list: true,
          ui: { component: 'textarea' },
        },
      ],
    },
    {
      type: 'object',
      name: 'education',
      label: 'Education',
      list: true,
      ui: { itemProps: (item) => ({ label: item?.credential || 'Degree' }) },
      fields: [
        { type: 'string', name: 'credential', label: 'Credential' },
        { type: 'string', name: 'institution', label: 'Institution' },
        { type: 'string', name: 'year', label: 'Year' },
        { type: 'string', name: 'note', label: 'Note', ui: { component: 'textarea' } },
      ],
    },
    {
      type: 'object',
      name: 'skillGroups',
      label: 'Skill groups',
      list: true,
      ui: { itemProps: (item) => ({ label: item?.label || 'Group' }) },
      fields: [
        { type: 'string', name: 'label', label: 'Group name' },
        { type: 'string', name: 'items', label: 'Skills', list: true },
      ],
    },
    { type: 'string', name: 'languages', label: 'Languages', list: true },
    dated('volunteering', 'Volunteering and community'),
    dated('awards', 'Awards'),
    dated('publications', 'Writing'),
    dated('exhibitions', 'Exhibitions'),
    {
      type: 'string',
      name: 'references',
      label: 'References note',
      description: 'Shown at the foot of the resume page.',
    },
  ],
};
