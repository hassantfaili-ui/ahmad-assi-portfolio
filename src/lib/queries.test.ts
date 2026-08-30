import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The public reads, answered in French.
 *
 * What is pinned down here is the fallback and the filing, because those are
 * the two things that decide whether the French site is usable at all.
 *
 * The fallback: Ahmad has seventeen projects and a resume to translate, and the
 * French pages have to read properly from the first sentence he writes, with
 * the English showing through everywhere else. So English winning where there
 * is no French is asserted field by field, not assumed.
 *
 * The filing: a translation points at its row by a plain string, and saving a
 * project writes new rows for its pictures, its drawings and its film. If the
 * reader looks under a different name than the writer filed under, nothing
 * fails and nothing is logged. The French simply never appears.
 */

vi.mock('server-only', () => ({}));

const { db } = vi.hoisted(() => ({
  db: {
    project: { findMany: vi.fn(), findFirst: vi.fn() },
    film: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn() },
    fact: { findMany: vi.fn() },
    socialLink: { findMany: vi.fn() },
    experienceEntry: { findMany: vi.fn() },
    educationEntry: { findMany: vi.fn() },
    skillGroup: { findMany: vi.fn() },
    language: { findMany: vi.fn() },
    resumeEntry: { findMany: vi.fn() },
    /* The arguments are spelled out so the implementation this file swaps in
       can read the where clause it was handed. */
    translation: {
      findMany: vi.fn(async (...args: unknown[]) => {
        void args;
        return [] as { recordId: string; field: string; value: string }[];
      }),
    },
  },
}));
vi.mock('@/lib/db', () => ({ db }));

import {
  getAdjacentProjects,
  getClosingFilm,
  getHeroFilm,
  getProfile,
  getProjectBySlug,
  getPublishedProjects,
  getSiteFilm,
  joinParagraphs,
  splitParagraphs,
} from './queries';

// ------------------------------------------------------------- the French ---

type Held = { model: string; recordId: string; field: string; value: string };

/** What the Translation table holds, answering the same query the reader runs. */
function frenchHeld(rows: Held[]): void {
  db.translation.findMany.mockImplementation(async (...args: unknown[]) => {
    const { where } = args[0] as {
      where: { locale: string; model: string; recordId: { in: string[] } };
    };
    return rows
      .filter(
        (row) =>
          where.locale === 'fr' &&
          row.model === where.model &&
          where.recordId.in.includes(row.recordId),
      )
      .map((row) => ({ recordId: row.recordId, field: row.field, value: row.value }));
  });
}

/** Which models were looked up, in the order they were asked for. */
function modelsLookedUp(): string[] {
  return db.translation.findMany.mock.calls.map(
    (call: unknown[]) => (call[0] as { where: { model: string } }).where.model,
  );
}

// ---------------------------------------------------------------- the rows ---

const media = (id: string) => ({
  id,
  key: `photo/${id}.jpg`,
  width: 2000,
  height: 1333,
  bytes: 400_000,
  contentType: 'image/jpeg',
  durationSeconds: null,
});

const SUMMARY = {
  id: 'p1',
  slug: 'lincoln-beach',
  title: 'Lincoln Beach',
  category: 'Residential',
  year: 2024,
  location: 'Ottawa',
  buildingType: 'House',
  summary: 'A house set back from the levee.',
  status: 'Built',
  role: 'Designer',
  credit: 'Sole author',
  tier: 'set',
  order: 1,
  leadImageAlt: 'The house from the water',
  leadImage: media('m1'),
};

const DETAIL = {
  ...SUMMARY,
  sheet: 'A-101',
  area: '210 square metres',
  contribution: 'Drawings and site work.',
  body: 'The long version, in markdown.',
  film: {
    youtubeId: null,
    caption: 'A walk through the house',
    posterMedia: media('m9'),
    sources: [{ height: 1440, media: media('m8') }],
  },
  imageGroups: [
    {
      id: 'g1',
      layout: 'pair',
      caption: null,
      images: [
        { id: 'i1', alt: 'The courtyard', caption: 'Phase two, from the street', media: media('m2') },
        { id: 'i2', alt: 'The lookout', caption: null, media: media('m3') },
      ],
    },
  ],
  drawings: [{ id: 'd1', alt: 'Ground floor plan', drawingType: 'Plan', media: media('m4') }],
};

const PROFILE = {
  id: 'profile',
  name: 'Ahmad Assi',
  discipline: 'Architecture',
  credential: 'Master of Architecture',
  registration: 'Intern architect',
  location: 'Ottawa, Ontario',
  yearsExperience: 'Six years',
  availability: 'Available now',
  issued: 'August 2026',
  welcome: 'Welcome.',
  positioning: 'Buildings that sit well on their ground.',
  longBio: ['He studied in Ottawa.', 'He has worked on housing since.'],
  portraitAlt: 'Ahmad on site',
  email: 'ahmad@example.ca',
  phone: '613 555 0100',
  references: 'Available upon request',
  contactStatus: 'Available now',
  contactHeading: 'Write to me',
  contactBlurb: 'Email is best.',
  portraitMedia: null,
  cvMedia: null,
  portfolioMedia: null,
};

const FACTS = [{ id: 'f1', label: 'Software', items: ['Revit', 'Rhino'], order: 0 }];
const SOCIAL = [{ id: 's1', label: 'LinkedIn', href: 'https://example.ca', order: 0 }];
const EXPERIENCE = [
  {
    id: 'x1',
    role: 'Architectural designer',
    firm: 'A firm',
    location: 'Ottawa',
    period: '2022 to now',
    contributions: ['Drew the permit set.', 'Ran the site visits.'],
    order: 0,
  },
];
const EDUCATION = [
  { id: 'e1', credential: 'Master of Architecture', institution: 'Carleton', year: '2020', note: 'With distinction', order: 0 },
];
const SKILL_GROUPS = [
  { id: 'sg1', label: 'Drawing', order: 0, items: [{ id: 'sk1', skillGroupId: 'sg1', name: 'Hand sketching', order: 0 }] },
];
const LANGUAGES = [{ id: 'l1', text: 'English, fluent', order: 0 }];
const ENTRIES = [{ id: 'r1', section: 'awards', title: 'A prize', detail: 'For the housing study', year: '2023', order: 0 }];

const SITE_FILM = {
  youtubeId: null,
  caption: 'The house, from the water',
  posterMedia: media('m7'),
  sources: [{ height: 1440, media: media('m6') }],
};

function everythingIsThere(): void {
  db.project.findMany.mockResolvedValue([SUMMARY]);
  db.project.findFirst.mockResolvedValue(DETAIL);
  db.film.findFirst.mockResolvedValue(SITE_FILM);
  db.profile.findUnique.mockResolvedValue(PROFILE);
  db.fact.findMany.mockResolvedValue(FACTS);
  db.socialLink.findMany.mockResolvedValue(SOCIAL);
  db.experienceEntry.findMany.mockResolvedValue(EXPERIENCE);
  db.educationEntry.findMany.mockResolvedValue(EDUCATION);
  db.skillGroup.findMany.mockResolvedValue(SKILL_GROUPS);
  db.language.findMany.mockResolvedValue(LANGUAGES);
  db.resumeEntry.findMany.mockResolvedValue(ENTRIES);
  db.translation.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  everythingIsThere();
});

// ------------------------------------------------------------------ tests ---

describe('the English site, which is the record itself', () => {
  it('hands back the rows it fetched, and asks the Translation table nothing', async () => {
    const projects = await getPublishedProjects();

    /* The same array, not a copy of it: English is not overlaid with anything,
       so there is no pass over the rows at all. */
    expect(projects).toEqual([SUMMARY]);
    expect(db.translation.findMany).not.toHaveBeenCalled();
  });

  it('leaves a project page word for word as it was', async () => {
    const project = await getProjectBySlug('lincoln-beach');

    expect(project).toEqual({
      ...SUMMARY,
      sheet: 'A-101',
      area: '210 square metres',
      contribution: 'Drawings and site work.',
      body: 'The long version, in markdown.',
      film: {
        youtubeId: null,
        caption: 'A walk through the house',
        poster: media('m9'),
        sources: [{ height: 1440, media: media('m8') }],
      },
      imageGroups: DETAIL.imageGroups,
      drawings: DETAIL.drawings,
    });
    expect(db.translation.findMany).not.toHaveBeenCalled();
  });

  it('leaves the resume and the films alone', async () => {
    const { profile, facts, experience, skillGroups } = await getProfile();

    expect(profile).toEqual(PROFILE);
    expect(facts).toEqual(FACTS);
    expect(experience).toEqual(EXPERIENCE);
    expect(skillGroups).toEqual(SKILL_GROUPS);

    expect(await getHeroFilm()).toMatchObject({ caption: 'The house, from the water' });
    expect(await getClosingFilm()).toMatchObject({ caption: 'The house, from the water' });
    expect(db.translation.findMany).not.toHaveBeenCalled();
  });
});

describe('a project in French', () => {
  it('uses the French Ahmad has written and the English he has not', async () => {
    frenchHeld([
      { model: 'Project', recordId: 'p1', field: 'title', value: 'Plage Lincoln' },
      { model: 'Project', recordId: 'p1', field: 'summary', value: 'Une maison en retrait de la digue.' },
    ]);

    const [project] = await getPublishedProjects('fr');

    expect(project.title).toBe('Plage Lincoln');
    expect(project.summary).toBe('Une maison en retrait de la digue.');
    /* Untouched, and that is the point: the page is readable long before the
       last box is filled in. */
    expect(project.role).toBe('Designer');
    expect(project.location).toBe('Ottawa');
    expect(project.credit).toBe('Sole author');
  });

  it('shows the English throughout when nothing has been translated yet', async () => {
    const [project] = await getPublishedProjects('fr');
    expect(project).toEqual(SUMMARY);
  });

  it('treats a box opened and left blank as untranslated, not as an empty heading', async () => {
    frenchHeld([
      { model: 'Project', recordId: 'p1', field: 'title', value: '   ' },
      { model: 'Project', recordId: 'p1', field: 'summary', value: '' },
    ]);

    const [project] = await getPublishedProjects('fr');

    expect(project.title).toBe('Lincoln Beach');
    expect(project.summary).toBe('A house set back from the levee.');
  });

  it('keeps the English slug and the sheet number, which are not sentences', async () => {
    frenchHeld([
      { model: 'Project', recordId: 'p1', field: 'slug', value: 'plage-lincoln' },
      { model: 'Project', recordId: 'p1', field: 'sheet', value: 'D-101' },
      { model: 'Project', recordId: 'p1', field: 'body', value: 'La version longue.' },
    ]);

    const project = await getProjectBySlug('lincoln-beach', 'fr');

    /* One address per language, so nothing printed on a resume goes dead, and
       A-101 is A-101 in both. */
    expect(project?.slug).toBe('lincoln-beach');
    expect(project?.sheet).toBe('A-101');
    expect(project?.body).toBe('La version longue.');
  });

  it('names a picture and a drawing by their project and their file', async () => {
    frenchHeld([
      { model: 'ProjectImage', recordId: 'p1:m2', field: 'alt', value: 'La cour' },
      { model: 'ProjectImage', recordId: 'p1:m2', field: 'caption', value: 'Deuxieme phase, depuis la rue' },
      { model: 'Drawing', recordId: 'p1:m4', field: 'drawingType', value: 'Plan' },
      /* Filed under the row id, which is what a save throws away. Nothing must
         come of it. */
      { model: 'ProjectImage', recordId: 'i2', field: 'alt', value: 'Le belvedere' },
    ]);

    const project = await getProjectBySlug('lincoln-beach', 'fr');
    const [first, second] = project!.imageGroups[0].images;

    expect(first.alt).toBe('La cour');
    expect(first.caption).toBe('Deuxieme phase, depuis la rue');
    expect(second.alt).toBe('The lookout');
    expect(project!.drawings[0]).toMatchObject({ alt: 'Ground floor plan', drawingType: 'Plan' });
  });

  it('files a project film under the project, since a save writes the film row again', async () => {
    frenchHeld([{ model: 'Film', recordId: 'p1', field: 'caption', value: 'Une visite de la maison' }]);

    const project = await getProjectBySlug('lincoln-beach', 'fr');

    expect(project?.film?.caption).toBe('Une visite de la maison');
  });

  it('asks once for each model rather than once for each picture', async () => {
    await getProjectBySlug('lincoln-beach', 'fr');

    expect(modelsLookedUp()).toEqual(['Project', 'ProjectImage', 'Drawing', 'Film']);
  });
});

describe('the pager at the foot of a project page', () => {
  const NEIGHBOUR = { ...SUMMARY, id: 'p2', slug: 'the-eye', title: 'The Eye', order: 2 };

  it('finds the project by its English slug and names its neighbours in French', async () => {
    db.project.findMany.mockResolvedValue([SUMMARY, NEIGHBOUR]);
    frenchHeld([
      { model: 'Project', recordId: 'p1', field: 'title', value: 'Plage Lincoln' },
      { model: 'Project', recordId: 'p2', field: 'title', value: "L Oeil" },
    ]);

    const adjacent = await getAdjacentProjects('lincoln-beach', 'fr');

    /* Wrapping around, so both ends of one project's pager are the other. */
    expect(adjacent?.prev.title).toBe('L Oeil');
    expect(adjacent?.next.title).toBe('L Oeil');
    expect(adjacent?.next.slug).toBe('the-eye');
  });
});

describe('the films that belong to the site rather than to a project', () => {
  it('files a caption under its slot, which is the part a save leaves standing', async () => {
    frenchHeld([
      { model: 'Film', recordId: 'hero', field: 'caption', value: 'La maison, depuis l eau' },
      { model: 'Film', recordId: 'closing', field: 'caption', value: 'Au revoir' },
    ]);

    expect((await getSiteFilm('hero', 'fr'))?.caption).toBe('La maison, depuis l eau');
    expect((await getClosingFilm('fr'))?.caption).toBe('Au revoir');
  });

  it('shows the English caption where there is no French', async () => {
    expect((await getHeroFilm('fr'))?.caption).toBe('The house, from the water');
  });
});

describe('the resume in French', () => {
  it('translates the profile, every list, and the skills inside their groups', async () => {
    frenchHeld([
      { model: 'Profile', recordId: 'profile', field: 'discipline', value: 'Architecture' },
      { model: 'Profile', recordId: 'profile', field: 'availability', value: 'Disponible maintenant' },
      { model: 'Fact', recordId: 'f1', field: 'label', value: 'Logiciels' },
      { model: 'SocialLink', recordId: 's1', field: 'label', value: 'LinkedIn en francais' },
      { model: 'ExperienceEntry', recordId: 'x1', field: 'role', value: 'Concepteur en architecture' },
      { model: 'EducationEntry', recordId: 'e1', field: 'note', value: 'Avec distinction' },
      { model: 'SkillGroup', recordId: 'sg1', field: 'label', value: 'Dessin' },
      { model: 'Skill', recordId: 'sk1', field: 'name', value: 'Croquis a main levee' },
      { model: 'Language', recordId: 'l1', field: 'text', value: 'Anglais, courant' },
      { model: 'ResumeEntry', recordId: 'r1', field: 'title', value: 'Un prix' },
    ]);

    const resume = await getProfile('fr');

    expect(resume.profile?.availability).toBe('Disponible maintenant');
    expect(resume.facts[0].label).toBe('Logiciels');
    expect(resume.social[0].label).toBe('LinkedIn en francais');
    expect(resume.experience[0].role).toBe('Concepteur en architecture');
    expect(resume.education[0].note).toBe('Avec distinction');
    expect(resume.skillGroups[0].label).toBe('Dessin');
    expect(resume.skillGroups[0].items[0].name).toBe('Croquis a main levee');
    expect(resume.languages[0].text).toBe('Anglais, courant');
    expect(resume.entries[0].title).toBe('Un prix');
  });

  it('leaves his name, his email and his telephone number alone', async () => {
    frenchHeld([
      { model: 'Profile', recordId: 'profile', field: 'name', value: 'Ahmed Assi' },
      { model: 'Profile', recordId: 'profile', field: 'email', value: 'faux@example.ca' },
      { model: 'Profile', recordId: 'profile', field: 'phone', value: '613 555 0000' },
    ]);

    const { profile } = await getProfile('fr');

    expect(profile?.name).toBe('Ahmad Assi');
    expect(profile?.email).toBe('ahmad@example.ca');
    expect(profile?.phone).toBe('613 555 0100');
  });

  it('shows the English resume throughout when none of it has been translated', async () => {
    const resume = await getProfile('fr');

    expect(resume.profile).toEqual(PROFILE);
    expect(resume.facts).toEqual(FACTS);
    expect(resume.experience).toEqual(EXPERIENCE);
    expect(resume.skillGroups).toEqual(SKILL_GROUPS);
  });

  it('asks once for each model, nine lookups for a resume of a hundred lines', async () => {
    await getProfile('fr');

    expect(modelsLookedUp()).toEqual([
      'Profile',
      'Fact',
      'SocialLink',
      'ExperienceEntry',
      'EducationEntry',
      'SkillGroup',
      'Skill',
      'Language',
      'ResumeEntry',
    ]);
  });
});

describe('the three fields that are lists of paragraphs rather than sentences', () => {
  it('reads a translated list back as a list, paragraph by paragraph', async () => {
    frenchHeld([
      {
        model: 'Profile',
        recordId: 'profile',
        field: 'longBio',
        value: joinParagraphs(['Il a etudie a Ottawa.', 'Il travaille sur le logement depuis.']),
      },
      { model: 'Fact', recordId: 'f1', field: 'items', value: joinParagraphs(['Revit', 'Rhino']) },
      {
        model: 'ExperienceEntry',
        recordId: 'x1',
        field: 'contributions',
        value: joinParagraphs(['Il a dessine le permis.', 'Il a mene les visites.']),
      },
    ]);

    const resume = await getProfile('fr');

    expect(resume.profile?.longBio).toEqual([
      'Il a etudie a Ottawa.',
      'Il travaille sur le logement depuis.',
    ]);
    expect(resume.facts[0].items).toEqual(['Revit', 'Rhino']);
    expect(resume.experience[0].contributions).toEqual([
      'Il a dessine le permis.',
      'Il a mene les visites.',
    ]);
  });

  it('falls back whole, never half, when the list has not been translated', async () => {
    /* The label is French and the lines under it are not. The English lines
       must survive entire: a list that came back with one sentence in French
       and the rest missing would read worse than either language on its own. */
    frenchHeld([{ model: 'Fact', recordId: 'f1', field: 'label', value: 'Logiciels' }]);

    const resume = await getProfile('fr');

    expect(resume.facts[0].label).toBe('Logiciels');
    expect(resume.facts[0].items).toEqual(['Revit', 'Rhino']);
    expect(resume.profile?.longBio).toEqual([
      'He studied in Ottawa.',
      'He has worked on housing since.',
    ]);
  });

  it('keeps the English list when the French is only blank lines', async () => {
    frenchHeld([{ model: 'Profile', recordId: 'profile', field: 'longBio', value: '\n  \n' }]);

    const { profile } = await getProfile('fr');

    expect(profile?.longBio).toEqual([
      'He studied in Ottawa.',
      'He has worked on housing since.',
    ]);
  });

  it('survives the trip out and back', () => {
    const paragraphs = ['Premier paragraphe.', 'Deuxieme paragraphe.', 'Troisieme.'];
    expect(splitParagraphs(joinParagraphs(paragraphs))).toEqual(paragraphs);
  });

  it('forgives the extra blank lines a person leaves in the box', () => {
    expect(splitParagraphs('Un.\n\n\n\nDeux.  \n\n  \n')).toEqual(['Un.', 'Deux.']);
  });
});
