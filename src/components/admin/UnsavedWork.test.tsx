/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UnsavedWorkProvider, useRegisterUnsaved, useUnsavedWork } from './UnsavedWork';
import { GuardedLink } from './GuardedLink';

/**
 * The protection against losing work, tested.
 *
 * It had none. Both a full unit run and a full browser run went green without
 * executing a line of it, which is how the navigation bar came to be the one
 * exit nothing guarded while every gate reported success. A guard nothing
 * exercises is a comment.
 */

const push = vi.fn();
const back = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back }),
  usePathname: () => '/admin',
}));

beforeEach(() => {
  push.mockClear();
  back.mockClear();
});

function Editor({ dirty, name = 'editor' }: { dirty: boolean; name?: string }) {
  useRegisterUnsaved(name, dirty);
  return <p>{name} is {dirty ? 'dirty' : 'clean'}</p>;
}

function Readout() {
  const { anyUnsaved } = useUnsavedWork();
  return <p data-testid="readout">{anyUnsaved ? 'unsaved' : 'saved'}</p>;
}

describe('the unsaved work registry', () => {
  it('is clean with nothing registered', () => {
    render(
      <UnsavedWorkProvider>
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('saved');
  });

  it('is dirty when any one editor is, which is the point', () => {
    // The navigation bar renders above every editor and cannot see any of their
    // flags. This is the mechanism that lets it.
    render(
      <UnsavedWorkProvider>
        <Editor name="fields" dirty={false} />
        <Editor name="media" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('unsaved');
  });

  it('goes clean only when every editor is clean', () => {
    const { rerender } = render(
      <UnsavedWorkProvider>
        <Editor name="fields" dirty />
        <Editor name="media" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('unsaved');

    rerender(
      <UnsavedWorkProvider>
        <Editor name="fields" dirty={false} />
        <Editor name="media" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('unsaved');

    rerender(
      <UnsavedWorkProvider>
        <Editor name="fields" dirty={false} />
        <Editor name="media" dirty={false} />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('saved');
  });

  it('an editor that unmounts takes its claim with it', () => {
    // Otherwise a component leaving mid edit marks the whole area permanently
    // dirty and every navigation asks forever.
    const { rerender } = render(
      <UnsavedWorkProvider>
        <Editor name="film" dirty />
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('unsaved');

    rerender(
      <UnsavedWorkProvider>
        <Readout />
      </UnsavedWorkProvider>,
    );
    expect(screen.getByTestId('readout')).toHaveTextContent('saved');
  });

  it('arms the browser warning only while something is unsaved', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = render(
      <UnsavedWorkProvider>
        <Editor dirty />
      </UnsavedWorkProvider>,
    );
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true);

    rerender(
      <UnsavedWorkProvider>
        <Editor dirty={false} />
      </UnsavedWorkProvider>,
    );
    expect(remove.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true);

    unmount();
    add.mockRestore();
    remove.mockRestore();
  });
});

describe('GuardedLink', () => {
  it('navigates straight through when nothing is unsaved', async () => {
    render(
      <UnsavedWorkProvider>
        <Editor dirty={false} />
        <GuardedLink href="/admin/media">Media</GuardedLink>
      </UnsavedWorkProvider>,
    );

    // A plain link when there is nothing at stake, so prefetching, middle click
    // and the status bar all keep working.
    const link = screen.getByRole('link', { name: 'Media' });
    expect(link).toHaveAttribute('href', '/admin/media');
    await userEvent.click(link);
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });

  it('asks first when there is unsaved work, and staying does not navigate', async () => {
    render(
      <UnsavedWorkProvider>
        <Editor dirty />
        <GuardedLink href="/admin/media">Media</GuardedLink>
      </UnsavedWorkProvider>,
    );

    await userEvent.click(screen.getByRole('link', { name: 'Media' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates once leaving is confirmed', async () => {
    render(
      <UnsavedWorkProvider>
        <Editor dirty />
        <GuardedLink href="/admin/resume">Resume</GuardedLink>
      </UnsavedWorkProvider>,
    );

    await userEvent.click(screen.getByRole('link', { name: 'Resume' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave and lose the changes' }));

    expect(push).toHaveBeenCalledWith('/admin/resume');
  });

  it('lets a modified click open a new tab without asking', async () => {
    // Nothing is lost by opening elsewhere, so interrupting would be noise.
    render(
      <UnsavedWorkProvider>
        <Editor dirty />
        <GuardedLink href="/admin/media">Media</GuardedLink>
      </UnsavedWorkProvider>,
    );

    /* fireEvent rather than userEvent, because the modifier flag on the click
       itself is the thing under test and userEvent's held modifier does not
       reliably reach the synthetic event. */
    fireEvent.click(screen.getByRole('link', { name: 'Media' }), { metaKey: true });

    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    for (const modifier of ['ctrlKey', 'shiftKey', 'altKey'] as const) {
      fireEvent.click(screen.getByRole('link', { name: 'Media' }), { [modifier]: true });
      expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
    }

    // A middle click opens a tab too, and must not be intercepted either.
    fireEvent.click(screen.getByRole('link', { name: 'Media' }), { button: 1 });
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
});

/**
 * The two timing properties the registry has to hold.
 *
 * Both were found by review rather than by use, which is the point: neither
 * shows up in normal clicking, and both lose work when they do.
 */
describe('the registry decides on live state, not on a render behind', () => {
  /* Reads isAnyUnsaved during render and shows the answer, so the assertion is
     on what a click handler would have seen at that same moment. */
  function LiveReadout() {
    const { isAnyUnsaved } = useUnsavedWork();
    return <p data-testid="live">{isAnyUnsaved() ? 'unsaved' : 'saved'}</p>;
  }

  it('reports unsaved through isAnyUnsaved as soon as an editor registers', () => {
    render(
      <UnsavedWorkProvider>
        <Editor dirty />
        <LiveReadout />
      </UnsavedWorkProvider>,
    );

    // The click handler reads this rather than the rendered boolean, because
    // registration goes through state and is a render behind the keystroke.
    expect(screen.getByTestId('live')).toHaveTextContent('unsaved');
  });

  it('a second ask resolves the first rather than leaving it hanging', async () => {
    // A link clicked while the back guard is already waiting used to orphan the
    // first promise forever, so the navigation it was waiting on never
    // happened at all.
    const answers: string[] = [];

    function TwoAsks() {
      const { confirmLeave } = useUnsavedWork();
      return (
        <button
          type="button"
          onClick={() => {
            void confirmLeave().then((leave) => answers.push(`first:${leave}`));
            void confirmLeave().then((leave) => answers.push(`second:${leave}`));
          }}
        >
          Ask twice
        </button>
      );
    }

    render(
      <UnsavedWorkProvider>
        <Editor dirty />
        <TwoAsks />
      </UnsavedWorkProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ask twice' }));

    // The superseded one is answered immediately, and answered with "stay".
    await vi.waitFor(() => expect(answers).toContain('first:false'));

    await userEvent.click(await screen.findByRole('button', { name: 'Leave and lose the changes' }));
    await vi.waitFor(() => expect(answers).toContain('second:true'));
  });
});
