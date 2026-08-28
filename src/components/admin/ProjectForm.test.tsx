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
  saveWholeProject: vi.fn(
    async (...args: [string, unknown]): Promise<{ ok: true; data: { slug: string } }> => {
      void args;
      return { ok: true, data: { slug: 'garden-heights' } };
    },
  ),
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
const second = { id: 'm2', key: 'projects/garden-heights/b.jpg', bytes: 1000, width: 1600, height: 900 };

/* A photograph that is the cover and is in no group, which is the only way a
   cover can be the project's one reference to a file. */
const loose = {
  id: 'm3',
  key: 'projects/garden-heights/loose.jpg',
  bytes: 1000,
  width: 1600,
  height: 900,
};

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

/* Two pictures in the one group, because most of what is being guarded here is
   a change to one of them landing on the other. */
const groups: EditorGroup[] = [
  {
    id: 'g1',
    layout: 'full',
    caption: 'The old group caption',
    images: [
      { id: 'i1', mediaId: 'm1', alt: 'A picture of the courtyard', caption: 'At dusk', media },
      {
        id: 'i2',
        mediaId: 'm2',
        alt: 'The stair from the landing',
        caption: '',
        media: second,
      },
    ],
  },
];

/** The caption boxes on the pictures, in the order the pictures are in. */
function captionBoxes(): HTMLElement[] {
  return screen.getAllByLabelText('Caption for this picture');
}

interface SavedPayload {
  fields: { location: string; leadImageId: string | null };
  published: boolean;
  groups: {
    caption?: string | null;
    images: { mediaId: string; alt: string; caption?: string | null }[];
  }[];
  drawings: { mediaId: string; alt: string; drawingType: string }[];
}

/** What the one button actually sent, which is the only thing worth asserting. */
function sent(): SavedPayload {
  const [, payload] = saveWholeProject.mock.calls[0] as unknown as [string, SavedPayload];
  return payload;
}

beforeEach(() => {
  saveWholeProject.mockClear();
  push.mockClear();
});

afterEach(cleanup);

describe('the one save button', () => {
  it('sends a caption typed on a picture, which is what it did not do before', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const caption = captionBoxes()[0];
    await user.clear(caption);
    await user.type(caption, 'The new caption');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().groups[0].images[0].caption).toBe('The new caption');
  });

  it('sends the words on the left in the same press as the pictures on the right', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const location = screen.getByLabelText('Where it is*');
    await user.clear(location);
    await user.type(location, 'Tripoli');

    const caption = captionBoxes()[0];
    await user.clear(caption);
    await user.type(caption, 'Both at once');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().fields.location).toBe('Tripoli');
    expect(sent().groups[0].images[0].caption).toBe('Both at once');
  });

  it('does not put a project on the site behind the back of an unsaved edit', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const caption = captionBoxes()[0];
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
    expect(sent().published).toBe(true);
    expect(sent().groups[0].images[0].caption).toBe('Typed but not saved');
  });

  it('counts a change of mind about the site as unsaved work of its own', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    /* Nothing typed. The toggle is the only thing pressed, so if it does not
       raise the flag by itself, Ahmad can press it, leave, and be told nothing. */
    expect(screen.queryByText('Not saved yet')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Put it on the site' }));

    expect(screen.getByText('Not saved yet')).toBeTruthy();
    expect(saveWholeProject).not.toHaveBeenCalled();
  });

  it('says there is unsaved work as soon as something is typed', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    expect(screen.queryByText('Not saved yet')).toBeNull();

    await user.type(captionBoxes()[0], '!');

    expect(screen.getByText('Not saved yet')).toBeTruthy();
  });
});

describe('a caption on each picture', () => {
  it('lands on the picture it was typed on and not on the one beside it', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    /* The words used to belong to the group, so this box did not exist and
       every picture in the group carried the same line. */
    expect(screen.queryByLabelText('Group 1 caption')).toBeNull();

    const boxes = captionBoxes();
    expect(boxes).toHaveLength(2);

    await user.clear(boxes[0]);
    await user.type(boxes[0], 'The courtyard in the evening');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [group] = sent().groups;
    expect(group.images[0].caption).toBe('The courtyard in the evening');
    expect(group.images[1].caption).toBe('');
    expect(captionBoxes()[1]).toHaveValue('');
  });

  it('keeps the stored caption on the picture it was stored against', async () => {
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    expect(captionBoxes()[0]).toHaveValue('At dusk');
    expect(captionBoxes()[1]).toHaveValue('');
  });
});

describe('taking the cover off', () => {
  /** A project whose cover is a photograph that is in none of its groups. */
  const withLooseCover = {
    ...project,
    leadImageId: 'm3',
    leadImageAlt: 'The front of the building',
    leadImage: loose,
  };

  it('offers the photograph a home rather than dropping it off the screen', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={withLooseCover} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getByRole('button', { name: 'This is the cover. Press to unset it.' }));

    /* Said plainly, with something to do about it. Ahmad used to be left to
       notice on his own that the photograph had gone, and to upload it again. */
    expect(screen.getByText(/in none of the groups above/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Put it with the pictures' }));

    expect(screen.getByText(/back with the pictures above/)).toBeTruthy();

    /* On screen, in the arrangement, with a box of its own. */
    expect(screen.getAllByLabelText('What this picture shows*')).toHaveLength(3);
    expect(screen.getByText('3 in 1 group')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [group] = sent().groups;
    expect(group.images.map((image) => image.mediaId)).toEqual(['m1', 'm2', 'm3']);
    /* The description it had as the cover comes with it. Without that the save
       is refused for a picture with nothing said about it. */
    expect(group.images[2].alt).toBe('The front of the building');
    expect(sent().fields.leadImageId).toBeNull();
  });

  it('says nothing when the outgoing cover is one of the pictures anyway', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getByRole('button', { name: 'This is the cover. Press to unset it.' }));

    /* That photograph is still in group one, three inches up the screen. */
    expect(screen.queryByRole('button', { name: 'Put it with the pictures' })).toBeNull();
    expect(screen.getByText('2 in 1 group')).toBeTruthy();
  });
});

describe('moving a picture between the pictures and the drawings', () => {
  it('takes a picture out of its group and into the drawings, description and all', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getAllByRole('button', { name: 'Move to the drawings' })[0]);

    expect(screen.getByText('1 in 1 group')).toBeTruthy();
    expect(screen.getByText('1 sheet')).toBeTruthy();
    /* A kind he can change, rather than an empty box under a sheet. */
    expect(screen.getByLabelText('Kind of drawing')).toHaveValue('Drawing');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().groups[0].images.map((image) => image.mediaId)).toEqual(['m2']);
    expect(sent().drawings).toEqual([
      { mediaId: 'm1', alt: 'A picture of the courtyard', drawingType: 'Drawing' },
    ]);
  });

  it('brings a drawing back to the pictures, description and all', async () => {
    const user = userEvent.setup({ delay: null });
    const drawings = [
      {
        id: 'd1',
        mediaId: 'm3',
        alt: 'Ground floor plan, showing the courtyard',
        drawingType: 'Plan',
        media: loose,
      },
    ];
    render(<ProjectForm project={project} groups={groups} drawings={drawings} film={null} />);

    await user.click(screen.getByRole('button', { name: 'Move to the pictures' }));

    expect(screen.getByText('No drawings on this project. It does not need any.')).toBeTruthy();
    expect(screen.getByText('3 in 1 group')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().drawings).toEqual([]);
    const [group] = sent().groups;
    expect(group.images.map((image) => image.mediaId)).toEqual(['m1', 'm2', 'm3']);
    expect(group.images[2].alt).toBe('Ground floor plan, showing the courtyard');
  });
});
