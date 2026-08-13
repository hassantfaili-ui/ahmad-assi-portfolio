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

**https://ahmadassi.netlify.app/**

Netlify builds from `main` on every push. `netlify.toml` sets the build command,
the publish directory and the Node version, and caches the film, the PDF and the
hashed assets hard while leaving HTML revalidating.

**Node 22 or newer is required.** Astro 7 needs `>=22.12.0` and Netlify's default
image ships Node 20, which fails before emitting a single page. The version is
pinned in `netlify.toml` and the requirement is declared in `package.json`
engines. Do not lower either.

GitHub Pages was the original host and has been unpublished. The workflow is
deleted. Nothing in the code assumes one host over the other, so Pages or any
other subpath host would still work: `astro.config.mjs` reads `NETLIFY` and picks
the base accordingly.

**The base path is the only thing that differs between hosts.** Pages serves a
project repo from a subfolder; Netlify serves from the root of its own domain.
Carrying the Pages prefix onto Netlify would 404 every stylesheet, script and
image while the page itself still loaded, which reads as a broken site rather
than a misconfigured one. So `astro.config.mjs` reads `NETLIFY`, which Netlify
sets on every build, and picks the right `base` and `site` automatically. Neither
host needs the config edited by hand, and a custom domain needs no change at all:
Netlify updates `URL` once the domain is attached.

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

The code is done. What remains needs a GitHub account and secrets, so it is not
something that can be set up on Ahmad's behalf.

**1. Give Ahmad write access to this repository.** He needs a GitHub account, and
that account should eventually own the repository outright.

**2. Create a GitHub App** at
https://github.com/settings/apps/new. The only fields that matter:

| Field | Value |
| --- | --- |
| Homepage URL | `https://ahmadassi.netlify.app` |
| Callback URL | `https://ahmadassi.netlify.app/api/keystatic/github/oauth/callback` |
| Request user authorization (OAuth) during installation | tick |
| Webhook | untick Active |
| Repository permissions | Contents: **Read and write**, Metadata: Read-only |

Generate a client secret on the same page, then install the App on this
repository.

**3. Add four environment variables in Netlify**, under Site configuration →
Environment variables. Nothing works until all four are set, and the editor is not
built at all if the first is missing:

| Variable | Where it comes from |
| --- | --- |
| `PUBLIC_KEYSTATIC_GITHUB_REPO` | `hassantfaili-ui/ahmad-assi-portfolio` |
| `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | the App's URL slug |
| `KEYSTATIC_GITHUB_CLIENT_ID` | the App's client ID |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | the secret generated in step 2 |
| `KEYSTATIC_SECRET` | any long random string, e.g. `openssl rand -hex 32` |

**4. Redeploy.** Then open `/keystatic`, sign in with GitHub, and check that saving
a small change produces a commit.

Until `PUBLIC_KEYSTATIC_GITHUB_REPO` is set, the site builds exactly as it does
now: pure static files, no adapter, no editor routes, nothing that can half work.

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
