# Editing the site

Everything on this site is editable from a browser, with a login and no code.
The editor is [TinaCMS](https://tina.io). It writes ordinary files back to the
repository, so every change is a normal commit that can be read and undone, and
Cloudflare rebuilds the site within a minute or two of a save.

The editor lives at **`/admin`**, for example `https://ahmadassi.ca/admin`.
That is the address to give Ahmad and the one to bookmark.

---

## What changed, and why

This used to be Keystatic. Keystatic worked. What it could not do was show Ahmad
the thing he was changing: he typed into a form on a screen that looked nothing
like the website, saved, waited for a rebuild, and then went and looked. Every
adjustment to a caption or a running order cost a round trip.

Tina puts the real page next to the fields:

- The project page renders in a panel beside the form, as a visitor sees it.
- **Click a heading, a photograph or a caption on that page and its field
  opens.** No hunting through a sidebar of thirty fields for the one that drew
  the sentence he is looking at.
- **Typing changes the page as he types.** Not on save, not after a rebuild.
  Reordering a group of photographs reflows the page while he drags.

Two honest limits, so nobody goes looking for something that is not there.
He types into the field, not into the page itself: nothing on the page is
directly typeable, in Tina or in any comparable tool that keeps content in Git.
And the live update is a preview. Nothing is published until Save, which makes
the commit.

Nothing about the content moved. The projects are still one markdown file each
in `src/content/projects`, the resume is still `src/data/resume.json`, and not
one of them was rewritten for the change of editor.

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

### Editing without any login at all

On your own machine:

```bash
npm run dev
```

Then open `http://localhost:4321/admin`. This writes straight to the files on
disk, with no login and no network, which is the quickest way to make a lot of
changes at once. Commit them afterwards.

---

## What can be changed

**Projects.** Every project is one entry under Projects.

- *Photographs.* Add, remove and drag to reorder inside each group. Uploading is
  choosing a file or dragging one in.
- *The cover photo.* The "Lead image" at the top of the entry. It is what appears
  on the projects page and at the top of the project's own page.
- *Descriptions and specs.* Title, year, location, building type, area, status,
  role, what you personally did, the one line summary, and the longer text at the
  bottom of the entry.
- *Where it sits.* "Where it sits on the projects page" chooses the top three,
  the set, or the archive. "Order" is a number, low first, that decides the
  sequence within all of them.
- *The walkthrough film.* See below.
- *Adding a project.* The "+" on the Projects list. *Removing one.* The bin icon
  inside the entry.

**Resume and contact.** Both live under Resume. That single entry holds the
experience, education, skills and languages on the resume page, and also the
email address, phone number, location and availability shown on the contact page
and in the footer of every page.

**Alt text is required on every image.** It is the sentence a screen reader
reads, and search engines use it too. The build refuses to publish a project
with a photograph that has none, rather than shipping a hole in the page.

---

## Two things worth knowing

**Only three projects can be in the top three.** Marking a fourth does not break
anything and does not lose it: it falls into the set instead, in its usual place
by order. Move one of the existing three down first if you want to swap.

**The portfolio PDF does not regenerate itself.** It is built from the same
projects, in the same order, by `npm run portfolio`, which needs a computer with
Node, Chrome and ffmpeg. Editing a project in the browser updates the website
immediately and leaves the PDF as it was until someone rebuilds it.

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
`public/_headers` carries the caching rules.

**`wrangler.jsonc` must keep `nodejs_compat`.** The editor's live preview route
keeps per-request state in `AsyncLocalStorage`, which workerd hides behind that
flag. Without it the site deploys, every page works, and only the live preview
returns 500, which is the most confusing state this project has. `npm run
editor:check` looks for it.

### The films

The three films are far too big for that limit, so they are not served from
here. They live in an R2 bucket and `PUBLIC_MEDIA_ORIGIN` points at it:

```
PUBLIC_MEDIA_ORIGIN = https://media.ahmadassi.ca
```

Committed as a default in `src/lib/url.ts`, so nothing has to be set for it to
work. With it, the build rewrites the film URLs to that origin and deletes the
files out of `dist`, so the largest published file is the portfolio PDF at
9.3MB. The copies in `public/media` are the masters and match the bucket byte
for byte; they are what local development serves.

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

Two more things the bucket itself needs:

- **A CORS rule** allowing `PUT` from the site's origin, since the browser
  uploads to R2 directly. Allowed origins `https://ahmadassi.ca`, allowed
  methods `PUT`, allowed headers `content-type`.
- Nothing else. The upload lands under `media/` on its own, which is where the
  site looks.

`FILM_UPLOAD_KEY` is asked for the first time Ahmad uploads a film and then
remembered in his browser. Anyone who has it can write a film into the bucket,
so treat it like a password. It exists because the editor signs in against
TinaCloud rather than against this site, so the site has no session of its own
to check.

To test uploads locally, put the same five in a `.dev.vars` file at the root of
the repository. It is gitignored. The empty `vars` block in `wrangler.jsonc` is
what makes wrangler look for that file at all, so do not delete it.

There is no contact form. It was Netlify Forms and there is no equivalent here,
so the contact page is the email link, which was always the primary route.
