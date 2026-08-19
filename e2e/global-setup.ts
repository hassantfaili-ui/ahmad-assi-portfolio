import 'dotenv/config';

/* A plain .mjs helper, shared with scripts/cf-build.mjs so the two guards
   cannot disagree about what counts as a local database. */
import { isLocalDatabase, withoutPassword } from '../scripts/local-database.mjs';

/**
 * Refuse to run the browser suite against a database that is not disposable.
 *
 * The admin tests create projects, edit them and delete them, and the teardown
 * runs deleteMany over anything left behind. That is fine against a scratch
 * database and catastrophic against the live one, and the difference is a
 * single line in a gitignored .env that nobody looks at before typing
 * `npm run e2e`.
 *
 * It became a live hazard the moment DATABASE_URL was pointed at Neon so the
 * production build could run. The suite had been safe for hours purely because
 * the variable happened to hold a localhost address.
 *
 * So the check is on the value, not on anyone's memory. Set
 * E2E_ALLOW_REMOTE_DATABASE=true to override deliberately, which is the sort of
 * thing you only type when you mean it.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_URL ?? '';

  if (!url) {
    throw new Error('DATABASE_URL is not set. The browser suite needs a database.');
  }

  const allowed = process.env.E2E_ALLOW_REMOTE_DATABASE === 'true';

  if (!isLocalDatabase(url) && !allowed) {
    const safe = withoutPassword(url);
    throw new Error(
      `\nThe browser suite refuses to run against ${safe}\n\n` +
        'These tests create, edit and delete projects, and the teardown deletes\n' +
        'anything left behind. Against the live database that is destructive.\n\n' +
        'Point DATABASE_URL at a local database:\n\n' +
        `  DATABASE_URL="postgresql://$(process.env.USER ?? 'you')@localhost:5432/ahmadassi" npm run e2e\n\n` +
        'Or, if you genuinely mean to run against this one, set\n' +
        'E2E_ALLOW_REMOTE_DATABASE=true\n',
    );
  }
}
