# Ahmad Assi, architect

A portfolio website that works as an online resume first and a project gallery second.
Static output, no server to run, no monthly cost.

> **Every word and image on the site right now is a placeholder.** The names, projects,
> firms, dates, awards and the email address are invented. The structure is finished;
> the content is not. See [Replacing the placeholder content](#replacing-the-placeholder-content).

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

The direction is **the site is a drawing set**, not a gallery.

- **Navigation is a sheet index.** The persistent title block on the right edge carries
  the sheet number, the index, the scale, the issue date and the revision, and replaces
  the usual header and footer. On narrow screens it becomes the bottom edge of the sheet.
- **Column grid bubbles** run down the left margin, marking the sections of the page and
  tracking whichever one is in view, the way grid lines locate things on a real drawing.
- **Two print types instead of light and dark mode.** `bond` is ink on cool bond paper on
  a drafting table. `blueline` is a diazo print, white line work on a prussian ground. The
  control says which one you are looking at. The choice persists and defaults to the
  system preference.
- **Type does the work that colour usually does.** Archivo on its real width axis at 125%
  for drawing lettering, Newsreader for prose, IBM Plex Mono for every label, caption and
  title-block field. Fonts are self hosted, so no request leaves the visitor's browser.
- **Motion is one orchestrated page load**, then near silence, with reveals on scroll.
  All of it respects `prefers-reduced-motion`.

### Where things live

| Path | What it is |
| --- | --- |
| `src/styles/global.css` | The whole design system. Every colour and size is a token here. |
| `src/layouts/Sheet.astro` | The page shell: title block, grid rail, menu, drawing viewer. |
| `src/lib/drawing.ts` | The procedural drawing generators. |
| `src/lib/sheets.ts` | The sheet index, which is the navigation. |
| `src/scripts/sheet.ts` | All client behaviour, about 170 lines, no framework. |
| `src/content/projects/` | One markdown file per project. |
| `src/data/resume.json` | The resume record. |
| `keystatic.config.ts` | The editor's schemas. |
| `docs/wireframes/index.html` | The low-fidelity wireframes the layout came from. |
| `docs/superpowers/specs/` | The design decisions and why. |

## Still to do

These are known and deliberate, not oversights:

1. **Replace the placeholder content.** See below.
2. **Connect the contact form.** `src/pages/contact.astro` has a `FORM_ENDPOINT`
   constant. Until it is set, the form validates and then says plainly that it is not
   connected and gives the email address. It never pretends to have sent anything. Set it
   to the host's form handler once hosting is chosen.
3. **Add the CV PDF.** Put it in `public/cv/` and set `cvFile` in the editor. Until then
   the About page shows a marked empty slot rather than a broken download.
4. **Choose hosting and a domain.** The build is portable: Cloudflare Pages, Netlify and
   GitHub Pages all serve it as is.
5. **Put the editor online** if Ahmad should edit without running a terminal.
6. **Add tests.** The design spec commits to Playwright coverage of the routes, the
   filter, form validation, keyboard navigation and the empty states. None of it is
   written yet.
7. **Register accounts in Ahmad's own name.** The host, the domain and any CMS account
   should be his, so keeping the site online never depends on anyone else.

### Replacing the placeholder content

Work through the editor rather than the files. In order:

1. **Resume** first, since the cover sheet is built from it. The email address
   `ahmad@example.ca` is fake and appears in several places.
2. **Projects** next. Delete the six invented ones as you add real work. Each needs a
   unique sheet number (`A-101`, `A-102`, and so on) and its own honest **What you
   personally did** field, which is separate from the description because on team projects
   that is what a reviewer is actually assessing.
3. **Categories.** The current set (Residential, Cultural, Commercial, Academic,
   Competition) is a guess. Edit the options in `keystatic.config.ts` and the matching
   enum in `src/content.config.ts` to match the real work.
4. **Portrait.** The About page currently shows generated line work in the portrait slot.
   If there is no photograph Ahmad wants to use, drop the slot and let the biography run
   as a single column.

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
