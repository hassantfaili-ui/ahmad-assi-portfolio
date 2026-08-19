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

Nothing in the code assumes a particular host. `astro.config.mjs` reads
`CF_PAGES_URL`, and every internal link and asset goes through `url()` in
`src/lib/url.ts`, which is a passthrough at a root base and is what would make a
host that serves the site from a subfolder work without touching a single path.
Content files keep clean paths like `/media/hero-1440.mp4`, which is what a person
would expect to type; the prefix is added at render time.

Every page of the site prerenders to a plain file. One route does not, and does
not belong to the site: `/tina-island`, which the editor uses to re-render a
fragment of a page from unsaved values while somebody is editing. That is what
the Cloudflare adapter is for, and why `wrangler.jsonc` sets `nodejs_compat`.

## Running it

```bash
npm install
```

```bash
npm run dev
```

That serves the site at http://localhost:4321 and the editor at
http://localhost:4321/admin, both against the files in this checkout, and reloads
as files are saved. It runs Tina's CLI, which compiles the schema in `tina/` and
starts a local content API before handing off to `astro dev`, so `astro dev` on
its own is not enough. `npm run dev:site` is there for the times you want the
site without the editor.

```bash
npm run build
```

Builds to `dist/`. `npm run preview` serves that output locally, and `npm run
check` type checks the project.

The build runs Tina first and then Astro. With TinaCloud credentials set it reads
content from this checkout and emits an admin that saves to TinaCloud; without
them it builds a local-only client, warns, and produces a complete site whose
editor cannot save. Picking automatically rather than failing is deliberate: a
missing credential should not turn a deploy red over something that has nothing
to do with whether the website works. See `scripts/build.mjs`.

## Editing content

Content is files in this repository, so every edit is an ordinary reviewable
commit rather than something that happened invisibly inside a database. That is
true whether the file was changed in an editor or in a text editor.

Ahmad edits at **/admin**, with the real page beside the fields. Clicking a
heading or a photograph on that page opens the field that wrote it, and typing
changes the page as he types. Saving commits here and Cloudflare rebuilds within
a minute or two. The editor is TinaCMS; the two limits worth stating are that he
types into the field rather than into the page itself, which is true of every
Git-backed editor today, and that the live update is a preview until Save.

Two things to edit:

- **Projects**, one markdown file each in `src/content/projects/`. Add, reorder or
  delete them freely; `tina/collections/projects.ts` defines the fields and
  `assertUsable` in `src/lib/data.ts` fails the build with the file named if one
  is missing.
- **Resume**, `src/data/resume.json`, a single record holding the name, biography,
  experience, education, skills and everything in the title block.

Photographs go in `public/media/<project-slug>/`, one folder per project, and are
referenced by path. Exports straight out of a renderer are fine: the build resizes
anything oversized on its way into `dist`, so an enormous JPEG cannot reach a
visitor.

**Films are the exception.** They are far past both GitHub's 45MB per save and
Cloudflare's 25 MiB per asset, so they cannot be committed whatever the editor is.
They live in R2, and the film field uploads to it directly when the bucket is
configured.

`npm run dev` serves the site and the editor from the files on this machine,
which is the way to see a set of changes before pushing any of them.

See [docs/EDITING.md](docs/EDITING.md) for the field by field account.

## Images and drawings

Every image slot is a real file. Uploading through the editor writes it into
`public/media/` and stores its path, for example `/media/riverlot-01.jpg`, which
is also what to type if you are editing the file by hand.

Alt text is required on every slot, twice over: the editor refuses to save a slot
without it, and `assertUsable` in `src/lib/data.ts` fails the build if one gets in
another way.

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
- **Projects are in three tiers**, set by `tier` in each project's file, with Ahmad's order kept inside
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
| `src/lib/url.ts` | Prefixes internal links with the host base path, and points films at R2. |
| `src/lib/data.ts` | Every read of the content, and the checks that used to be the zod schema. |
| `src/lib/islands.ts` | The regions the editor can re-render on the page as you type. |
| `src/scripts/site.ts` | All client behaviour, no framework. |
| `scripts/build-hero.sh` | Rebuilds the front film from a full quality walkthrough. |
| `scripts/build-portfolio.sh` | Renders the portfolio PDF from the site itself. |
| `src/content/projects/` | One markdown file per project. |
| `src/data/resume.json` | The resume record. |
| `tina/config.ts` | The editor, and where saving writes to. |
| `tina/collections/` | The project and resume fields, one file each. |
| `tina/fields/film.tsx` | The one upload that goes to R2 rather than into Git. |
| `src/pages/api/film-upload.ts` | Signs that upload. Answers 501 when R2 is not configured. |
| `docs/wireframes/index.html` | The low-fidelity wireframes the layout came from. |
| `docs/superpowers/specs/` | The design decisions and why. |

## Still to do

These are known and deliberate, not oversights:

1. **Confirm the inferred project details.** See below.
2. **There is no contact form.** Cloudflare has nothing that accepts a submission
   without a third party service, so it was removed rather than left to post
   nowhere. The page is the email link, which was always the primary route: an
   attachment will not fit through a form anyway.
3. **Add the CV PDF.** Put it in `public/cv/` and set `cvFile` in
   `src/data/resume.json`. Until then the resume page simply omits the download
   button rather than offering a broken one.
4. **Attach a domain.** Cloudflare handles the certificate. Nothing in the config changes.
   Do the same for the R2 bucket: the `pub-....r2.dev` address it uses today is rate
   limited and Cloudflare says not to use it in production.
5. **Add tests.** No Playwright coverage is written yet: the routes, the projects strip, keyboard navigation and the empty states all deserve it.
6. **Register accounts in Ahmad's own name.** The host, the domain and the
   TinaCloud project should be his, so keeping the site online never depends on
   anyone else.
7. **Put the editor online.** Two variables and a redeploy. See below.

### Putting the editor online

The code is done and both storage modes are verified. What is left is account
work, which cannot be done on Ahmad's behalf.

**Use TinaCloud.** Ahmad signs in with an email address and a password and never
needs a GitHub account: TinaCloud holds the connection to this repository and
commits on his behalf. Free for two users per project, which is what this needs.
Only the person doing step 1 touches GitHub, once.

1. Sign in at https://app.tina.io and create a project, pointed at this GitHub
   repository. Install the TinaCloud GitHub App when prompted.
2. Copy the client id, and create a read/write token.
3. In Cloudflare, set two variables and redeploy:

   | Variable | Value |
   | --- | --- |
   | `PUBLIC_TINA_CLIENT_ID` | the client id from step 2 |
   | `TINA_TOKEN` | the token from step 2 |

4. Invite Ahmad to the project by email.
5. Ahmad opens `/admin`, signs in with his email, and edits the real page.

`npm run editor:check -- https://ahmadassi.ca` reports what is configured and
whether the deployed site is actually serving the editor and its live preview.

Known rough edges, none of them blockers:

- A single save cannot exceed 45 MiB, which is GitHub's own API limit rather than
  Tina's. The build still refuses to publish an oversized image, in
  `src/integrations/shrink-media.mjs`, so this is a save that fails rather than a
  page that gets heavy.
- `@tinacms/astro` is the newest part of this: 0.6.1, first published in May 2026.
  The rest of Tina is not, and the visual editing pieces it uses are the same ones
  every other framework it supports uses.
- Uploading films needs five more variables and a CORS rule on the bucket. Left
  unset, films stay a developer job exactly as they were.

#### If Ahmad wants to type on the page itself

He cannot, and not because of a choice made here: no Git-backed editor does that
today. Tina removed its own in-page typing in the v1 rewrite and every framework
it supports now works the way this does, a form beside a live preview with
click-to-focus between them. The one product that really does put a cursor in the
rendered page for an Astro site is CloudCannon, at roughly USD 55 per site per
month, and it wants to run the build on its own infrastructure. That is the
trade, if it ever comes up.

### What still needs Ahmad

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
5. **Categories.** The `category` options in `tina/collections/projects.ts` should
   be trimmed to whatever his real work actually is.

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
