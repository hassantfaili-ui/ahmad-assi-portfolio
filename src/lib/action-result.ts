/**
 * What a server action gives back, and how to call one without losing work.
 *
 * The type lives here rather than in src/lib/mutations.ts because that module
 * carries 'use server', and a client component importing a type out of it is a
 * needless dependency on a module full of endpoints.
 */

export type FieldErrorMap = Record<string, string>;

export interface SaveResult<T = void> {
  ok: boolean;
  errors?: FieldErrorMap;
  warning?: string;
  message?: string;
  data?: T;
}

/**
 * Call a server action and never let it throw.
 *
 * Every editing screen was written against the failures that arrive as
 * `{ ok: false }` and none of the ones that arrive as a rejection: a dropped
 * connection, a Worker timeout, a Prisma error on a row deleted in another tab.
 * Those escape the transition, and with no error boundary above them they
 * replace the whole screen with a blank client exception page. Everything Ahmad
 * had typed and not yet saved goes with it.
 *
 * So a rejection becomes an ordinary refusal. The form keeps its values, the
 * unsaved flag stays set, and the message says the thing that actually matters,
 * which is that the work is still on the page.
 */
export async function runAction<T>(
  call: () => Promise<SaveResult<T>>,
): Promise<SaveResult<T>> {
  try {
    return await call();
  } catch (error) {
    console.error('A save failed before it could answer', error);
    return {
      ok: false,
      message:
        'Nothing was saved, and nothing was lost: your work is still on this page. ' +
        'Check your connection and try again.',
    };
  }
}
