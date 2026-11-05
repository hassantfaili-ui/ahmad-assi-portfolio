/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* Every write the table can make, mocked so a test can hold one open while
   another lands. That interleaving is the whole point: the bug being guarded
   against was a refusal on one row restoring a snapshot of the entire list,
   which erased a neighbouring row's change the server had already accepted. */
const mutations = vi.hoisted(() => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  reorderProjects: vi.fn(),
  setProjectPublished: vi.fn(),
  setProjectShelved: vi.fn(),
  setProjectTier: vi.fn(),
}));
vi.mock('@/lib/mutations', () => mutations);

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

/* The table itself calls useRouter for the jump to a newly created project,
   which no test here takes, so the router only has to exist. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/* next/image wants a loader and a real layout; neither is what is under test. */
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="image">{alt}</span>,
}));

import { ProjectsTable } from './ProjectsTable';
import type { SaveResult } from '@/lib/action-result';
import type { AdminProjectRow } from '@/lib/admin-queries';

function row(overrides: Partial<AdminProjectRow> & Pick<AdminProjectRow, 'id' | 'title'>): AdminProjectRow {
  return {
    slug: overrides.id,
    year: 2024,
    tier: 'set',
    order: 0,
    published: false,
    shelved: false,
    credit: 'Studio',
    leadImage: null,
    leadImageAlt: '',
    imageCount: 0,
    drawingCount: 0,
    hasFilm: false,
    ...overrides,
  };
}

const ALPHA = row({ id: 'alpha', title: 'Alpha Court', order: 0 });
const BETA = row({ id: 'beta', title: 'Beta House', order: 1 });
const GAMMA = row({ id: 'gamma', title: 'Gamma Hall', order: 2 });

/* A promise the test resolves by hand, standing in for the slow write. */
function heldOpen(): { promise: Promise<SaveResult>; answer: (result: SaveResult) => void } {
  let answer!: (result: SaveResult) => void;
  const promise = new Promise<SaveResult>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

function switchFor(title: string) {
  return screen.getByRole('switch', { name: new RegExp(title) });
}

beforeEach(() => {
  for (const mock of Object.values(mutations)) mock.mockReset();
  push.mockClear();
});

describe('ProjectsTable, when writes overlap and the earlier one fails', () => {
  it('reverts only the row whose publish was refused, not one accepted meanwhile', async () => {
    const user = userEvent.setup({ delay: null });
    const first = heldOpen();
    mutations.setProjectPublished.mockReturnValueOnce(first.promise);
    mutations.setProjectPublished.mockResolvedValueOnce({ ok: true });

    render(<ProjectsTable projects={[ALPHA, BETA]} initialNotice={null} />);

    /* Alpha's write goes out and hangs; the switch shows the optimistic state. */
    await user.click(switchFor('Alpha Court'));
    expect(switchFor('Alpha Court')).toHaveAttribute('aria-checked', 'true');

    /* Beta's write goes out while Alpha's is still open, and the server takes
       it. Beta House is live now, whatever happens to Alpha's write. */
    await user.click(switchFor('Beta House'));
    await waitFor(() => expect(mutations.setProjectPublished).toHaveBeenCalledTimes(2));
    expect(switchFor('Beta House')).toHaveAttribute('aria-checked', 'true');

    /* Now the earlier write comes back refused. */
    await act(async () => {
      first.answer({ ok: false, message: 'Refused.' });
    });

    /* Alpha goes back the way it was, and only Alpha. The old whole-list
       snapshot also put Beta back to unpublished, showing it hidden while it
       was live on the site. */
    await waitFor(() => expect(switchFor('Alpha Court')).toHaveAttribute('aria-checked', 'false'));
    expect(switchFor('Beta House')).toHaveAttribute('aria-checked', 'true');
  });

  it('reverts only the tier that was refused, leaving an accepted publish alone', async () => {
    const user = userEvent.setup({ delay: null });
    const tierWrite = heldOpen();
    mutations.setProjectTier.mockReturnValueOnce(tierWrite.promise);
    mutations.setProjectPublished.mockResolvedValueOnce({ ok: true });

    render(<ProjectsTable projects={[ALPHA, BETA]} initialNotice={null} />);

    const tier = screen.getByRole('combobox', { name: /Where Alpha Court sits/ });
    await user.selectOptions(tier, 'lead');
    expect(tier).toHaveValue('lead');

    await user.click(switchFor('Beta House'));
    await waitFor(() => expect(mutations.setProjectPublished).toHaveBeenCalledTimes(1));
    expect(switchFor('Beta House')).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      tierWrite.answer({ ok: false, message: 'Refused.' });
    });

    await waitFor(() => expect(tier).toHaveValue('set'));
    expect(switchFor('Beta House')).toHaveAttribute('aria-checked', 'true');
  });

  it('puts back only the ordering when a reorder is refused, keeping fields written since', async () => {
    const user = userEvent.setup({ delay: null });
    const reorder = heldOpen();
    mutations.reorderProjects.mockReturnValueOnce(reorder.promise);
    mutations.setProjectPublished.mockResolvedValueOnce({ ok: true });

    render(<ProjectsTable projects={[ALPHA, BETA, GAMMA]} initialNotice={null} />);

    /* Move Alpha down a place from the keyboard; the write hangs. */
    screen.getByRole('button', { name: /Reorder Alpha Court/ }).focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(mutations.reorderProjects).toHaveBeenCalledWith(['beta', 'alpha', 'gamma']),
    );

    /* While the reorder is out, Beta House is published and the server takes it. */
    await user.click(switchFor('Beta House'));
    await waitFor(() => expect(mutations.setProjectPublished).toHaveBeenCalledTimes(1));

    await act(async () => {
      reorder.answer({ ok: false, message: 'Refused.' });
    });

    /* The ordering goes back, but the rows themselves stay current: Beta House
       keeps the published state the server accepted. The old snapshot restore
       returned it to unpublished rows from before the reorder began. */
    await waitFor(() => {
      const handles = screen.getAllByRole('button', { name: /Reorder/ });
      expect(handles[0]).toHaveAccessibleName(/Reorder Alpha Court/);
      expect(handles[1]).toHaveAccessibleName(/Reorder Beta House/);
      expect(handles[2]).toHaveAccessibleName(/Reorder Gamma Hall/);
    });
    expect(switchFor('Beta House')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ProjectsTable, the Archives folder', () => {
  function archivesFolder() {
    return screen.getByRole('region', { name: /Archives/ });
  }

  it('moves an archived project out of the running order into the folder, and Restore brings it back', async () => {
    const user = userEvent.setup({ delay: null });
    mutations.setProjectShelved.mockResolvedValue({ ok: true });

    render(<ProjectsTable projects={[{ ...ALPHA, published: true }, BETA]} initialNotice={null} />);

    expect(within(archivesFolder()).getByText(/Nothing archived/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archive Alpha Court' }));
    await waitFor(() => expect(mutations.setProjectShelved).toHaveBeenCalledWith('alpha', true));

    /* Out of the sortable list, into the folder. */
    expect(screen.queryByRole('button', { name: /Reorder Alpha Court/ })).not.toBeInTheDocument();
    expect(within(archivesFolder()).getByText('Alpha Court')).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('Alpha Court is in your Archives folder now, and off the site.');

    await user.click(within(archivesFolder()).getByRole('button', { name: 'Restore Alpha Court' }));
    await waitFor(() => expect(mutations.setProjectShelved).toHaveBeenCalledWith('alpha', false));

    expect(screen.getByRole('button', { name: /Reorder Alpha Court/ })).toBeInTheDocument();
    expect(within(archivesFolder()).queryByText('Alpha Court')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('Alpha Court is back in the list and on the site.');
  });

  it('never touches the tier: the site Archive list placement is a separate thing', async () => {
    const user = userEvent.setup({ delay: null });
    mutations.setProjectShelved.mockResolvedValue({ ok: true });

    render(<ProjectsTable projects={[{ ...ALPHA, tier: 'index' }]} initialNotice={null} />);

    await user.click(screen.getByRole('button', { name: 'Archive Alpha Court' }));
    await waitFor(() => expect(mutations.setProjectShelved).toHaveBeenCalledTimes(1));
    expect(mutations.setProjectTier).not.toHaveBeenCalled();
  });

  it('puts the project back in the running order when the archive is refused', async () => {
    const user = userEvent.setup({ delay: null });
    mutations.setProjectShelved.mockResolvedValue({ ok: false, message: 'Refused.' });

    render(<ProjectsTable projects={[ALPHA, BETA]} initialNotice={null} />);

    await user.click(screen.getByRole('button', { name: 'Archive Alpha Court' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Reorder Alpha Court/ })).toBeInTheDocument(),
    );
    expect(within(archivesFolder()).queryByText('Alpha Court')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('Refused.', 'error');
  });

  it('keeps archived projects out of a reorder and in the folder afterwards', async () => {
    const user = userEvent.setup({ delay: null });
    mutations.reorderProjects.mockResolvedValue({ ok: true });

    render(
      <ProjectsTable projects={[ALPHA, { ...BETA, shelved: true }, GAMMA]} initialNotice={null} />,
    );

    screen.getByRole('button', { name: /Reorder Alpha Court/ }).focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => expect(mutations.reorderProjects).toHaveBeenCalledWith(['gamma', 'alpha']));
    expect(within(archivesFolder()).getByText('Beta House')).toBeInTheDocument();
  });
});
