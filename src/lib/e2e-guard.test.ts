import { describe, expect, it, afterEach } from 'vitest';

import globalSetup from '../../e2e/global-setup';

const original = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = original;
  delete process.env.E2E_ALLOW_REMOTE_DATABASE;
});

/**
 * The browser suite creates, edits and deletes projects, and its teardown
 * deletes whatever is left behind. Which database it points at is one line in a
 * gitignored .env, so the safety of a destructive suite otherwise rests on
 * nobody having edited that line for an unrelated reason. This is that check.
 */
describe('the browser suite refuses a database it should not delete from', () => {
  it.each([
    'postgresql://user:pw@ep-morning-lake.us-east-2.aws.neon.tech/neondb?sslmode=require',
    'postgresql://user:pw@db.example.com:5432/app',
    'postgres://user:pw@10.0.0.4:5432/app',
  ])('refuses %s', (url) => {
    process.env.DATABASE_URL = url;
    expect(() => globalSetup()).toThrow(/refuses to run against/);
  });

  it.each([
    'postgresql://hassan@localhost:5432/ahmadassi',
    'postgresql://hassan:pw@127.0.0.1:5432/ahmadassi',
  ])('allows %s', (url) => {
    process.env.DATABASE_URL = url;
    expect(() => globalSetup()).not.toThrow();
  });

  it('keeps the password out of the message it prints', () => {
    process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_secret@ep-x.neon.tech/neondb';
    try {
      globalSetup();
      throw new Error('the guard should have refused');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/refuses to run against/);
      expect(message).not.toContain('npg_secret');
    }
  });

  it('lets someone override it deliberately', () => {
    process.env.DATABASE_URL = 'postgresql://user:pw@ep-x.neon.tech/neondb';
    process.env.E2E_ALLOW_REMOTE_DATABASE = 'true';
    expect(() => globalSetup()).not.toThrow();
  });

  it('refuses an empty database url rather than passing it to the suite', () => {
    process.env.DATABASE_URL = '';
    expect(() => globalSetup()).toThrow(/DATABASE_URL is not set/);
  });
})
