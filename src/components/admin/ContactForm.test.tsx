/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* Both saves are server actions. Mocked so the test can read the payloads they
   were handed, which is the whole point: this screen edits a corner of the
   profile and a single list, while the two writes underneath replace the whole
   row and every list. Anything the payload leaves out is erased, and nothing on
   screen would say so. */
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

/* Uploading is not what is under test, and the real one reaches for a browser
   video encoder on mount. */
vi.mock('@/components/admin/Dropzone', () => ({ Dropzone: () => <div /> }));

import { ContactForm } from './ContactForm';
import type { FrenchData, ProfileData } from './ResumeForm';

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
    longBio: ['The first paragraph.', 'The second paragraph.'],
    portraitMedia: {
      id: 'portrait-1',
      key: 'profile/portrait.jpg',
      bytes: 2048,
      width: 800,
      height: 1200,
    },
    portraitAlt: 'Ahmad Assi, standing in front of a drawing board',
    cvMedia: { id: 'cv-1', key: 'documents/resume.pdf', bytes: 4096, width: null, height: null },
    portfolioMedia: null,
    email: 'old@example.com',
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
 * Each list is in the same order as the English list of the same name above,
 * which is the only thing pairing a translation with its row: the save deletes
 * every list and writes it again, so no id survives it.
 */
const french: FrenchData = {
  profile: {
    contactStatus: 'Disponible maintenant',
    contactHeading: 'Ecrivez-moi',
    contactBlurb: 'Le courriel est le plus simple, et il me parvient directement.',
    location: 'Ottawa (Ontario)',
    availability: 'A la recherche d un poste en cabinet',
    /* A field with no box on this screen. It has one on the Resume screen, and
       this screen must not be the one that decides its fate. */
    credential: 'B.A.S. (avec distinction), urbanisme',
  },
  lists: {
    social: [{ label: 'LinkedIn en francais' }],
    facts: [{ label: 'Statut', items: ['A la recherche d un poste'] }],
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

describe('saving the contact page', () => {
  it('sends the whole profile back, not only the boxes it shows', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} />);

    const email = screen.getByLabelText(/Email address/);
    await user.clear(email);
    await user.type(email, 'new@example.com');

    await user.click(screen.getByRole('button', { name: 'Save the contact page' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as Record<string, unknown>;

    expect(sent.email).toBe('new@example.com');

    // Everything the resume screen owns has to come back untouched, because
    // saveProfile upserts the whole row.
    expect(sent.name).toBe('Ahmad Assi');
    expect(sent.discipline).toBe('Architectural Designer');
    expect(sent.credential).toBe('B.A.S. (Honours), Urbanism');
    expect(sent.registration).toBe('Carleton University');
    expect(sent.yearsExperience).toBe('Graduated 2025');
    expect(sent.issued).toBe('2026.07');
    expect(sent.welcome).toBe('Hello and welcome');
    expect(sent.positioning).toBe('A short description of the practice.');
    expect(sent.longBio).toEqual(['The first paragraph.', 'The second paragraph.']);
    expect(sent.portraitMediaId).toBe('portrait-1');
    expect(sent.portraitAlt).toBe('Ahmad Assi, standing in front of a drawing board');
    expect(sent.references).toBe('Available upon request');

    // And the files this screen does show, unchanged because nothing touched them.
    expect(sent.cvMediaId).toBe('cv-1');
    expect(sent.portfolioMediaId).toBeNull();
  });

  it('refuses a blank email without asking the server', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} />);

    await user.clear(screen.getByLabelText(/Email address/));
    await user.click(screen.getByRole('button', { name: 'Save the contact page' }));

    expect(saveProfile).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/email address is required/i);
  });
});

describe('saving the links', () => {
  it('sends the five lists this screen does not show back unchanged', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} />);

    const label = screen.getByLabelText(/What it says/);
    await user.clear(label);
    await user.type(label, 'LinkedIn profile');

    await user.click(screen.getByRole('button', { name: 'Save the links' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as Record<string, unknown>;

    expect(sent.social).toEqual([
      { label: 'LinkedIn profile', href: 'https://www.linkedin.com/in/' },
    ]);

    // saveResumeLists deletes every list and writes it again, so a list left
    // out of the payload is a list deleted.
    expect(sent.facts).toEqual([{ label: 'Status', items: ['Seeking a position with a firm'] }]);
    expect(sent.experience).toEqual([
      {
        role: 'Project Support Assistant',
        firm: 'SD Consulting and Management Inc.',
        location: 'Ottawa, ON',
        period: 'February 2025 to October 2025',
        contributions: ['Prepared presentation materials.'],
      },
    ]);
    expect(sent.education).toEqual([
      {
        credential: 'Bachelor of Architectural Studies (Honours)',
        institution: 'Carleton University',
        year: '2025',
        note: null,
      },
    ]);
    expect(sent.skillGroups).toEqual([{ label: 'Software', items: ['SketchUp'] }]);
    expect(sent.languages).toEqual(['French, fluent']);
    expect(sent.entries).toEqual([
      { section: 'volunteering', title: 'Scouts Leader', detail: 'ABCCO', year: '2025 to present' },
    ]);
  });

  it('does not publish a link with no name', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} />);

    await user.clear(screen.getByLabelText(/What it says/));
    await user.click(screen.getByRole('button', { name: 'Save the links' }));

    expect(saveResumeLists).not.toHaveBeenCalled();
    /* By its words rather than its role: the sortable list keeps a live region
       of its own, so there is more than one status on this screen. */
    expect(await screen.findByText(/Link 1 has no name/)).toBeInTheDocument();
  });
});

describe('the French boxes', () => {
  it('opens with the French that is already written', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} french={french} />);

    /* Hidden until asked for, and genuinely absent rather than invisible, so a
       screen reader and the tab key agree with what the eye sees. */
    expect(screen.queryByLabelText('Heading, in French')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    expect(screen.getByLabelText('Heading, in French')).toHaveValue('Ecrivez-moi');
    expect(screen.getByLabelText('Where you are, in French')).toHaveValue('Ottawa (Ontario)');
    expect(screen.getByLabelText('What it says, in French')).toHaveValue('LinkedIn en francais');
  });

  it('sends what was typed in French, and no field it has no box for', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    const heading = screen.getByLabelText('Heading, in French');
    await user.clear(heading);
    await user.type(heading, 'Ecrivez-moi donc');

    await user.click(screen.getByRole('button', { name: 'Save the contact page' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as { french: Record<string, string> };

    expect(sent.french.contactHeading).toBe('Ecrivez-moi donc');
    expect(sent.french.location).toBe('Ottawa (Ontario)');
    expect(sent.french.availability).toBe('A la recherche d un poste en cabinet');

    /* A translation is a row of its own per field, so the French this screen
       does not show is left alone by naming it nowhere. Sending it back the way
       the English is sent back would mean this tab's older copy overwriting a
       translation written next door. */
    expect(sent.french).not.toHaveProperty('credential');
    expect(Object.keys(sent.french).sort()).toEqual([
      'availability',
      'contactBlurb',
      'contactHeading',
      'contactStatus',
      'location',
    ]);
  });

  it('sends the French of the six lists it does not show back unchanged', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    const label = screen.getByLabelText('What it says, in French');
    await user.clear(label);
    await user.type(label, 'Profil LinkedIn');

    await user.click(screen.getByRole('button', { name: 'Save the links' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as { french: FrenchData['lists'] };

    expect(sent.french.social).toEqual([{ label: 'Profil LinkedIn' }]);

    /* The save deletes every list and writes it again, so the French of a list
       left out of the payload is French pointing at rows that no longer exist.
       These are the resume screen's, passed through exactly as this page loaded
       them, for the same reason the English is. */
    expect(sent.french.facts).toEqual(french.lists.facts);
    expect(sent.french.experience).toEqual(french.lists.experience);
    expect(sent.french.education).toEqual(french.lists.education);
    expect(sent.french.skillGroups).toEqual(french.lists.skillGroups);
    expect(sent.french.languages).toEqual(french.lists.languages);
    expect(sent.french.entries).toEqual(french.lists.entries);
  });

  it('sends the six lists it does not show as absent, not as cleared', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} french={{ profile: {}, lists: {} }} />);

    await user.click(screen.getByRole('button', { name: 'Save the links' }));

    await waitFor(() => expect(saveResumeLists).toHaveBeenCalledTimes(1));
    const sent = saveResumeLists.mock.calls[0][0] as { french: FrenchData['lists'] };

    /* A list this screen has nothing to say about is left out rather than sent
       empty, so the save carries its French across the ids it is about to
       change. Empty would read as every French box in it cleared on purpose. */
    expect(sent.french.facts).toBeUndefined();
    expect(sent.french.languages).toBeUndefined();
    expect(sent.french.social).toEqual([{ label: '' }]);
  });

  it('says nothing at all about the French when it was handed none', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ContactForm data={data} />);

    /* No boxes, so nothing this screen could send would be Ahmad's answer. A
       payload of blanks from a screen that never showed him a box would delete
       translations he never saw. */
    expect(screen.queryByRole('button', { name: 'Show the French boxes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save the links' }));
    await user.click(screen.getByRole('button', { name: 'Save the contact page' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const lists = saveResumeLists.mock.calls[0][0] as Record<string, unknown>;
    const page = saveProfile.mock.calls[0][0] as Record<string, unknown>;

    expect(lists).not.toHaveProperty('french');
    expect(page).not.toHaveProperty('french');
  });

  it('counts how far the translation has got', () => {
    render(<ContactForm data={data} french={french} />);

    // Five boxes on the contact page itself and one for the single link.
    expect(screen.getByText(/6 of 6 boxes written/)).toBeInTheDocument();
  });
});
