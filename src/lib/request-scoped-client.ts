/**
 * A proxy over a lazily built, request scoped client.
 *
 * This exists so the wiring in db.ts can be tested without a database. The one
 * thing that matters here, and the one thing that once went wrong, is `this`.
 *
 * `db.$transaction(async (tx) => ...)` runs its body with `this` set to the
 * client, and Prisma builds the transaction bound `tx` from that `this`. If the
 * proxy forwards with itself as the receiver, `this` inside the transaction is
 * the proxy, every lookup is routed back out to the base client, and the
 * statements run outside the transaction that BEGIN opened. The transaction id
 * then comes back as P2028, "Transaction not found", and every whole project
 * save fails while every read carries on, because a read does not care what
 * `this` is.
 *
 * So each property is resolved against the real client, and functions are bound
 * to it. `this` is the client wherever a method needs it, and a plain value,
 * such as a model delegate, is handed back untouched.
 */
export function requestScopedClient<T extends object>(getClient: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const client = getClient();
      const value = Reflect.get(client, property, client);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
  });
}
