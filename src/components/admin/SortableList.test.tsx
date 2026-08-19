/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SortableList } from './SortableList';

/**
 * The keyboard half of reordering.
 *
 * It has its own test because it is the half nobody exercises by hand. A
 * developer checking this screen drags something, sees it move, and moves on;
 * the arrow keys, the announcement and where focus lands afterwards are only
 * ever found broken by the person who depends on them.
 *
 * These are also the first component tests in the repository. There was no DOM
 * environment configured at all before, which is how a hydration mismatch in
 * the editing screens got past every gate.
 */

interface Row {
  id: string;
  title: string;
}

const ROWS: Row[] = [
  { id: 'a', title: 'Lincoln Beach Center' },
  { id: 'b', title: 'Renewal Square' },
  { id: 'c', title: 'La Casa Aranas' },
];

function setup(onReorder = vi.fn()) {
  render(
    <SortableList
      items={ROWS}
      getId={(row) => row.id}
      getLabel={(row) => row.title}
      onReorder={onReorder}
      renderItem={(row) => <span>{row.title}</span>}
    />,
  );
  return { onReorder };
}

function handleFor(title: string) {
  return screen.getByRole('button', { name: new RegExp(`Reorder ${title}`) });
}

describe('SortableList, from the keyboard', () => {
  it('gives every handle a name saying what it moves and where it is', () => {
    setup();
    expect(handleFor('Lincoln Beach Center')).toHaveAccessibleName(
      /Reorder Lincoln Beach Center\. Position 1 of 3/,
    );
    expect(handleFor('La Casa Aranas')).toHaveAccessibleName(/Position 3 of 3/);
  });

  it('moves an item down with the down arrow', async () => {
    const { onReorder } = setup();
    handleFor('Lincoln Beach Center').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('moves an item up with the up arrow', async () => {
    const { onReorder } = setup();
    handleFor('La Casa Aranas').focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
  });

  it('sends an item to either end with Home and End', async () => {
    const { onReorder } = setup();
    handleFor('La Casa Aranas').focus();
    await userEvent.keyboard('{Home}');
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);

    onReorder.mockClear();
    handleFor('Lincoln Beach Center').focus();
    await userEvent.keyboard('{End}');
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('does nothing at the ends rather than wrapping around', async () => {
    const { onReorder } = setup();
    handleFor('Lincoln Beach Center').focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(onReorder).not.toHaveBeenCalled();

    handleFor('La Casa Aranas').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('announces where the item landed, because the move is otherwise silent', async () => {
    setup();
    handleFor('Lincoln Beach Center').focus();
    await userEvent.keyboard('{ArrowDown}');

    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Lincoln Beach Center moved to position 2 of 3.');
  });

  it('leaves keys that are not movement alone', async () => {
    const { onReorder } = setup();
    handleFor('Renewal Square').focus();
    await userEvent.keyboard('{Enter}{Tab}a');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not move anything while disabled', async () => {
    const onReorder = vi.fn();
    render(
      <SortableList
        items={ROWS}
        getId={(row) => row.id}
        getLabel={(row) => row.title}
        onReorder={onReorder}
        renderItem={(row) => <span>{row.title}</span>}
        disabled
      />,
    );
    const handle = screen.getAllByRole('button')[0];
    expect(handle).toBeDisabled();
    await userEvent.keyboard('{ArrowDown}');
    expect(onReorder).not.toHaveBeenCalled();
  });
});
