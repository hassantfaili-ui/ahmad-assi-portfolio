/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

/* Keep the real editor/save flow; stand in for video decoding and R2 upload. */
vi.mock('@/components/admin/FramePicker', () => ({
  FramePicker: ({ open, onPicked, onOpenChange }: import('./FramePicker').FramePickerProps) => open ? (
    <div role="dialog" aria-label="Frame picker">
      <button type="button" onClick={() => {
        onPicked({
          id: 'frame', key: 'film/frame.jpg', bytes: 2000,
          width: 1920, height: 1080, durationSeconds: null,
          kind: 'image', contentType: 'image/jpeg',
        });
        onOpenChange(false);
      }}>Use this frame</button>
      <button type="button" onClick={() => onOpenChange(false)}>Cancel</button>
    </div>
  ) : null,
}));

import { ProjectForm } from './ProjectForm';
import type { EditorFilm } from './FilmEditor';
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

/* Part translated, which is the ordinary state of every project for as long as
   it takes Ahmad to work through seventeen of them. The blanks are not missing
   data, they are the design: the French page shows the English for those. */
const french = {
  title: 'Les hauteurs du jardin',
  location: '',
  buildingType: '',
  area: '',
  role: '',
  contribution: '',
  summary: '',
  body: '',
  credit: '',
  leadImageAlt: '',
};

const project = {
  id: 'p1',
  updatedAt: '2026-08-30T03:00:00.000Z',
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
  french,
};

/* Two pictures in the one group, because most of what is being guarded here is
   a change to one of them landing on the other. */
const groups: EditorGroup[] = [
  {
    id: 'g1',
    layout: 'full',
    caption: 'The old group caption',
    images: [
      {
        id: 'i1',
        mediaId: 'm1',
        alt: 'A picture of the courtyard',
        caption: 'At dusk',
        /* Already translated, and never touched by any test that is about the
           English. Whatever the English boxes do, these words have to come back
           out of the payload exactly as they went in, or the next save writes
           over a translation nobody asked it to touch. */
        french: { alt: 'Une photo de la cour', caption: 'Au crepuscule' },
        ratio: null,
        focus: { x: 0.5, y: 0.5 },
        media,
      },
      {
        id: 'i2',
        mediaId: 'm2',
        alt: 'The stair from the landing',
        caption: '',
        french: { alt: '', caption: '' },
        ratio: '16:9',
        focus: { x: 0.25, y: 1 },
        media: second,
      },
    ],
  },
];

/** The caption boxes on the pictures, in the order the pictures are in. */
function captionBoxes(): HTMLElement[] {
  return screen.getAllByLabelText('Caption for this picture');
}

/** The French caption boxes, which only exist once the switch has been pressed. */
function frenchCaptionBoxes(): HTMLElement[] {
  return screen.getAllByLabelText('Caption for this picture, in French');
}

async function showFrench(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Show the French boxes' }));
}

interface SavedPayload {
  fields: { location: string; leadImageId: string | null; leadImageAlt: string };
  film: { posterMediaId: string | null; sources: { mediaId: string; height: number }[] } | null;
  french: { title: string; summary: string; leadImageAlt: string };
  published: boolean;
  groups: {
    caption?: string | null;
    images: {
      mediaId: string;
      alt: string;
      caption?: string | null;
      ratio?: string | null;
      focusX?: number;
      focusY?: number;
      french: { alt: string; caption: string };
    }[];
  }[];
  drawings: {
    mediaId: string;
    alt: string;
    drawingType: string;
    ratio: string | null;
    focusX: number;
    focusY: number;
    french: { alt: string; drawingType: string };
  }[];
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

describe('choosing frames for project covers and walkthrough thumbnails', () => {
  const film: EditorFilm = {
    posterMedia: media,
    youtubeId: '',
    caption: 'Walkthrough',
    french: { caption: '' },
    sources: [{ height: 720, media: { ...media, id: 'video', key: 'film/video.mp4' } }],
  };

  it.each([true, false])('chooses a walkthrough thumbnail independently of the project cover (existing thumbnail: %s)', async (hasPoster) => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={{
      ...film, posterMedia: hasPoster ? media : null,
    }} />);

    const walkthrough = screen.getByRole('region', { name: 'Walkthrough' });
    await user.click(within(walkthrough).getByRole('button', { name: 'Choose a frame' }));
    await user.click(screen.getByRole('button', { name: 'Use this frame' }));
    expect(saveWholeProject).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save everything' }));
    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().film?.posterMediaId).toBe('frame');
    expect(sent().film?.sources).toEqual([{ mediaId: 'video', height: 720 }]);
    expect(sent().fields.leadImageId).toBe('m1');
  });

  it('saves the chosen frame as the main cover while preserving the video poster', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={film} />);
    await user.click(screen.getByRole('button', { name: 'Choose frame as cover' }));
    await user.click(screen.getByRole('button', { name: 'Use this frame' }));

    expect(saveWholeProject).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'This is the cover. Press to unset it.' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('What the cover shows*')).toHaveValue('');
    await user.type(screen.getByLabelText('What the cover shows*'), 'The courtyard seen from the entrance');
    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().fields.leadImageId).toBe('frame');
    expect(sent().fields.leadImageAlt).toBe('The courtyard seen from the entrance');
    expect(sent().film?.posterMediaId).toBe('m1');
    expect(sent().film?.sources).toEqual([{ mediaId: 'video', height: 720 }]);
    expect(sent().groups[0].images.map((image) => image.mediaId)).toEqual(['m1', 'm2']);
  });

  it('keeps a standalone outgoing cover with the pictures', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={{ ...project, leadImageId: loose.id, leadImage: loose }} groups={groups} drawings={[]} film={film} />);
    await user.click(screen.getByRole('button', { name: 'Choose frame as cover' }));
    await user.click(screen.getByRole('button', { name: 'Use this frame' }));
    await user.type(screen.getByLabelText('What the cover shows*'), 'The new view');
    await user.click(screen.getByRole('button', { name: 'Save everything' }));
    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().fields.leadImageId).toBe('frame');
    expect(sent().groups[0].images.map((image) => image.mediaId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('keeps the current project cover when the picker is cancelled', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={film} />);
    await user.click(screen.getByRole('button', { name: 'Choose frame as cover' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Save everything' }));
    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().fields.leadImageId).toBe('m1');
  });

  it('offers no frame picker when there is no uploaded walkthrough', () => {
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);
    expect(screen.queryByRole('button', { name: 'Choose frame as cover' })).not.toBeInTheDocument();
  });
});

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

  /* The shape is the third thing a picture carries besides its words, and it
     has to make the same trip as the caption did not: pressed here, sent in the
     payload, with the focus beside it. */
  it('sends the 3:2 shape pressed on a picture and where its window sits', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const shapes = screen.getByRole('radiogroup', { name: 'Shape of A picture of the courtyard' });
    await user.click(within(shapes).getByRole('radio', { name: '3:2' }));

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [first, second] = sent().groups[0].images;
    expect(first.ratio).toBe('3:2');
    expect(first.focusX).toBe(0.5);
    expect(first.focusY).toBe(0.5);
    /* The other picture's shape and focus go back exactly as they came in. */
    expect(second.ratio).toBe('16:9');
    expect(second.focusX).toBe(0.25);
    expect(second.focusY).toBe(1);
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

  it('keeps the photograph rather than asking, because the asking was missed', async () => {
    /* It used to offer, and the offer was the bug. The notice sits at the top
       of the cover section and the grid under it runs to fifteen hundred
       pixels, so a cover chosen from the lower half put the question two
       screens above the press. Ahmad reported the photograph vanishing twice.
       The safe answer is taken for him now. */
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={withLooseCover} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getByRole('button', { name: 'This is the cover. Press to unset it.' }));

    /* Already done, and said. No press required for the photograph to survive. */
    expect(screen.getByText(/now with the pictures above/)).toBeTruthy();
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

  it('lets him leave it out again, for a photograph he did not want back', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={withLooseCover} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getByRole('button', { name: 'This is the cover. Press to unset it.' }));
    expect(screen.getAllByLabelText('What this picture shows*')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Leave it out' }));

    /* Back to two, and only the one row it added is gone. */
    expect(screen.getAllByLabelText('What this picture shows*')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [group] = sent().groups;
    expect(group.images.map((image) => image.mediaId)).toEqual(['m1', 'm2']);
  });

  it('says nothing when the outgoing cover is one of the pictures anyway', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getByRole('button', { name: 'This is the cover. Press to unset it.' }));

    /* That photograph is still in group one, three inches up the screen, so
       there is nothing to rescue and nothing to say. */
    expect(screen.queryByText(/now with the pictures above/)).toBeNull();
    expect(screen.getByText('2 in 1 group')).toBeTruthy();
  });
});

describe('moving a picture between the pictures and the drawings', () => {
  it('takes a picture out of its group and into the drawings, description and all', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    const shapes = screen.getByRole('radiogroup', { name: 'Shape of A picture of the courtyard' });
    await user.click(within(shapes).getByRole('radio', { name: '3:2' }));
    await user.click(screen.getAllByRole('button', { name: 'Move to the drawings' })[0]);

    expect(screen.getByText('1 in 1 group')).toBeTruthy();
    expect(screen.getByText('1 sheet')).toBeTruthy();
    /* A kind he can change, rather than an empty box under a sheet. */
    expect(screen.getByLabelText('Kind of drawing')).toHaveValue('Drawing');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().groups[0].images.map((image) => image.mediaId)).toEqual(['m2']);
    expect(sent().drawings).toEqual([
      {
        mediaId: 'm1',
        alt: 'A picture of the courtyard',
        drawingType: 'Drawing',
        ratio: '3:2',
        focusX: 0.5,
        focusY: 0.5,
        /* The French description comes with it. The kind of drawing is blank
           because Drawing above is the site's word, not one Ahmad wrote, so
           there is nothing yet to have translated. */
        french: { alt: 'Une photo de la cour', drawingType: '' },
      },
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
        ratio: '3:2' as const,
        focus: { x: 0.2, y: 0.8 },
        french: { alt: 'Plan du rez de chaussee', drawingType: 'Plan' },
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
    expect(group.images[2]).toMatchObject({ ratio: '3:2', focusX: 0.2, focusY: 0.8 });
  });

  it('sends the drawing’s selected shape and focus with the whole project', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[{
      id: 'd1', mediaId: 'm3', alt: 'Ground floor plan', drawingType: 'Plan',
      ratio: null, focus: { x: 0.5, y: 0.5 },
      french: { alt: '', drawingType: '' }, media: loose,
    }]} film={null} />);

    const shapes = screen.getByRole('radiogroup', { name: 'Shape of Ground floor plan' });
    await user.click(within(shapes).getByRole('radio', { name: '3:2' }));
    const preview = screen.getByRole('button', { name: /Which part of Ground floor plan stays/ });
    preview.focus();
    await user.keyboard('{ArrowRight}{ArrowDown}');
    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().drawings[0]).toMatchObject({ ratio: '3:2', focusX: 0.55, focusY: 0.55 });
  });
});

/**
 * The French half of the same screen.
 *
 * It is saved by the same button, in the same payload, in the same press. A
 * second button here would be the four button screen all over again, one
 * language further along, and the failure would look identical: words typed,
 * nothing warned, nothing sent.
 */
describe('the French boxes', () => {
  it('sends a French caption typed on a picture, on that picture', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await showFrench(user);

    const boxes = frenchCaptionBoxes();
    expect(boxes).toHaveLength(2);

    await user.clear(boxes[1]);
    await user.type(boxes[1], "L'escalier vu du palier");

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [group] = sent().groups;
    expect(group.images[1].french.caption).toBe("L'escalier vu du palier");
    /* And not on the picture beside it, which is the mistake the group caption
       made for years. */
    expect(group.images[0].french.caption).toBe('Au crepuscule');
  });

  it('leaves a stored translation exactly as it was when nothing is typed in it', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    /* The English is edited and the French is never even looked at, which is
       the common case: most saves of a translated project are English edits.
       The French still has to make the round trip untouched, because the save
       writes every field it is handed and a blank would delete the row. */
    const caption = captionBoxes()[0];
    await user.clear(caption);
    await user.type(caption, 'At first light');

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    const [group] = sent().groups;
    expect(group.images[0].caption).toBe('At first light');
    expect(group.images[0].french).toEqual({
      alt: 'Une photo de la cour',
      caption: 'Au crepuscule',
    });
    expect(sent().french.title).toBe('Les hauteurs du jardin');
  });

  it('carries every French box on every save, blank ones included', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    /* Blank has to be sent, not left out. Left out would read to the save as
       "leave the stored one alone", and there would then be no way to clear a
       translation that is wrong. */
    expect(sent().french.summary).toBe('');
    expect(sent().groups[0].images[1].french).toEqual({ alt: '', caption: '' });
  });

  it('sends French typed with the boxes hidden again afterwards', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await showFrench(user);
    const title = screen.getByLabelText('Title, in French');
    await user.clear(title);
    await user.type(title, 'Les hauteurs');

    /* Hiding the boxes is a way of looking at the screen, not a way of undoing
       work. Work that is on the screen and work that is in the payload have to
       be the same work whatever is being shown. */
    await user.click(screen.getByRole('button', { name: 'Hide the French boxes' }));
    expect(screen.queryByLabelText('Title, in French')).toBeNull();
    expect(screen.getByText('Not saved yet')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save everything' }));

    await waitFor(() => expect(saveWholeProject).toHaveBeenCalledTimes(1));
    expect(sent().french.title).toBe('Les hauteurs');
  });

  it('counts what is written, so hidden French is never silent', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    /* Nine boxes down the left, the cover's description, two pictures at two
       boxes each, and the film's caption: fifteen. Three of them have words in
       them before anything is typed, and the count says so with the boxes
       still hidden, which is the point of counting at all. */
    expect(screen.getByText(/3 of 15 boxes written/)).toBeTruthy();

    await showFrench(user);
    await user.type(screen.getByLabelText('Where it is, in French'), 'Beyrouth');

    expect(screen.getByText(/4 of 15 boxes written/)).toBeTruthy();
  });
});

describe('the English boxes, with the French beside them', () => {
  it('shows nothing in French until it is asked to', () => {
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    /* An ordinary edit is not a translation, and most edits are ordinary. The
       screen stays the size it was until Ahmad says he is translating. */
    expect(screen.queryByLabelText('Title, in French')).toBeNull();
    expect(screen.queryAllByLabelText('Caption for this picture, in French')).toHaveLength(0);
    expect(captionBoxes()).toHaveLength(2);
    expect(screen.getByLabelText('Where it is*')).toHaveValue('Beirut');
  });

  it('keeps the English where it was when the French boxes appear', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await showFrench(user);

    expect(screen.getByLabelText('Where it is*')).toHaveValue('Beirut');
    expect(captionBoxes()[0]).toHaveValue('At dusk');
    expect(captionBoxes()[1]).toHaveValue('');
    /* Showing the boxes is not editing anything, so it cannot be work. */
    expect(screen.queryByText('Not saved yet')).toBeNull();
  });

  it('shows the English a French box stands in for, greyed, until it is written', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProjectForm project={project} groups={groups} drawings={[]} film={null} />);

    await showFrench(user);

    /* The placeholder is how "leaving it empty is fine" is said forty times
       without saying it forty times: the box shows the words the French page
       will print while it is empty. */
    expect(screen.getByLabelText('Where it is, in French')).toHaveAttribute(
      'placeholder',
      'Beirut',
    );
    expect(frenchCaptionBoxes()[0]).toHaveAttribute('placeholder', 'At dusk');
    expect(frenchCaptionBoxes()[1]).toHaveAttribute(
      'placeholder',
      'Nothing written in English yet',
    );
  });
});
