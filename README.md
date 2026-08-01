# Ahmad Assi, architectural designer

A portfolio website that works as an online resume first and a project gallery second.
Static output, no server to run, no monthly cost.

> **All content is Ahmad's own or is credited.** His introduction, CV and contact details
> come from his existing site. Fifteen projects span professional work, independent
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

**https://hassantfaili-ui.github.io/ahmad-assi-portfolio/**

Deployed by GitHub Actions on every push to `main`
(`.github/workflows/deploy.yml`): checkout, `npm ci`, `astro check`, build,
publish. The type check runs in CI, so a build with type errors cannot publish.

Because this is a project repo, Pages serves it from a subfolder rather than the
domain root. That is why `astro.config.mjs` sets `base` and why every internal
link and asset goes through `url()` in `src/lib/url.ts`. Content files keep clean
paths like `/media/hero.mp4`; the prefix is added at render time. To move to a
custom domain such as ahmadassi.ca, set `site` to the domain, set `base` back to
`'/'`, add a `CNAME` file in `public/`, and point the DNS at GitHub. Nothing else
changes.

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

The direction is **"Datum"**. Layout follows the reference portfolio the client supplied:
centred display type, square tiles in a horizontal filmstrip, staggered project images,
minimal chrome. The aesthetic comes from Ahmad's own subject instead.

Both of his projects are about getting above water. Lincoln Beach Center puts a lookout
over the levee that doubles as a flood platform; La Casa Aranas is an elevated house. So
the site is organised around a datum.

- **The waterline.** A line fixed across the viewport with a live elevation that falls as
  you scroll, from a high point at the top of the page to `+0.00` at the foot of it. The
  range is derived from the page's own length. It reaches in from the margins and leaves
  the centre clear, because a rule straight across struck through the centred text.
- **One dominant deep water tone** over a fixed depth gradient, with a single sharp survey
  orange for ticks, elevations, hovers and errors. There is no second accent.
- **Type does the work colour usually does.** Big Shoulders Display for condensed civic
  lettering, Spectral for prose, Martian Mono for anything numeric. All self hosted, so no
  request leaves the visitor's browser.
- **The front film.** A 14 second excerpt of Ahmad's own Lincoln Beach walkthrough runs
  behind his introduction. It is never downloaded on a narrow screen or when reduced
  motion is requested; those cases keep the poster frame. The full 67 second film sits on
  the Lincoln Beach project page as click to play, with `preload="none"` so an 11MB file
  is only fetched by someone who asks for it. `scripts/build-hero-film.sh` still exists
  for building a pan-and-crossfade loop out of stills if there is ever no video.
- **The works move.** The filmstrip can be grabbed and dragged, nudged with the arrows,
  scrolled with a vertical wheel, swiped on touch, or tabbed through. It is a native
  scroll container underneath, so it still works with no JavaScript. A drag past a few
  pixels suppresses the click, so moving the works never opens a project by accident.
  Note the arrows and dragging only come into play once there are enough projects to
  overflow the rail; with two, everything fits and they stay dormant.
- **Motion is one orchestrated page load**, then near silence, with reveals on scroll. All
  of it respects `prefers-reduced-motion`.

### Where things live

| Path | What it is |
| --- | --- |
| `src/styles/datum.css` | The whole design system. Every colour and size is a token here. |
| `src/layouts/Datum.astro` | The page shell: header menu, waterline, footer. |
| `src/components/HeroFilm.astro` | The front film and the introduction over it. |
| `src/components/Filmstrip.astro` | The works rail. |
| `src/lib/drawing.ts` | Generated line work, used for any image slot with no real file. |
| `src/scripts/datum.ts` | All client behaviour, no framework. |
| `scripts/build-hero-film.sh` | Rebuilds the front film from the renders. |
| `src/content/projects/` | One markdown file per project. |
| `src/data/resume.json` | The resume record. |
| `keystatic.config.ts` | The editor's schemas. |
| `docs/wireframes/index.html` | The low-fidelity wireframes the layout came from. |
| `docs/superpowers/specs/` | The design decisions and why. |

## Still to do

These are known and deliberate, not oversights:

1. **Confirm the inferred project details.** See below.
2. **Connect the contact form.** GitHub Pages is static only, so it cannot receive a
   form post at all. `src/pages/contact.astro` has a `FORM_ENDPOINT` constant; until it
   is set the form validates and then says plainly that it is not connected, and gives
   the email address. It never pretends to have sent anything. To make it work, point
   `FORM_ENDPOINT` at a third party handler such as Formspree, or drop the form and keep
   the email and phone, which are already the fastest way to reach him.
3. **Add the CV PDF.** Put it in `public/cv/` and set `cvFile` in the editor. Until then
   the resume page simply omits the download button rather than offering a broken one.
4. **Choose hosting and a domain.** The build is portable: Cloudflare Pages, Netlify and
   GitHub Pages all serve it as is.
5. **Put the editor online** if Ahmad should edit without running a terminal.
6. **Add tests.** No Playwright coverage is written yet: the routes, the drag on the
   works rail, form validation, keyboard navigation and the empty states all deserve it.
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
