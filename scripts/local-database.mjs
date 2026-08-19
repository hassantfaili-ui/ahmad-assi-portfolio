/**
 * Whether a connection string points at a database on this machine.
 *
 * Two guards depend on this question and they answer it in opposite
 * directions, which is why it is written once here rather than twice in two
 * regexes that could drift apart.
 *
 * The browser suite refuses anything that is NOT local: it creates, edits and
 * deletes projects, and its teardown deletes what is left behind.
 *
 * The deploy build refuses anything that IS local: it prerenders every page
 * from this database, so building from a laptop and deploying it replaces the
 * live site with a copy of the laptop and silently undoes every edit made in
 * the admin since.
 */
export function isLocalDatabase(url) {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url ?? '');
}

/** The same string with the password replaced, safe to print in an error. */
export function withoutPassword(url) {
  return (url ?? '').replace(/:[^:@/]+@/, ':***@');
}
