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

import { ResumeForm, type ProfileData } from './ResumeForm';

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
