import { describe, expect, it } from 'vitest';

import { isLocalDatabase, withoutPassword } from '../../scripts/local-database.mjs';

/**
 * The deploy build prerenders every page from DATABASE_URL, so the HTML it
 * ships is a photograph of whichever database it was pointed at. Built from a
 * laptop and deployed, it replaces the live site with a copy of that laptop and
 * undoes every edit made in the admin since the copy was taken.
 *
 * That shipped once. The reachability check passed, because a local database is
 * reachable, and the row counts it printed matched, because the copy had the
 * same number of rows in it. Nothing else looked at which database it was.
 */
describe('which databases count as local', () => {
  it.each([
    'postgresql://hassan@localhost:5432/ahmadassi',
    'postgresql://user:pw@127.0.0.1:5432/ahmadassi',
    'postgresql://user:pw@[::1]:5432/ahmadassi',
    'postgresql://hassan@localhost/ahmadassi',
  ])('%s is local, so the deploy build must refuse it', (url) => {
    expect(isLocalDatabase(url)).toBe(true);
  });

  it.each([
    'postgresql://neondb_owner:pw@ep-morning-lake.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require',
    'postgresql://user:pw@db.example.com:5432/app',
    'postgres://user:pw@10.0.0.4:5432/app',
  ])('%s is not local, so the deploy build may use it', (url) => {
    expect(isLocalDatabase(url)).toBe(false);
  });

  it('is not fooled by a hostname that merely contains the word localhost', () => {
    expect(isLocalDatabase('postgresql://user:pw@localhost.evil.com:5432/app')).toBe(false);
  });

  it('treats a missing url as not local, so the caller reports the real problem', () => {
    /* An absent DATABASE_URL is its own error with its own message. Calling it
       local here would send someone off correcting a connection string that is
       not there at all. */
    expect(isLocalDatabase(undefined)).toBe(false);
    expect(isLocalDatabase('')).toBe(false);
  });

  it('takes the password out of anything it is asked to print', () => {
    expect(withoutPassword('postgresql://neondb_owner:npg_secret@ep-x.neon.tech/neondb')).toBe(
      'postgresql://neondb_owner:***@ep-x.neon.tech/neondb',
    );
    expect(withoutPassword('postgresql://neondb_owner:npg_secret@ep-x.neon.tech/neondb')).not.toContain(
      'npg_secret',
    );
  });
})
