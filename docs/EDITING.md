# Editing the site

Everything on this site is content in this repository, and everything in it can
be changed from a browser at **`/admin`**, for example
`https://ahmadassi.ca/admin`. That is the address to give Ahmad and the one to
bookmark.

The editor is [TinaCMS](https://tina.io). It writes those same files back, so a
change is still an ordinary commit that can be read and undone, and Cloudflare
rebuilds the site within a minute or two of a save. There is no database.

Two places hold everything, whichever way they are edited:

| What | Where |
| --- | --- |
| Projects | `src/content/projects/`, one markdown file each |
| Resume and contact details | `src/data/resume.json` |
| Photographs and drawings | `public/media/<project-slug>/` |
| The films | An R2 bucket, not this repository. See below. |

---

## Editing on the page

The point of this editor, and the reason it is not the one that was here before.

- The project page renders in a panel beside the form, as a visitor sees it.
- **Click a heading, a photograph or a caption on that page and its field
  opens.** No hunting through a sidebar of thirty fields for the one that drew
  the sentence you are looking at.
- **Typing changes the page as you type.** Not on save, not after a rebuild.
  Reordering a group of photographs reflows the page while you drag.

Two honest limits, so nobody goes looking for something that is not there. You
type into the field, not into the page itself: nothing on the page is directly
typeable, in Tina or in any comparable tool that keeps content in Git. And the
live update is a preview. Nothing is published until Save, which makes the
commit.

### Editing the files directly

Still entirely supported, and still the right way to make bulk changes. The
frontmatter keys are unchanged and are listed under "What can be changed" below.

```bash
npm run dev
```

That serves the site at `http://localhost:4321` and the editor at
`http://localhost:4321/admin`, both against the files in this checkout, with no
login and no network. It reloads as files are saved. `npm run check` type checks
the project, which is the same check the build runs.

`npm run dev` runs Tina's CLI, which compiles the schema in `tina/` and starts a
local content API before handing off to `astro dev`. `npm run dev:site` is there
for the times you want the site without the editor.

---

## Turning the login on

This is the one part that cannot be done from inside the repository, because it
needs accounts. It takes about ten minutes, once.

1. Go to [app.tina.io](https://app.tina.io) and sign in with GitHub.
2. Create a project and point it at the GitHub repository this site is in.
   Install the TinaCloud GitHub App when it asks, for that one repository.
3. Copy the **Client ID** it gives you, and create a **read/write token**.
4. In Cloudflare, set two variables on the project and redeploy:

   | Variable | Value |
   | --- | --- |
   | `PUBLIC_TINA_CLIENT_ID` | the client id from step 3 |
   | `TINA_TOKEN` | the token from step 3 |

   Both are needed. With either one missing the build falls back to a
   local-only client: the site is complete and every page works, and only saving
   from the deployed editor does not.

5. Invite Ahmad to the project by email.
6. Check it took:

   ```bash
   npm run editor:check -- https://ahmadassi.ca
   ```

   That reports what is configured and whether the deployed site is actually
   serving the editor and its live preview. It exists because the failures here
   are otherwise silent: with the variables missing the site still builds and
   every page still works, and only `/admin` is quietly unable to save.

After that, `/admin` shows a login screen. Ahmad signs in with an email address
and a password. **He never needs a GitHub account**: TinaCloud holds the
connection to the repository and commits on his behalf. Only the person doing
step 1 needs GitHub, once.

TinaCloud's free tier covers two users per project, which is what this needs.

---

## What can be changed

**Projects.** Every project is one entry under Projects in the editor, and one
markdown file under `src/content/projects/` on disk. The fields are defined in
`tina/collections/projects.ts`; the editor refuses to save an entry that breaks
them, and `assertUsable` in `src/lib/data.ts` fails the build for anything that
gets in another way, naming the file.

- *Photographs.* `leadImage` is the cover, used on the projects page and at the
  top of the project's own page. `imageGroups` holds the rest, in the order they
  are listed, each group laid out as a `pair`, a `full` bleed or a `triptych`.
  `drawings` are shown in the drawing viewer. In the editor these are drag to
  reorder.
- *Adding an image.* Choose a file in the editor, or drop one in, and it is
  committed to `public/media/`. By hand, put the file in
  `public/media/<project-slug>/` and reference it as
  `/media/<project-slug>/<file>.jpg`. Exports straight out of a renderer are
  fine: the build resizes anything oversized on its way into `dist`, so a 39MB
  JPEG can never reach a visitor.
- *Descriptions and specs.* `title`, `year`, `location`, `buildingType`, `area`,
  `status`, `role`, `contribution`, `summary`, and the body text below the
  frontmatter.
- *Where it sits.* `tier` chooses `lead` (the top three), `set` (the strip) or
  `index` (the compact list). `order` is a number, low first, that decides the
  sequence within each tier.
- *The walkthrough film.* See below.
- *Adding a project.* The "+" on the Projects list, or copy an existing file and
  change the frontmatter. *Removing one.* The bin icon inside the entry, or
  delete the file.

**Resume and contact.** `src/data/resume.json`, which is the Resume entry in the
editor, holds the experience, education, skills and languages on the resume page,
and also the email address, phone number, location and availability shown on the
contact page and in the footer of every page.

**Alt text is required on every image.** The editor will not save without it and
the build fails rather than publishing an image that has none. It is the sentence
a screen reader reads, and search engines use it too.

---

## Two things worth knowing

**Only three projects can be in the top three.** Marking a fourth does not break
anything and does not lose it: it falls into the set instead, in its usual place
by order. Move one of the existing three down first to swap.

**The portfolio PDF does not regenerate itself.** It is built from the same
projects, in the same order, by `npm run portfolio`, which needs a computer with
Node, Chrome and ffmpeg. Editing a project updates the website within a minute
and leaves the PDF as it was until someone rebuilds it.

---

## Hosting

Cloudflare, connected to this repository.

| setting | value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| `NODE_VERSION` | `22` |

`NODE_VERSION` is not optional. Astro 7 requires 22.12 or newer and the default
build image is older, which fails before a single page is emitted. It is also
declared in `package.json` engines.

**Nothing served may exceed 25 MiB.** That is a hard platform limit. If a large
file is added, the build fails with "Asset too large" and names it.
`public/_headers` carries the caching rules: media for an hour then revalidate,
hashed assets pinned hard, HTML always revalidating, and the editor never cached.

**`wrangler.jsonc` must keep `nodejs_compat`.** The editor's live preview route
keeps per-request state in `AsyncLocalStorage`, which workerd hides behind that
flag. Without it the site deploys, every page works, and only the live preview
returns 500, which is the most confusing state this project has. `npm run
editor:check` looks for it.

### The films

The three films are too big for that limit, so they are not served from here.
They live in an R2 bucket and `PUBLIC_MEDIA_ORIGIN` points at it:

```
PUBLIC_MEDIA_ORIGIN = https://media.ahmadassi.ca
```

Committed as a default in `src/lib/url.ts`, so nothing has to be set for it to
work. The build rewrites the film URLs to that origin and deletes the files out
of `dist`, so the largest published file is the portfolio PDF at 9.3MB. The
copies in `public/media` are the masters and match the bucket byte for byte;
they are what local development serves.

The bucket keys must stay under a `media/` prefix, because that is the path the
site requests: `media/hero-1440.mp4`, `media/hero-720.mp4`,
`media/lincoln-beach-walkthrough.mp4`.

The bucket is served from `media.ahmadassi.ca`, a custom domain rather than the
rate limited `pub-….r2.dev` address Cloudflare says not to use in production.

#### Uploading a film from the editor

Optional, and off until it is configured. Set up, the film field in a project
gets an **Upload a film** button and Ahmad can replace a walkthrough himself.
Left alone, the field is a path to type and films stay a developer job, which
is how they worked before.

The browser sends the file straight to R2 rather than through the site, because
a Worker request body is capped well below the size of a 4K master. The site's
only part is signing a one hour upload URL.

Five variables, all set on the Cloudflare Worker as **secrets**, not as plain
variables:

| Variable | What it is |
| --- | --- |
| `R2_ACCOUNT_ID` | the Cloudflare account id the bucket is in |
| `R2_BUCKET` | the bucket name, for example `ahmad-assi-media` |
| `R2_ACCESS_KEY_ID` | from an R2 API token with object read and write |
| `R2_SECRET_ACCESS_KEY` | the other half of that token |
| `FILM_UPLOAD_KEY` | a passphrase you choose |

Set all five or none. Half set is reported as an error by `npm run
editor:check` rather than half working.

The bucket also needs **a CORS rule** allowing `PUT` from the site's origin,
since the browser uploads to R2 directly. Allowed origins `https://ahmadassi.ca`,
allowed methods `PUT`, allowed headers `content-type`. Nothing else: the upload
lands under `media/` on its own, which is where the site looks.

`FILM_UPLOAD_KEY` is asked for the first time Ahmad uploads a film and then
remembered in his browser. Anyone who has it can write a film into the bucket,
so treat it like a password. It exists because the editor signs in against
TinaCloud rather than against this site, so the site has no session of its own
to check.

To test uploads locally, put the same five in a `.dev.vars` file at the root of
the repository. It is gitignored. The empty `vars` block in `wrangler.jsonc` is
what makes wrangler look for that file at all, so do not delete it.

There is no contact form. Cloudflare has nothing that accepts a submission
without a third party service, so the contact page is the email link, which was
always the primary route.
