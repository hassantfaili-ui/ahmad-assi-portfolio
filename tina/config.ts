import { defineConfig } from 'tinacms';
import { ProjectsCollection } from './collections/projects';
import { ResumeCollection } from './collections/resume';

/**
 * The editor. Open /admin.
 *
 * Keystatic was here before and was replaced for one reason: it edits a form,
 * not a page. Ahmad would type into a sidebar on a screen that looked nothing
 * like the site, save, wait for a rebuild, and then go and look. Tina renders
 * the real project page in the panel beside the fields, so clicking a heading on
 * the page opens the field that writes it and typing changes the page as he
 * types. That is the whole point of the change, and everything below exists to
 * serve it.
 *
 * What did not change: content is still ordinary files in this repository, and
 * every save is still a normal reviewable commit rather than a row in somebody's
 * database. src/content/projects/*.md and src/data/resume.json were not touched
 * when the editor was swapped, and the portfolio PDF still builds from them.
 */

/* Which branch a save commits to. Cloudflare publishes the branch it is building
   under two different names depending on whether the project is a Pages project
   or a Workers Build, and neither is set locally, so main is the fallback. */
const branch =
  process.env.CF_PAGES_BRANCH ||
  process.env.WORKERS_CI_BRANCH ||
  process.env.GITHUB_BRANCH ||
  process.env.HEAD ||
  'main';

export default defineConfig({
  branch,

  /* From app.tina.io. The client id is public by design: it names the project
     the admin authenticates against and is baked into the admin bundle either
     way. The token is not, and is a build-time variable only. */
  clientId: process.env.PUBLIC_TINA_CLIENT_ID,
  token: process.env.TINA_TOKEN,

  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },

  /**
   * Images are committed to this repository, exactly as they were before.
   *
   * Uploads land in public/media and the stored value is /media/<name>, which is
   * the string every content file already holds and every template already
   * renders, so the switch of editor cost no content migration at all. It also
   * keeps scripts/build-portfolio.sh working: the PDF reads public/media by
   * basename, and pointing images at a bucket would leave it with nothing to
   * read.
   *
   * Films are the exception and go to R2 instead. See tina/fields/film.tsx: they
   * are far past both GitHub's per-save limit and Cloudflare's per-asset one, so
   * they cannot be committed here whatever the editor is.
   */
  media: {
    tina: {
      mediaRoot: 'media',
      publicFolder: 'public',
    },
  },

  schema: {
    collections: [ProjectsCollection, ResumeCollection],
  },
});
