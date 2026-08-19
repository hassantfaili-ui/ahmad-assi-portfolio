/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* The save is a server action. Mocked so the test can read the payload it was
   handed, which is the whole point: the bug being guarded against was a caption
   that never reached one. */
const { saveWholeProject } = vi.hoisted(() => ({
  saveWholeProject: vi.fn(async (_id: string, _input: unknown) => ({
    ok: true as const,
    data: { slug: 'garden-heights' },
  })),
}));
vi.mock('@/lib/mutations', () => ({ saveWholeProject }));

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

/* next/image wants a loader and a real layout; neither is what is under test. */
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="image">{alt}</span>,
}));

import { ProjectForm } from './ProjectForm';
import type { EditorGroup } from './MediaPanel';

const media = { id: 'm1', key: 'projects/garden-heights/a.jpg', bytes: 1000, width: 1600, height: 900 };

const project = {
  id: 'p1',
  slug: 'garden-heights',
  title: 'Garden Heights',
  sheet: 'A-101',
  category: 'Residential',
  year: 2024,
  location: 'Beirut',
  buildingType: 'Apartments',
  area: '4200',
  status: 'Built',
  role: 'Project architect',
  contribution: 'Led the design',
  summary: 'A short summary of the project.',
  body: '',
  credit: 'Studio',
  tier: 'set',
  order: 1,
  published: false,
  leadImageId: 'm1',
  leadImageAlt: 'The front of the building',
  leadImage: media,
};

const groups: EditorGroup[] = [
  {
    id: 'g1',
    layout: 'full',
    caption: 'The old caption',
    images: [{ id: 'i1', mediaId: 'm1', alt: 'A picture of the courtyard', media }],
  },
];

beforeEach(() => {
  saveWholeProject.mockClear();
  push.mockClear();
});

afterEach(cleanup);

describe('the one save button', () => {
  it('sends a caption typed into a group, which is what it did not do before', async () => {
    const user = userEvent.setup();
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const caption = screen.getByLabelText('Group 1 caption');
    await user.clear(caption);
    await user.type(caption, 'The new caption');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [, payload] = saveWholeProject.mock.calls[0] as unknown as [
      string,
      { groups: { caption?: string | null }[] },
    ];
    expect(payload.groups[0].caption).toBe('The new caption');
  });

  it('sends the words on the left in the same press as the pictures on the right', async () => {
    const user = userEvent.setup();
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const location = screen.getByLabelText('Where it is*');
    await user.clear(location);
    await user.type(location, 'Tripoli');

    const caption = screen.getByLabelText('Group 1 caption');
    await user.clear(caption);
    await user.type(caption, 'Both at once');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [, payload] = saveWholeProject.mock.calls[0] as unknown as [
      string,
      { fields: { location: string }; groups: { caption?: string | null }[] },
    ];
    expect(payload.fields.location).toBe('Tripoli');
    expect(payload.groups[0].caption).toBe('Both at once');
  });

  it('does not put a project on the site behind the back of an unsaved edit', async () => {
    const user = userEvent.setup();
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const caption = screen.getByLabelText('Group 1 caption');
    await user.clear(caption);
    await user.type(caption, 'Typed but not saved');

    await user.click(screen.getByRole('button', { name: 'Put it on the site' }));

    /* Nothing is written by that press on its own. Publishing immediately is how
       the site could end up showing the caption as it used to be. */
    expect(saveWholeProject).not.toHaveBeenCalled();
    expect(screen.getByText('Goes on the site when you save')).toBeTruthy();

    /* And it counts as work, so leaving the screen warns him rather than
       dropping it quietly. */
    expect(screen.getByText('Not saved yet')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [, payload] = saveWholeProject.mock.calls[0] as unknown as [
      string,
      { published: boolean; groups: { caption?: string | null }[] },
    ];
    expect(payload.published).toBe(true);
    expect(payload.groups[0].caption).toBe('Typed but not saved');
  });

  it('counts a change of mind about the site as unsaved work of its own', async () => {
    const user = userEvent.setup();
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    /* Nothing typed. The toggle is the only thing pressed, so if it does not
       raise the flag by itself, Ahmad can press it, leave, and be told nothing. */
    expect(screen.queryByText('Not saved yet')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Put it on the site' }));

    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(saveWholeProject).not.toHaveBeenCalled();
  });

  it('says there is unsaved work as soon as something is typed', async () => {
    const user = userEvent.setup();
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    expect(screen.queryByText('Not saved yet')).toBeNull();

    const caption = screen.getByLabelText('Group 1 caption');
    await user.type(caption, '!');

    expect(screen.getByText('Not saved yet')).toBeTruthy();
  });
});
