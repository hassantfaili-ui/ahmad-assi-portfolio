import { describe, expect, it } from 'vitest';
import { tiers, type TierName } from './tiers';

/**
 * The smallest shape tiers() accepts, which is also the point of the generic:
 * these are plain objects rather than Prisma rows, and the function still takes
 * them because all it ever reads is tier and order.
 */
const p = (id: string, tier: TierName, order: number) => ({ id, tier, order });

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('tiers', () => {
  it('splits into three tiers and sorts by order within each', () => {
    const result = tiers([
      p('c', 'set', 3),
      p('z', 'index', 9),
      p('a', 'lead', 1),
      p('b', 'set', 2),
      p('y', 'index', 8),
    ]);

    expect(ids(result.leads)).toEqual(['a']);
    expect(ids(result.set)).toEqual(['b', 'c']);
    expect(ids(result.index)).toEqual(['y', 'z']);
  });

  it('takes at most three leads, and takes the three lowest by order', () => {
    const result = tiers([
      p('fourth', 'lead', 40),
      p('first', 'lead', 10),
      p('third', 'lead', 30),
      p('second', 'lead', 20),
    ]);

    expect(result.leads).toHaveLength(3);
    expect(ids(result.leads)).toEqual(['first', 'second', 'third']);
  });

  it('never loses a fourth lead: it falls through into the set in order', () => {
    const result = tiers([
      p('L1', 'lead', 1),
      p('L2', 'lead', 2),
      p('L3', 'lead', 3),
      p('L4', 'lead', 4),
      p('S', 'set', 2),
    ]);

    expect(ids(result.leads)).toEqual(['L1', 'L2', 'L3']);
    expect(ids(result.set)).toEqual(['S', 'L4']);

    // The assertion the whole function exists for. Five went in, five come out.
    const all = [...result.leads, ...result.set, ...result.index];
    expect(all).toHaveLength(5);
    expect(ids(all).sort()).toEqual(['L1', 'L2', 'L3', 'L4', 'S']);
  });

  it('falls every lead past the third through, not just the fourth', () => {
    const result = tiers([
      p('L1', 'lead', 1),
      p('L2', 'lead', 2),
      p('L3', 'lead', 3),
      p('L4', 'lead', 4),
      p('L5', 'lead', 5),
      p('L6', 'lead', 6),
      p('S', 'set', 10),
    ]);

    expect(ids(result.leads)).toEqual(['L1', 'L2', 'L3']);
    expect(ids(result.set)).toEqual(['L4', 'L5', 'L6', 'S']);
    expect([...result.leads, ...result.set, ...result.index]).toHaveLength(7);
  });

  it('returns empty tiers for an empty input', () => {
    expect(tiers([])).toEqual({ leads: [], set: [], index: [] });
  });

  it('is stable when several projects share the same order value', () => {
    const result = tiers([
      p('s-first', 'set', 5),
      p('s-second', 'set', 5),
      p('s-third', 'set', 5),
      p('i-first', 'index', 7),
      p('i-second', 'index', 7),
    ]);

    expect(ids(result.set)).toEqual(['s-first', 's-second', 's-third']);
    expect(ids(result.index)).toEqual(['i-first', 'i-second']);
  });

  it('places a fallen through lead behind a set project of the same order', () => {
    const result = tiers([
      p('L4', 'lead', 5),
      p('L1', 'lead', 1),
      p('L2', 'lead', 2),
      p('L3', 'lead', 3),
      p('S', 'set', 5),
    ]);

    expect(ids(result.set)).toEqual(['S', 'L4']);
  });

  it('leaves the array it was given alone', () => {
    const input = [p('c', 'set', 3), p('a', 'lead', 1), p('b', 'set', 2)];
    const before = ids(input);

    tiers(input);

    expect(ids(input)).toEqual(before);
  });
});

/**
 * The invariants added after an adversarial review found that ties on `order`
 * were being resolved by the sequence Postgres happened to return. `order` is
 * @default(99) in the schema, so every project Ahmad creates without reordering
 * shares a value, which made this the common case rather than the rare one.
 */
describe('tiers, determinism and completeness', () => {
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) =>
      permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    );
  }

  it('gives the same answer whatever order the rows arrive in', () => {
    // Four leads, all at the schema default. Which three lead the home page
    // must not depend on the row order of the query that fetched them.
    const rows = [
      { id: 'delta', tier: 'lead' as const, order: 99 },
      { id: 'alpha', tier: 'lead' as const, order: 99 },
      { id: 'charlie', tier: 'lead' as const, order: 99 },
      { id: 'bravo', tier: 'lead' as const, order: 99 },
    ];

    const answers = permutations(rows).map((rows) => {
      const result = tiers(rows);
      return JSON.stringify({ leads: ids(result.leads), set: ids(result.set) });
    });

    expect(new Set(answers).size).toBe(1);
    expect(ids(tiers(rows).leads)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(ids(tiers(rows).set)).toEqual(['delta']);
  });

  it('keeps the strip stable across permutations too', () => {
    const rows = [
      { id: 'z', tier: 'set' as const, order: 99 },
      { id: 'a', tier: 'set' as const, order: 99 },
      { id: 'm', tier: 'set' as const, order: 99 },
    ];
    const answers = permutations(rows).map((r) => JSON.stringify(ids(tiers(r).set)));
    expect(new Set(answers).size).toBe(1);
    expect(ids(tiers(rows).set)).toEqual(['a', 'm', 'z']);
  });

  it('still puts a demoted lead behind a genuine set project of the same order', () => {
    // Even though 'aaa' sorts before 'zzz' by id, deliberate placement wins.
    const result = tiers([
      { id: 'l1', tier: 'lead', order: 1 },
      { id: 'l2', tier: 'lead', order: 2 },
      { id: 'l3', tier: 'lead', order: 3 },
      { id: 'aaa', tier: 'lead', order: 5 },
      { id: 'zzz', tier: 'set', order: 5 },
    ]);
    expect(ids(result.set)).toEqual(['zzz', 'aaa']);
  });

  it('loses nothing when a tier value is not one of the three', () => {
    // The rows reach this function through a cast in queries.ts, and the Prisma
    // enum could gain a member. Nothing may vanish either way.
    const rows = [
      { id: 'a', tier: 'lead' as const, order: 1 },
      { id: 'b', tier: 'featured' as unknown as 'set', order: 2 },
      { id: 'c', tier: 'set' as const, order: 3 },
    ];
    const result = tiers(rows);
    expect(result.leads.length + result.set.length + result.index.length).toBe(3);
    expect(ids(result.index)).toContain('b');
  });
});
