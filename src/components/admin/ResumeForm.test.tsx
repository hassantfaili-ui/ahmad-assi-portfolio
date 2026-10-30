/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* The mirror of ContactForm.test.tsx. The contact boxes are edited next door
   now, but both writes here still replace everything they touch, so this screen
   has to hand them back untouched or saving a job title would empty the contact
   page. */
const { saveProfile, saveResumeLists } = vi.hoisted(() => ({
  saveProfile: vi.fn(async (...args: [unknown]) => {
    void args;
    return { ok: true } as const;
  }),
  saveResumeLists: vi.fn(async (...args: [unknown]) => {
    void args;
    return { ok: true } as const;
  }),
}));
vi.mock('@/lib/mutations', () => ({ saveProfile, saveResumeLists }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ push }) }));

vi.mock('@/components/admin/UnsavedWork', () => ({
  useRegisterUnsaved: () => {},
  useUnsavedWork: () => ({ isAnyUnsaved: () => false, confirmLeave: () => true }),
}));

/* Needs a mounted app router, which a bare render does not have. It is a link
   out of the screen and nothing under test depends on it navigating. */
vi.mock('@/components/admin/GuardedLink', () => ({
  GuardedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/admin/Dropzone', () => ({ Dropzone: () => <div /> }));

/* next/image wants a loader and a real layout; neither is what is under test. */
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="image">{alt}</span>,
}));

import { ResumeForm, type FrenchData, type ProfileData } from './ResumeForm';

const data: ProfileData = {
  profile: {
    name: 'Ahmad Assi',
    discipline: 'Architectural Designer',
    credential: 'B.A.S. (Honours), Urbanism',
    registration: 'Carleton University',
    location: 'Ottawa, Ontario',
    yearsExperience: 'Graduated 2025',
    availability: 'Seeking a position with a professional firm',
    issued: '2026.07',
    welcome: 'Hello and welcome',
    positioning: 'A short description of the practice.',
    longBio: ['The first paragraph.'],
    portraitMedia: {
      id: 'portrait-1',
      key: 'profile/portrait.jpg',
      bytes: 2048,
      width: 800,
      height: 1200,
    },
    portraitAlt: 'Ahmad Assi, standing in front of a drawing board',
    cvMedia: { id: 'cv-1', key: 'documents/resume.pdf', bytes: 4096, width: null, height: null },
    portfolioMedia: {
      id: 'portfolio-1',
      key: 'documents/portfolio.pdf',
      bytes: 8192,
      width: null,
      height: null,
    },
    email: 'hello@example.com',
    phone: '613-291-8074',
    references: 'Available upon request',
    contactStatus: 'Available now',
    contactHeading: 'Write to me',
    contactBlurb: 'Email is best, and it reaches me directly.',
  },
  facts: [{ label: 'Status', items: ['Seeking a position with a firm'] }],
  social: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/' }],
  experience: [
    {
      role: 'Project Support Assistant',
      firm: 'SD Consulting and Management Inc.',
      location: 'Ottawa, ON',
      period: 'February 2025 to October 2025',
      contributions: ['Prepared presentation materials.'],
    },
  ],
  education: [
    {
      credential: 'Bachelor of Architectural Studies (Honours)',
      institution: 'Carleton University',
      year: '2025',
      note: null,
    },
  ],
  skillGroups: [{ label: 'Software', items: [{ name: 'SketchUp' }] }],
  languages: [{ text: 'French, fluent' }],
  entries: [
    { section: 'volunteering', title: 'Scouts Leader', detail: 'ABCCO', year: '2025 to present' },
  ],
};

/**
 * What the Translation table already holds, as the page would hand it over.
 *
 * The profile's French is by field, because that row keeps its id. Each list's
 * French is in the same order as the English list of the same name above,
 * because those rows do not: the save deletes every list and writes it again.
 */
const french: FrenchData = {
  profile: {
    credential: 'B.A.S. (avec distinction), urbanisme',
    registration: 'Universite Carleton',
    yearsExperience: 'Diplome en 2025',
    issued: '2026.07',
    positioning: 'Une courte description du travail.',
    portraitAlt: 'Ahmad Assi, devant une table a dessin',
    references: 'Sur demande',
    'longBio.0': 'Le premier paragraphe.',
    /* A field with no box on this screen. It has one on the Home screen, and
       this screen must not be the one that decides its fate. */
    discipline: 'Concepteur en architecture',
  },
  lists: {
    facts: [{ label: 'Statut', items: ['A la recherche d un poste'] }],
    social: [{ label: 'LinkedIn en francais' }],
    experience: [
      {
        role: 'Adjoint au soutien de projet',
        location: 'Ottawa (Ontario)',
        period: 'Fevrier 2025 a octobre 2025',
        contributions: ['Preparation des documents de presentation.'],
      },
    ],
    education: [
      {
        credential: 'Baccalaureat en etudes architecturales',
        institution: 'Universite Carleton',
        note: '',
      },
    ],
    skillGroups: [{ label: 'Logiciels', items: ['SketchUp'] }],
    languages: ['Francais, courant'],
    entries: [{ title: 'Chef scout', detail: 'ABCCO' }],
  },
};

beforeEach(() => {
  saveProfile.mockClear();
  saveResumeLists.mockClear();
  push.mockClear();
});

afterEach(cleanup);

describe('saving your details', () => {
  it('sends the contact boxes back, even though it no longer shows them', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} />);

    const credential = screen.getByLabelText(/Degree/);
    await user.clear(credential);
    await user.type(credential, 'B.A.S. Urbanism');

    await user.click(screen.getByRole('button', { name: 'Save your details' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as Record<string, unknown>;

    expect(sent.credential).toBe('B.A.S. Urbanism');

    // Everything the contact screen owns, untouched.
    expect(sent.location).toBe('Ottawa, Ontario');
    expect(sent.email).toBe('hello@example.com');
    expect(sent.phone).toBe('613-291-8074');
    expect(sent.availability).toBe('Seeking a position with a professional firm');
    expect(sent.contactStatus).toBe('Available now');
    expect(sent.contactHeading).toBe('Write to me');
    expect(sent.contactBlurb).toBe('Email is best, and it reaches me directly.');
    expect(sent.portraitMediaId).toBe('portrait-1');
    expect(sent.portraitAlt).toBe(data.profile!.portraitAlt);
    expect(screen.queryByRole('heading', { name: 'Your portrait' })).not.toBeInTheDocument();
    expect(sent.cvMediaId).toBe('cv-1');
    expect(sent.portfolioMediaId).toBe('portfolio-1');
  });
});

describe('saving the lists', () => {
  it('sends the links under Elsewhere back unchanged', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} />);

    await user.click(screen.getByRole('button', { name: 'Save the lists' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as Record<string, unknown>;

    expect(sent.social).toEqual([{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/' }]);
    expect(sent.languages).toEqual(['French, fluent']);
  });
});

describe('the French boxes', () => {
  it('opens with the French that is already written', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} french={french} />);

    /* Hidden until asked for, and genuinely absent rather than invisible, so a
       screen reader and the tab key agree with what the eye sees. This is the
       longest screen in the product and most edits to it are not translations. */
    expect(screen.queryByLabelText('Degree, in French')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    expect(screen.getByLabelText('Degree, in French')).toHaveValue(
      'B.A.S. (avec distinction), urbanisme',
    );
    expect(screen.getByLabelText('About, on the home page, 1, in French')).toHaveValue(
      'Le premier paragraphe.',
    );
    expect(screen.getByLabelText('Job title, in French')).toHaveValue(
      'Adjoint au soutien de projet',
    );
    expect(screen.getByLabelText('Languages, 1, in French')).toHaveValue('Francais, courant');
  });

  it('sends what was typed in French with the details, and no field it has no box for', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    const degree = screen.getByLabelText('Degree, in French');
    await user.clear(degree);
    await user.type(degree, 'B.A.S., urbanisme');

    const paragraph = screen.getByLabelText('About, on the home page, 1, in French');
    await user.clear(paragraph);
    await user.type(paragraph, 'Recemment diplome de Carleton.');

    await user.click(screen.getByRole('button', { name: 'Save your details' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as { french: Record<string, string> };

    expect(sent.french.credential).toBe('B.A.S., urbanisme');
    expect(sent.french.references).toBe('Sur demande');

    /* The About block is a list of paragraphs held in one field, so its French
       is numbered paragraph by paragraph. A French paragraph then falls back to
       its own English paragraph rather than to the whole block. */
    expect(sent.french['longBio.0']).toBe('Recemment diplome de Carleton.');

    /* A translation is a row of its own per field, so the French this screen
       does not show is left alone by naming it nowhere. Sending it back the way
       the English is sent back would mean this tab's older copy overwriting a
       translation written next door. */
    expect(sent.french).not.toHaveProperty('discipline');
    expect(Object.keys(sent.french).sort()).toEqual([
      'credential',
      'issued',
      'longBio.0',
      'positioning',
      'references',
      'registration',
      'yearsExperience',
    ]);
  });

  it('sends the lists in French, entry for entry with the English', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    const role = screen.getByLabelText('Job title, in French');
    await user.clear(role);
    await user.type(role, 'Adjoint de projet');

    await user.click(screen.getByRole('button', { name: 'Save the lists' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as {
      experience: unknown[];
      french: FrenchData['lists'];
    };

    expect(sent.french.experience).toEqual([
      {
        role: 'Adjoint de projet',
        location: 'Ottawa (Ontario)',
        period: 'Fevrier 2025 a octobre 2025',
        contributions: ['Preparation des documents de presentation.'],
      },
    ]);

    // In step with the English list, entry for entry. That position is all the
    // save has to go on, since the rows it is writing do not exist yet.
    expect(sent.french.experience).toHaveLength(sent.experience.length);
    expect(sent.french.facts).toEqual([{ label: 'Statut', items: ['A la recherche d un poste'] }]);
    expect(sent.french.skillGroups).toEqual([{ label: 'Logiciels', items: ['SketchUp'] }]);
    expect(sent.french.languages).toEqual(['Francais, courant']);
    expect(sent.french.entries).toEqual([{ title: 'Chef scout', detail: 'ABCCO' }]);
  });

  it('sends the French of the links back unchanged, as it does the English', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Save the lists' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as { french: FrenchData['lists'] };

    /* The links under Elsewhere are edited on the Contact screen, and the save
       deletes every list and writes it again, so leaving their French out would
       not leave it alone. */
    expect(sent.french.social).toEqual([{ label: 'LinkedIn en francais' }]);
  });

  it('sends the links it does not show as absent, not as cleared', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} french={{ profile: {}, lists: {} }} />);

    await user.click(screen.getByRole('button', { name: 'Save the lists' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as { french: FrenchData['lists'] };

    /* A list this screen has nothing to say about is left out rather than sent
       empty, so the save carries its French across the ids it is about to
       change. Empty would read as every French box in it cleared on purpose. */
    expect(sent.french.social).toBeUndefined();
    expect(sent.french.experience).toEqual([
      { role: '', location: '', period: '', contributions: [''] },
    ]);
  });

  it('says nothing at all about the French when it was handed none', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} />);

    /* No boxes, so nothing this screen could send would be Ahmad's answer. A
       payload of blanks from a screen that never showed him a box would delete
       translations he never saw. */
    expect(screen.queryByRole('button', { name: 'Show the French boxes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save the lists' }));
    await user.click(screen.getByRole('button', { name: 'Save your details' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const lists = saveResumeLists.mock.calls[0][0] as Record<string, unknown>;
    const details = saveProfile.mock.calls[0][0] as Record<string, unknown>;

    expect(lists).not.toHaveProperty('french');
    expect(details).not.toHaveProperty('french');
  });

  it('keeps a translation with its line when the line is removed', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ResumeForm data={data} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));
    await user.click(screen.getByRole('button', { name: 'Remove Languages, 1' }));

    await user.click(screen.getByRole('button', { name: 'Save the lists' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as {
      languages: string[];
      french: FrenchData['lists'];
    };

    // The French rides on the row, so removing the line removes its translation
    // rather than sliding it onto the line that took its place.
    expect(sent.languages).toEqual([]);
    expect(sent.french.languages).toEqual([]);
  });
});
