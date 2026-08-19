# Ahmad Assi, architectural designer

A portfolio website that works as an online resume first and a project gallery second.
Static output, no server to run, no monthly cost.

> **All content is Ahmad's own or is credited.** His introduction, CV and contact details
> come from his existing site. Sixteen projects span professional work, independent
> commissions and coursework from first through fourth year.
>
> **Crediting is deliberate and specific.** Much of the academic work is group work, and
> each page names the collaborators: Kyle Mo on Renewal Square (where Building B is his and
> is not published here), Kyle Mok on Building Systems, Awj on River's View, Amos and Awj on
> City Building Blocks, Team 1 on the Earl Armstrong plan, Group A4G4 on the Jacobs House
> delineation, Group 1 on Core and Shell, Group 9 on the Coach House, and a six person group
> on the Schindler study. Sts. Peter and Paul Church is a Muzaiko Architecture project,
> included with permission and credited to them, with his contribution given as the
> visualisation. The Jacobs House and Schindler pages are studies of other architects'
> buildings and say so.
>
> Nothing on the site is stock. The six images that were on his old Wix portfolio page
> were untouched template demos, a skincare bottle and a jewellery magazine cover, so they
> were discarded rather than shown as his work. See
> [What still needs Ahmad](#what-still-needs-ahmad) for the open items.

## Live site

Cloudflare builds from `main` on every push. Build command `npm run build`,
output directory `dist`. `public/_headers` carries the caching rules: media for an
hour then revalidate, hashed assets pinned hard, HTML always revalidating.

**Node 22 or newer is required.** Astro 7 needs `>=22.12.0` and the default build
image is older, which fails before emitting a single page. Set `NODE_VERSION` to
`22` in the project's variables; the requirement is also declared in
`package.json` engines. Do not lower either.

**Nothing published may exceed 25 MiB.** That is a hard Cloudflare limit. The three
films are well over it, so they are served from an R2 bucket instead and
`PUBLIC_MEDIA_ORIGIN` points at it. With that set the build rewrites their URLs and
drops them from `dist`; without it the build warns, then fails on the host. See
`docs/EDITING.md`.

GitHub Pages and Netlify were both used earlier and both have been left behind.
Nothing in the code assumes a host: `astro.config.mjs` reads `CF_PAGES_URL` with
`URL` as a fallback, and every internal link and asset goes through `url()` in
`src/lib/url.ts`, which is a passthrough at a root base and is what would make a
subpath host work again without touching a single path.

Every internal link and asset goes through `url()` in `src/lib/url.ts`. Content
files keep clean paths like `/media/hero-1440.mp4`, which is what the editor shows and
what a person would expect to type; the prefix is added at render time.

The Keystatic editor never reaches the deployed site: it is mounted only when
`npm_lifecycle_event` is `dev`, and CI runs `build`.

## Running it

```bash
npm install
```

```bash
npm run dev
```

That serves the site at http://localhost:4321 and the content editor at
http://localhost:4321/keystatic.

```bash
npm run build
```

Builds to `dist/`, which is plain files any static host will serve. `npm run preview`
serves that output locally, and `npm run check` type checks the project.

## Editing content

Ahmad edits the site in a browser at **/keystatic**. Saving commits to this
repository, Netlify rebuilds, and the change is live in about a minute. Every edit
is an ordinary reviewable commit rather than something that happened invisibly
inside a database.

Two things to edit:

- **Projects**, one entry per project. Add, reorder or delete them freely.
- **Resume**, a single record holding the name, biography, experience, education,
  skills and everything in the title block.

Photos are upload fields, not paths to type. Choosing a file writes it into
`public/media/<project-slug>/` and stores the path, and Remove takes it off the
page. **Each project's images live in its own folder for exactly this reason:**
Keystatic scopes a collection's uploads to the entry slug, so with everything in
one flat folder the editor showed every image field as empty and would have
blanked them all on the first save.

`npm run dev` runs the same editor against the files on this machine instead,
which is the way to make bulk changes without a hundred commits.

Two things worth knowing:

- The editor keeps unsaved work in the browser. If a form opens **empty with an
  "Unsaved" badge and a "Restored draft" message**, that is a stale draft, not lost
  content: use the `...` menu to reset the entry and it reloads from the file.
- Only the two `/keystatic` routes run on a server. Every page of the portfolio
  itself is still a plain prerendered file.

### Turning the editor on

The code is in place; what is left needs a GitHub account and cannot be done for
you. See [Putting the editor online](#putting-the-editor-online).

## Images and drawings

Every image slot renders one of two things:

1. **Generated line work.** While the `Image file` field says `generated`, the site draws
   a plan, section, elevation, axonometric, site plan or interior perspective in SVG.
   These are real geometry, deterministic per seed, and they restyle themselves for both
   print types. Change the seed to redraw one differently.
2. **A real file.** Put images in `public/media/` and set the field to its path, for
   example `/media/riverlot-01.jpg`. Anything starting with `/` is treated as a file.

Alt text is a required field on every slot, enforced by the content schema, so an image
cannot ship without a description.

## The design

Black and white only. No accent colour: emphasis comes from weight, scale, rule and
inversion, which is how the practices this was measured against hold a page together.
Colour belongs to the photographs, and Ahmad's renders bring plenty of it. Light is the
default because architectural imagery reads best on white; dark is one click away.

Two typefaces, both self hosted so no request leaves the visitor's browser: Big Shoulders
Display for condensed display lettering, Archivo for prose and for anything that behaves
like data.

- **The projects section follows the Foster + Partners studio pattern.** The image sits
  flush at the top of a panel and the panel carries the title, a round arrow and one line
  of year and place. Nothing is laid over the image, which is what lets a wall of these
  stay readable.
- **The front film.** Ahmad's Lincoln Beach walkthrough runs behind his introduction,
  muted and looping. `scripts/build-hero.sh` makes two encodes from the 4K master, 1440p
  at 4 Mbps and 720p at 1.1 Mbps, and the first seven seconds are cut because the film
  carries its own title card that would sit on top of his name. The source is chosen at
  runtime: the smaller file goes to narrow screens, slow connections and anyone whose
  browser asks to save data, because this autoplays and the size is spent from the
  visitor's allowance. It is never downloaded at all on a narrow screen or when reduced
  motion is requested; those cases keep the poster frame.
- **Nothing is embedded from a third party.** The walkthrough on the Lincoln Beach page is
  self hosted at 1440p, about 73MB, built by `scripts/build-walkthrough.sh` and served
  from the same domain as everything else. It plays on a click with `preload="none"`, so
  it is only fetched by someone who asks for it. True 4K was measured and rejected: at a
  bitrate that fits under GitHub's 100MB per file limit it is visually identical at
  matched display size, and it would leave 4MB of headroom. `Film.astro` keeps a YouTube
  path with a click to load facade for any future film that will not fit.
- **Projects are in three tiers**, all set in the editor, with Ahmad's order kept inside
  each one. Three leads take large cards, the set runs in a horizontal strip, and thin
  coursework sits in a ruled index below. The strip is a native scroll container, so
  trackpad, touch and keyboard work with no JavaScript; the two buttons are for a mouse
  with no horizontal wheel. There is deliberately no drag to scroll, because capturing
  the pointer to fake dragging is what once stopped the cards being clickable at all.
- **Every card says who did the work.** `credit` is required on every project, because a
  portfolio that does not distinguish solo work from group work is misleading, and a
  reviewer assumes the worst when it is missing.
- **Motion is one orchestrated page load**, then near silence, with reveals on scroll. All
  of it respects `prefers-reduced-motion`.

### Where things live

| Path | What it is |
| --- | --- |
| `src/styles/site.css` | The whole design system. Every colour and size is a token here. |
| `src/styles/print.css` | The portfolio PDF. Sheets, not a scrolling page. |
| `src/layouts/Site.astro` | The page shell: header menu, theme switch, footer. |
| `src/components/HeroFilm.astro` | The front film and the introduction over it. |
| `src/components/ProjectGrid.astro` | The three tiers: leads, the strip, the index. |
| `src/components/ProjectCard.astro` | One project card, at either size. |
| `src/components/SkillIcon.astro` | The drawn marks for the software list. |
| `src/lib/url.ts` | Prefixes internal links with the host base path. |
| `src/lib/drawing.ts` | Generated line work, used for any image slot with no real file. |
| `src/scripts/site.ts` | All client behaviour, no framework. |
| `scripts/build-hero.sh` | Rebuilds the front film from a full quality walkthrough. |
| `scripts/build-portfolio.sh` | Renders the portfolio PDF from the site itself. |
| `src/content/projects/` | One markdown file per project. |
| `src/data/resume.json` | The resume record. |
| `keystatic.config.ts` | The editor's schemas. |
| `docs/wireframes/index.html` | The low-fidelity wireframes the layout came from. |
| `docs/superpowers/specs/` | The design decisions and why. |

## Still to do

These are known and deliberate, not oversights:

1. **Confirm the inferred project details.** See below.
2. **There is no contact form.** It was Netlify Forms and Cloudflare has no
   equivalent, so it was removed rather than left to post nowhere. The page is the
   email link, which was always the primary route: an attachment will not fit
   through a form anyway. Adding one back means a third party service.
3. **Add the CV PDF.** Put it in `public/cv/` and set `cvFile` in the editor. Until then
   the resume page simply omits the download button rather than offering a broken one.
4. **Attach a domain.** Cloudflare handles the certificate. Nothing in the config changes.
   Do the same for the R2 bucket: the `pub-....r2.dev` address it uses today is rate
   limited and Cloudflare says not to use it in production.
5. **Put the editor online** if Ahmad should edit without running a terminal.
6. **Add tests.** No Playwright coverage is written yet: the routes, the projects strip, form validation, keyboard navigation and the empty states all deserve it.
7. **Register accounts in Ahmad's own name.** The host, the domain and any CMS account
   should be his, so keeping the site online never depends on anyone else.

### What still needs Ahmad

Work through the editor rather than the files.

1. **Sts. Peter and Paul Church is deliberately not published.** The design development
   set in that folder is the copyright of **Muzaiko Architecture**, is dated 2021-08, is
   drawn by "P.A." rather than by him, and carries an explicit notice forbidding
   reproduction without their written permission. Before any of it goes online we need to
   know what his role actually was, and the Muzaiko sheets need their permission. The
   outdoor renders may well be his own work and could go up crediting Muzaiko as project
   architect, which is the normal and safe way to show it.
2. **Confirm "Dave's House" is La Casa Aranas.** The drawings in that folder describe the
   house his CV names, so they were merged into that project. If they are two different
   houses, it is one file to split.
3. **Two dates are inferred**, not stated in the material: the Lincoln Beach and La Casa
   Aranas years both come from his graduation year.
4. **A portrait**, if he wants one. There is no photograph of him in anything supplied.
5. **Categories.** The set in `keystatic.config.ts` and the matching enum in
   `src/content.config.ts` should be trimmed to whatever his real work actually is.

### Putting the editor online

The code is done and all three storage modes are verified. What is left is account
work, which cannot be done on Ahmad's behalf.

**Use Keystatic Cloud.** It is the only option that lets Ahmad sign in with an email
address and a password, or a passkey, without a GitHub account, and it needs fewer
secrets than GitHub mode, not more. In cloud mode every GitHub call is proxied
through `api.keystatic.cloud` and the server side API route is a stub, so there is
no OAuth app, no client id, no client secret and no `KEYSTATIC_SECRET` to manage.
Free for up to 3 users per team; this needs 2.

1. Sign in at https://keystatic.cloud and create a team.
2. Create a project in that team and connect this GitHub repository to it. This is
   the only step that touches GitHub, and it is done by the repo owner, once.
3. Install the Keystatic Cloud GitHub App on the repository when prompted.
4. Invite Ahmad to the team by email.
5. In Cloudflare, set one environment variable and redeploy:

   | Variable | Value |
   | --- | --- |
   | `PUBLIC_KEYSTATIC_CLOUD_PROJECT` | `your-team/your-project` |

6. Ahmad opens `/keystatic`, signs in with his email, and edits. His saves arrive in
   this repository as commits authored by `keystatic-cloud[bot]`, Cloudflare rebuilds,
   and the change is live in about a minute.

Known rough edges, none of them blockers:

- A single save cannot exceed 45 MiB, which is GitHub's own API limit rather than
  Keystatic's. Photographs are downscaled in the browser before they are committed,
  so roughly fifty fit in one save and this is unlikely to be met in practice.
- The films stay a developer job. They live in R2, not in the editor.
- The Cloud sign-in redirect is tied to the production origin, so the editor will not
  work on preview deployments.
- Keystatic's docs for cloud mode have not been edited since March 2024 and there is
  no public pricing page, so the quoted free tier is documented rather than confirmed
  against live billing. The code and the service are current: `@keystatic/core` 0.6.5
  shipped 11 August 2026.

#### The GitHub fallback

`PUBLIC_KEYSTATIC_GITHUB_REPO` still works and is left in place, for two reasons: it
is the path if the repository is ever transferred to Ahmad outright, and GitHub now
supports "Continue with Google", so an account needs no new password. That route also
needs a GitHub App and four more variables, documented in the git history of this file.

Until one of those variables is set, the site builds exactly as it does now: pure
static files, no adapter, no editor routes, nothing that can half work.

## Accessibility and performance

Built in from the start: WCAG 2.2 AA contrast in both print types, one `h1` per page,
semantic headings, a skip link, visible focus throughout, filters as real buttons with
`aria-pressed` and a live region announcing the result, Escape closing the menu and the
drawing viewer with focus returned to whatever opened it, and reduced motion respected.

Nothing ships to the browser but the site: no framework runtime, no analytics, no
external font or image requests. `npm run check` reports 0 errors.

The one accepted trade-off is that real photographs added to `public/media/` are served
as plain `<img>` without responsive derivatives. If the portfolio grows past a handful of
large photographs, move them into `src/assets/` and use Astro's `<Image>` component.
