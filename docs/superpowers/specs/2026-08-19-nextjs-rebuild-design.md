# ahmadassi.ca, rebuilt as a Next.js application Ahmad can edit himself

**Date:** 2026-08-19
**Status:** Approved, ready for implementation planning

## Why

The site is finished and good, but every change to it is a change only a developer
can make. Ahmad has to send images to someone else and wait. Keystatic was an
attempt at fixing that and was removed on 2026-08-18 because it brought a React
runtime and a custom R2 upload field along with it and still did not give him
drag and drop.

This rebuild gives Ahmad an administration area where he uploads by dragging
files onto a page, reorders projects and images by dragging them, edits every
field of every project, and deletes what he no longer wants. The public site
looks the same to a visitor.

## What is being kept

Three things carry across unchanged in substance, because they are already right:

1. **The visual design.** Black and white only, Big Shoulders Display for
   display lettering and Archivo for everything else, both self hosted. The
   Foster + Partners card pattern. Light and dark. The three tier project
   layout.
2. **The content model.** The Zod schema in `src/content.config.ts` is a good
   model of what a project is. It becomes a database schema rather than being
   reinvented.
3. **The three lead rule** in `src/lib/tiers.ts`, including the part that exists
   because of a real bug: a fourth project marked `lead` falls through into the
   strip rather than disappearing from the site.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16.3.1, App Router, React 19.2, TypeScript |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` 1.20.2 |
| Database | Neon Postgres, reached through Cloudflare Hyperdrive |
| ORM | Prisma 7.9.1 with `@prisma/adapter-pg` |
| Object storage | Cloudflare R2, S3 API, presigned PUT and GET |
| Authentication | Cloudflare Access (Zero Trust) at the edge, `jose` to verify the assertion |
| Styling | Tailwind CSS 4.3.3, Radix primitives, shadcn style components |
| Video encoding | `mediabunny` 1.55.1, WebCodecs, in the browser |
| Page cache | Cloudflare KV, through the OpenNext incremental cache |
| Tests | Vitest for logic, Playwright for the paths that matter |

Compatibility is verified rather than assumed. `@opennextjs/cloudflare` 1.20.2
declares a peer range of `next >=15.5.21 <16 || >=16.2.11`, which 16.3.1
satisfies, and `wrangler ^4.86.0`, which 4.124.0 satisfies.

Nothing leaves the Cloudflare account except the database. The domain, the site,
the bucket, the cache and the login wall are all on one account, and R2 charges
no egress.

## Architecture

One application serves both the public site and `/admin`.

Three stores, each with one job:

- **Postgres** holds all content. Structured, queryable, transactional.
- **R2** holds every binary: images, video encodes, poster frames, PDFs.
- **KV** holds the rendered page cache.

**Rows store the R2 object key, never a URL.** URLs are composed at render time
from a single `MEDIA_ORIGIN` environment variable. This is the same discipline
`PUBLIC_MEDIA_ORIGIN` enforces in the Astro site today, and it is what makes
moving the bucket or its custom domain a one variable change.

### Rendering

Public pages are statically cached rather than server rendered on every visit.
Writes from the administration area call `revalidateTag` for the affected
project and for any listing that includes it. Ahmad sees his change within
seconds, and a visitor never causes a database query.

### Images

The `next/image` built in optimizer does not run on Cloudflare Workers. A custom
loader targets Cloudflare Image Transformations on the `media.ahmadassi.ca`
zone:

```
https://media.ahmadassi.ca/cdn-cgi/image/width=1600,format=auto,quality=82/<key>
```

This gives responsive AVIF and WebP derivatives from a single upload, so Ahmad
can drop a 39MB render straight out of D5 and a phone receives a file sized for
it. The free allowance is 5,000 unique transformations a month, which a
portfolio of roughly 300 images sits well inside.

This closes the one accepted trade off recorded in the current README, that real
photographs are served as plain `<img>` with no responsive derivatives.

## Data model

### Media and projects

```
Media
  id, key (unique, the R2 object key), contentType, bytes,
  width, height, durationSeconds, originalName, createdAt

Project
  id, slug (unique), title, sheet, category, year, location,
  buildingType, area, status, role, contribution, summary,
  body (markdown), credit, tier, order, published,
  leadImageId, filmId, createdAt, updatedAt

ImageGroup
  id, projectId, layout (pair | full | triptych), caption, order

ProjectImage
  id, groupId, mediaId, alt, order

Drawing
  id, projectId, mediaId, alt, drawingType, order

Film
  id, posterMediaId, caption
FilmSource
  id, filmId, mediaId, height (1440 | 720), bytes
```

`ProjectImage` carries the alt text and the ordering rather than `Media` doing
so, because the same file may legitimately appear in two places with two
different descriptions, and because ordering belongs to the arrangement rather
than to the file.

`Film` is a separate model with many `FilmSource` rows because a film is now
several encodes of one thing. The site hero film is a `Film` with no project.

### Resume

```
Profile            one row: name, discipline, credential, registration,
                   location, yearsExperience, availability, issued, welcome,
                   positioning, longBio (string[]), portraitMediaId,
                   portraitAlt, cvMediaId, portfolioMediaId, email, phone,
                   references
Fact               label, value, order
SocialLink         label, url, order
ExperienceEntry    role, firm, location, period, contributions (string[]), order
EducationEntry     credential, institution, year, note, order
SkillGroup         label, order
Skill              skillGroupId, name, order
Language           text, order
ResumeEntry        section (volunteering | awards | publications | exhibitions),
                   title, detail, year, order
```

`ResumeEntry` collapses four lists that share the same shape into one model with
a discriminator, rather than four near identical tables. `ExperienceEntry` and
`EducationEntry` stay separate because their shapes genuinely differ.

### Rules that move from build time to save time

The current schema fails the build when a rule is broken. That is a good rule
enforced in a bad place, because the person who broke it is not the person
reading the build log. Each becomes a save time validation shown on the field:

| Rule | Where it lives now | Where it lives after |
| --- | --- | --- |
| Alt text required on every image | Zod, build fails | Field validation, save rejected |
| `credit` required on every project | Zod, build fails | Field validation, save rejected |
| Sheet numbers match `A-\d{3}` | Zod, build fails | Field validation, save rejected |
| A film needs a source or a YouTube id | Zod refine, build fails | Field validation, save rejected |
| At most three leads, the rest fall through | `tiers.ts`, silently | `tiers.ts`, plus a visible notice in the administration area |

## Upload pipeline

The centre of the whole rebuild. Ahmad drops files onto a zone and does nothing
else.

1. The client validates type and size and rejects immediately with a readable
   reason.
2. **For video only:** `mediabunny` decodes and re-encodes in the browser to a
   1440p and a 720p MP4 and extracts a poster frame from the timeline.
3. The client asks `/api/uploads/presign` for presigned PUT URLs.
4. **The browser uploads straight to R2.** The bytes never pass through the
   Worker, so there is no request size ceiling. This is what makes the 25 MiB
   published asset limit irrelevant rather than worked around.
5. The server issues a `HeadObject` to confirm the object landed at the expected
   size, then writes the `Media` row. An upload that failed halfway never
   produces a row pointing at nothing.
6. The thumbnail appears, Ahmad types alt text, and saves.

Progress is shown per file, uploads run in parallel, and a failed upload can be
retried without starting the set again.

### Browser support for encoding

WebCodecs video encoding works in Chrome, Edge and Safari 16.4 or newer. Firefox
cannot encode. The administration area detects the capability and, where it is
absent, refuses the video and says which browser to use. It never silently
accepts an unencoded 4K file, because that failure would be invisible until a
visitor on a phone paid for it.

### Deletion

Deletion is reference aware.

- Removing an image from a project detaches it and leaves the file in the
  library.
- Deleting from the library checks for references first and refuses while any
  exist, naming what still uses it.
- Only once nothing refers to it are the R2 object and the row both removed.

## The administration area

Cloudflare Access guards `/admin` at the edge, so an unauthenticated request is
turned away before it reaches the application. `jose` verifies the
`Cf-Access-Jwt-Assertion` header inside the application as well, both to
establish who is acting and so that a misconfigured Access policy fails closed
rather than open.

| Route | What Ahmad does there |
| --- | --- |
| `/admin` | Every project. Drag to reorder, change tier, publish or unpublish, delete |
| `/admin/projects/[id]` | Every field, and the media panel: drop files, group them as pair, full or triptych, drag to reorder groups and images |
| `/admin/media` | The whole library, what uses each file, safe delete |
| `/admin/resume` | Profile, experience, education, skills, languages, contact details |
| `/admin/settings` | The hero film and site level content |

Reordering uses the native HTML drag and drop API with full keyboard
equivalents. The existing site made a deliberate point of never capturing the
pointer to fake dragging, because doing so once broke the project cards
entirely. That lesson holds, and keyboard reordering is also the accessible
answer.

## The design port

Faithful, in substance and not only in intent.

`src/styles/site.css` is 1,780 lines of considered work. Rewriting it as utility
classes would lose exactly the fidelity that was asked for, so the port is:

- The custom properties become Tailwind 4 `@theme` tokens, so utilities and
  authored CSS resolve to the same values.
- Tailwind handles layout and the whole administration interface.
- The distinctive component CSS ports across as authored CSS.

Both typefaces stay self hosted. No request leaves the visitor's browser.

All seven routes port: `/`, `/architecture`, `/work/[...slug]`, `/resume`,
`/contact`, `/print` and the 404. `src/styles/print.css` and the `/print` route
come with them, so the portfolio PDF still renders from the live site.

## Migration

One script, run once, kept in the repository so it can be re-run against a fresh
database.

1. Read the 18 markdown files in `src/content/projects/` and `src/data/resume.json`.
2. Upload the 298 images in `public/media/` to R2 under a stable prefix.
3. Match the three existing films by key rather than re-uploading them, since
   they are already in the bucket.
4. Write every row.
5. Verify that every media reference resolves to an object that actually exists
   before reporting success.

The Astro site stays on `main` and stays deployable throughout. The rebuild
happens on a branch and is only promoted once it is verified, so there is no
window in which ahmadassi.ca is broken.

## Testing

**Vitest**, for the logic that has already caused a real bug or that fails
silently:

- the tier split, including the fourth lead falling through
- slug generation and collision handling
- upload validation, both type and size
- R2 object key construction and sanitisation
- URL composition from a key and the media origin

**Playwright**, for the paths that are tedious to check by hand and expensive to
get wrong:

- sign in, reach `/admin`, and be turned away without a session
- drop an image, watch it upload, see it on the public page
- reorder projects and see the new order on the home page
- delete a project and confirm the page 404s
- the three lead rule as a user sees it

## Two corrections to the existing documentation

1. `README.md` describes `src/lib/drawing.ts` and a generated SVG line work
   fallback for any image slot set to `generated`. That file does not exist and
   the feature is gone. The documentation is corrected rather than the phantom
   being ported.
2. Ahmad's email address and phone number are committed in
   `src/data/resume.json`. After migration they live in Postgres, which is a
   small improvement worth taking.

## Out of scope

Named so they are decisions rather than omissions:

- **No page builder.** Ahmad manages projects, media and his resume. The set of
  pages is fixed. A block based builder is far more to build and far more to
  keep from breaking the design, and nothing he has asked for needs it.
- **No contact form.** The contact page remains the email link, for the reason
  already recorded: an attachment will not fit through a form anyway.
- **No multi user editing.** Ahmad and Hassan. Cloudflare Access covers that
  without a users table.
- **No automatic PDF rebuild.** `npm run portfolio` still needs a machine with
  Node, Chrome and ffmpeg. Making it automatic is a separate piece of work.
