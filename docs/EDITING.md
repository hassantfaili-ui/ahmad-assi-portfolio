# Editing the site

Everything on this site is content in this repository. There is no login and no
database: a change is an ordinary commit that can be read and undone, and
Cloudflare rebuilds the site within a minute or two of a push.

Two places hold everything:

| What | Where |
| --- | --- |
| Projects | `src/content/projects/`, one markdown file each |
| Resume and contact details | `src/data/resume.json` |
| Photographs and drawings | `public/media/<project-slug>/` |

To see a change before pushing it:

```bash
npm run dev
```

That serves the site at `http://localhost:4321` and reloads as files are saved.
`npm run check` type checks the content against the schema, which is the same
check the build runs.

---

## What can be changed

**Projects.** Every project is one markdown file under `src/content/projects/`.
The fields are defined and validated in `src/content.config.ts`, so a typo in a
field name or a missing required field fails the build with the file named
rather than shipping a broken page.

- *Photographs.* `leadImage` is the cover, used on the projects page and at the
  top of the project's own page. `imageGroups` holds the rest, in the order they
  are listed, each group laid out as a `pair`, a `full` bleed or a `triptych`.
  `drawings` are shown in the drawing viewer.
- *Adding an image.* Put the file in `public/media/<project-slug>/` and reference
  it as `/media/<project-slug>/<file>.jpg`. Exports straight out of a renderer
  are fine: the build resizes anything oversized on its way into `dist`, so a
  39MB JPEG can never reach a visitor.
- *Descriptions and specs.* `title`, `year`, `location`, `buildingType`, `area`,
  `status`, `role`, `contribution`, `summary`, and the body text below the
  frontmatter.
- *Where it sits.* `tier` chooses `lead` (the top three), `set` (the strip) or
  `index` (the compact list). `order` is a number, low first, that decides the
  sequence within each tier.
- *Adding a project.* Copy an existing file and change the frontmatter.
  *Removing one.* Delete the file.

**Resume and contact.** `src/data/resume.json` holds the experience, education,
skills and languages on the resume page, and also the email address, phone
number, location and availability shown on the contact page.

**Alt text is required on every image.** The schema enforces it, so the build
fails rather than publishing an image without one. It is the sentence a screen
reader reads, and search engines use it too.

---

## Two things worth knowing

**Only three projects can be in the top three.** Marking a fourth does not break
anything and does not lose it: it falls into the set instead, in its usual place
by order. Move one of the existing three down first to swap.

**The portfolio PDF does not regenerate itself.** It is built from the same
projects, in the same order, by `npm run portfolio`, which needs a computer with
Node, Chrome and ffmpeg. Editing a project updates the website on the next push
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
hashed assets pinned hard, HTML always revalidating.

### The films

The three films are too big for that limit, so they are not served from here.
They live in an R2 bucket and `PUBLIC_MEDIA_ORIGIN` points at it:

```
PUBLIC_MEDIA_ORIGIN = https://media.ahmadassi.ca
```

With it set, the build rewrites the film URLs to that origin and deletes the
files out of `dist`, so the largest published file is the portfolio PDF at
9.3MB. The copies in `public/media` are the masters and match the bucket byte
for byte; they are what local development serves. Unset the variable and the
build warns that the films will be published and that a capped host will
reject them.

The bucket keys must stay under a `media/` prefix, because that is the path the
site requests: `media/hero-1440.mp4`, `media/hero-720.mp4`,
`media/lincoln-beach-walkthrough.mp4`.

The bucket is served from `media.ahmadassi.ca`, a custom domain rather than the
rate limited `pub-….r2.dev` address Cloudflare says not to use in production.

There is no contact form. Cloudflare has nothing that accepts a submission
without a third party service, so the contact page is the email link, which was
always the primary route.
