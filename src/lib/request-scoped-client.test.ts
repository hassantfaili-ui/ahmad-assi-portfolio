import { describe, expect, it, vi } from 'vitest';

import { requestScopedClient } from './request-scoped-client';

/**
 * The one invariant that failed in production: a method reached through the
 * proxy must run with `this` set to the real client, not the proxy.
 *
 * Prisma's interactive `$transaction(async (tx) => ...)` builds the
 * transaction bound `tx` from `this`. When `this` was the proxy, the
 * transaction body ran against the base client instead, the BEGIN'd
 * transaction was never used, and every whole project save returned P2028.
 * These tests would have gone red the moment that regression was introduced.
 */
describe('the request scoped client proxy', () => {
  it('calls methods with this bound to the real client', () => {
    const seen: unknown[] = [];
    const client = {
      marker: 'the real client',
      $transaction(fn: (tx: unknown) => unknown) {
        seen.push(this);
        return fn(this);
      },
    };

    const db = requestScopedClient(() => client);
    db.$transaction((tx) => tx);

    expect(seen).toEqual([client]);
  });

  it('gives the transaction body a tx derived from the real client, not the proxy', () => {
    /* A faithful miniature of what broke: $transaction derives tx from `this`.
       If `this` is the proxy, tx.run reaches back out to the base client and
       the transaction is lost. */
    const calls: string[] = [];
    const client = {
      run(where: string) {
        calls.push(`base.run(${where})`);
      },
      $transaction(fn: (tx: { run: (w: string) => void }) => void) {
        const tx = {
          run: (where: string) => calls.push(`tx.run(${where})`),
        };
        // Prisma builds tx from `this`; emulate that dependency on `this`.
        if (this !== client) throw new Error('P2028: transaction ran on the wrong client');
        fn(tx);
      },
    };

    const db = requestScopedClient(() => client);
    db.$transaction((tx) => tx.run('inside'));

    expect(calls).toEqual(['tx.run(inside)']);
  });

  it('hands back model delegates so a plain read still reads', () => {
    const findMany = vi.fn(() => ['a', 'b']);
    const client = { project: { findMany } };

    const db = requestScopedClient(() => client);
    const rows = db.project.findMany();

    expect(rows).toEqual(['a', 'b']);
    expect(findMany).toHaveBeenCalledOnce();
  });

  it('resolves the client lazily, once per property read', () => {
    const client = { value: 1 };
    const getClient = vi.fn(() => client);

    const db = requestScopedClient(getClient);
    expect(getClient).not.toHaveBeenCalled();

    void db.value;
    void db.value;
    expect(getClient).toHaveBeenCalledTimes(2);
  });
})
