/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* The save is a server action. Mocked so the test can read the payload it was
   handed, which is the whole point: this screen shows four boxes and the write
   underneath replaces the whole profile row. Anything the payload leaves out is
   erased, and nothing on screen would say so. */
const { saveProfile } = vi.hoisted(() => ({
  saveProfile: vi.fn(async (...args: [unknown]) => {
    void args;
    return { ok: true } as const;
  }),
}));
vi.mock('@/lib/mutations', () => ({ saveProfile }));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ push }) }));

vi.mock('@/components/admin/UnsavedWork', () => ({
  useRegisterUnsaved: () => {},
  useUnsavedWork: () => ({ isAnyUnsaved: () => false, confirmLeave: () => true }),
}));

/* Both films on this screen are saved by their own actions and reach for a
   browser video encoder on mount. Neither is what is under test. */
vi.mock('@/components/admin/HeroFilmEditor', () => ({ SiteFilmEditor: () => <div /> }));

import { HomeForm, type HomeProfile } from './HomeForm';
import type { ProfileFrench } from './ResumeForm';

const profile: HomeProfile = {
  name: 'Ahmad Assi',
  discipline: 'Architectural Designer',
  credential: 'B.A.S. (Honours), Urbanism',
  registration: 'Carleton University',
  location: 'Ottawa, Ontario',
  yearsExperience: 'Graduated 2025',
  availability: 'Seeking a position with a professional firm',
  issued: '2026.07',
  welcome: 'A graduate of the Bachelor of Architectural Studies.',
  positioning: 'A short description of the practice.',
  longBio: ['The first paragraph.', 'The second paragraph.'],
  portraitMedia: { id: 'portrait-1' },
  portraitAlt: 'Ahmad Assi, standing in front of a drawing board',
  cvMedia: { id: 'cv-1' },
  portfolioMedia: { id: 'portfolio-1' },
  email: 'hello@example.com',
  phone: '613-291-8074',
  references: 'Available upon request',
  contactStatus: 'Available now',
  contactHeading: 'Write to me',
  contactBlurb: 'Email is best, and it reaches me directly.',
};

const french: ProfileFrench = {
  discipline: 'Concepteur en architecture',
  location: 'Ottawa (Ontario)',
  welcome: 'Diplome du baccalaureat en etudes architecturales.',
  /* A field with no box on this screen. It has one on the Resume screen, and
     this screen must not be the one that decides its fate. */
  credential: 'B.A.S. (avec distinction), urbanisme',
};

beforeEach(() => {
  saveProfile.mockClear();
  push.mockClear();
});

afterEach(cleanup);

describe('saving the words at the top of the home page', () => {
  it('sends the whole profile back, not only the four boxes it shows', async () => {
    const user = userEvent.setup({ delay: null });
    render(<HomeForm profile={profile} hero={null} closing={null} />);

    const discipline = screen.getByLabelText(/What you do/);
    await user.clear(discipline);
    await user.type(discipline, 'Architectural Intern');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as Record<string, unknown>;

    expect(sent.discipline).toBe('Architectural Intern');

    // Everything the other two screens own has to come back untouched, because
    // saveProfile upserts the whole row.
    expect(sent.email).toBe('hello@example.com');
    expect(sent.phone).toBe('613-291-8074');
    expect(sent.credential).toBe('B.A.S. (Honours), Urbanism');
    expect(sent.references).toBe('Available upon request');
    expect(sent.contactBlurb).toBe('Email is best, and it reaches me directly.');
    expect(sent.longBio).toEqual(['The first paragraph.', 'The second paragraph.']);
    expect(sent.cvMediaId).toBe('cv-1');
    expect(sent.portfolioMediaId).toBe('portfolio-1');
  });
});

describe('the French boxes', () => {
  it('opens with the French that is already written', async () => {
    const user = userEvent.setup({ delay: null });
    render(<HomeForm profile={profile} hero={null} closing={null} french={french} />);

    /* Hidden until asked for, and genuinely absent rather than invisible, so a
       screen reader and the tab key agree with what the eye sees. */
    expect(screen.queryByLabelText('What you do, in French')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    expect(screen.getByLabelText('What you do, in French')).toHaveValue(
      'Concepteur en architecture',
    );
    expect(screen.getByLabelText('Where you are, in French')).toHaveValue('Ottawa (Ontario)');
  });

  it('sends what was typed in French, and no field it has no box for', async () => {
    const user = userEvent.setup({ delay: null });
    render(<HomeForm profile={profile} hero={null} closing={null} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    const welcome = screen.getByLabelText('The sentences under your name, in French');
    await user.clear(welcome);
    await user.type(welcome, 'Diplome en etudes architecturales, majeure en urbanisme.');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as { french: Record<string, string> };

    expect(sent.french.welcome).toBe('Diplome en etudes architecturales, majeure en urbanisme.');
    expect(sent.french.discipline).toBe('Concepteur en architecture');
    expect(sent.french.location).toBe('Ottawa (Ontario)');

    /* A translation is a row of its own per field, so the French this screen
       does not show is left alone by naming it nowhere. Sending it back the way
       the English is sent back would mean this tab's older copy overwriting a
       translation written next door. */
    expect(sent.french).not.toHaveProperty('credential');
    expect(Object.keys(sent.french).sort()).toEqual(['discipline', 'location', 'welcome']);
  });

  it('is still saved when the boxes are hidden again', async () => {
    const user = userEvent.setup({ delay: null });
    render(<HomeForm profile={profile} hero={null} closing={null} french={french} />);

    await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));

    const location = screen.getByLabelText('Where you are, in French');
    await user.clear(location);
    await user.type(location, 'Gatineau (Quebec)');

    await user.click(screen.getByRole('button', { name: 'Hide the French boxes' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    const sent = saveProfile.mock.calls[0][0] as { french: Record<string, string> };

    // The switch shows and hides boxes. It has never been a decision about what
    // is saved, and work that is out of sight is still work.
    expect(sent.french.location).toBe('Gatineau (Quebec)');
  });

  it('counts how far the translation has got', () => {
    render(<HomeForm profile={profile} hero={null} closing={null} french={french} />);

    expect(screen.getByText(/3 of 3 boxes written/)).toBeInTheDocument();
  });

  it('says nothing at all about the French when it was handed none', async () => {
    const user = userEvent.setup({ delay: null });
    render(<HomeForm profile={profile} hero={null} closing={null} />);

    /* No boxes, so nothing this screen could send would be Ahmad's answer. A
       payload of blanks from a screen that never showed him a box would delete
       translations he never saw. */
    expect(screen.queryByRole('button', { name: 'Show the French boxes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
    expect(saveProfile.mock.calls[0][0] as Record<string, unknown>).not.toHaveProperty('french');
  });
});
