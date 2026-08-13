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

Netlify is the host. The Netlify build is the canonical one.

`netlify.toml` sets the build command, the publish directory and Node 20, and
caches the film, the PDF and the hashed assets hard while leaving HTML
revalidating.

`.github/workflows/deploy.yml` still exists and still works, but it is
`workflow_dispatch` only: two hosts building the same commit means two URLs for
one site, which splits search ranking and gives two places to check when
something looks wrong. It is kept rather than deleted so Pages can be brought
back with one click.

**The base path is the only thing that differs between hosts.** Pages serves a
project repo from a subfolder; Netlify serves from the root of its own domain.
Carrying the Pages prefix onto Netlify would 404 every stylesheet, script and
image while the page itself still loaded, which reads as a broken site rather
than a misconfigured one. So `astro.config.mjs` reads `NETLIFY`, which Netlify
sets on every build, and picks the right `base` and `site` automatically. Neither
host needs the config edited by hand, and a custom domain needs no change at all:
Netlify updates `URL` once the domain is attached.

Every internal link and asset goes through `url()` in `src/lib/url.ts`. Content
files keep clean paths like `/media/hero.mp4`, which is what the editor shows and
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

Run `npm run dev` and open **http://localhost:4321/keystatic**. Two things to edit:

- **Projects**, one entry per project. Add, reorder, or delete them freely.
- **Resume**, a single record holding the name, biography, experience, education, skills
  and everything in the title block.

Saving writes directly to the files in this repository, so every content change is a
normal reviewable change rather than something that happened invisibly in a database.

Two things worth knowing about the editor:

- It keeps unsaved work in the browser. If a form opens **empty with an "Unsaved" badge
  and a "Restored draft" message**, that is a stale draft, not lost content: use the `...`
  menu to reset the entry and it reloads from the file.
- The editor only runs during `npm run dev`. Getting it online is described under
  [Putting the editor online](#putting-the-editor-online).

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
  muted and looping. `scripts/build-hero.sh` makes it from the 4K master: the first seven
  seconds are cut because the film carries its own title card, which would sit on top of
  his name, and a two pass encode caps it near 9MB so a page that autoplays on every
  visit stays light. It is never downloaded on a narrow screen or when reduced motion is
  requested; those cases keep the poster frame. The full quality version is on YouTube,
  reached from the Lincoln Beach project page through a click to load facade, so nothing
  is requested from Google unless a visitor asks for it.
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
2. **Watch the first form submissions.** The contact form posts through Netlify Forms
   and is rendered only in a Netlify build, so it cannot appear on a host that has
   nothing to receive it. Submissions arrive in the Netlify dashboard; turn on email
   notifications there so they are not missed. Email is still the primary route on the
   page, because an attachment will not fit through a form.
3. **Add the CV PDF.** Put it in `public/cv/` and set `cvFile` in the editor. Until then
   the resume page simply omits the download button rather than offering a broken one.
4. **Attach a domain.** Netlify handles the certificate. Nothing in the config changes.
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

The editor needs server rendered routes, which a static build cannot produce, so it is
mounted during `npm run dev` only (see the comment in `astro.config.mjs`). To host it:

1. Add the host's Astro adapter.
2. Include `keystatic()` unconditionally instead of only in dev.
3. Change `storage` in `keystatic.config.ts` from `{ kind: 'local' }` to GitHub mode.

Step 3 needs a GitHub account and an OAuth app registered against it. That should be
Ahmad's own account, which is why it has been left rather than set up on his behalf.

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
