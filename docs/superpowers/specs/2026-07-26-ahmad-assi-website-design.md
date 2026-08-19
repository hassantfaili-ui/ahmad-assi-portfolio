# Ahmad Assi Website: design

**Date:** 2026-07-26
**Status:** SUPERSEDED. Kept as the record of how the site was scoped and why.

> The visual direction in section 6 is no longer what is built. That drawing-set
> design was replaced by "Datum", and the placeholder content it assumed was
> replaced by Ahmad's real CV and projects. The information architecture,
> content model and constraints in sections 1 to 4 still hold.
**Wireframes:** [`docs/wireframes/index.html`](../../wireframes/index.html) (v1)

## 1. What this is

A portfolio website for Ahmad Assi, an architect. The site functions primarily as an
online resume with project work supporting it, not as a gallery with a biography
attached. The distinction drives every structural decision below.

**Primary visitor:** someone assessing Ahmad professionally, most likely a hiring
architecture practice. They arrive wanting to answer three questions quickly: what has
he built, what did he personally do on it, and can he be reached.

**Success looks like:** a reviewer can form a fair judgement of his capability in under
two minutes without downloading anything, and can still take the PDF CV if their process
requires it.

**Non-goals:** selling services to homeowners, publishing a blog, collecting newsletter
subscribers, e-commerce. None of these serve the primary visitor and each would dilute
the site.

## 2. Constraints established with the user

| Constraint | Decision |
| --- | --- |
| Content available now | None. Build against structured placeholders. |
| Structure | Resume home plus dedicated project pages (option B of three presented). |
| Content editing | Ahmad must be able to add and edit projects himself, without touching code. |
| Hosting | Static output on a free host. |
| Visual direction | Derived from reference sites Ahmad likes (see section 6). |
| Language | Canadian English. |

## 3. Information architecture

Five routes. No more.

| Route | Purpose |
| --- | --- |
| `/` | The resume: name, positioning, key facts, selected work (max six), experience, education, skills, contact prompt. |
| `/work` | Full project index, filterable by category. |
| `/work/<slug>` | One project: lead image, fact table, brief, his role, image groups, drawings, previous and next. |
| `/about` | Long-form bio, portrait, PDF CV download, full experience history, credentials, awards, publications. |
| `/contact` | Direct contact details and a four field form. |

Rationale for the split between `/` and `/about`: the home page carries an abridged
resume so a reviewer never has to click to see the substance, and `/about` carries the
unabridged version for anyone who wants it. Duplication of content between the two is
intentional and is handled by both reading the same CMS documents, not by copying text.

Every project has its own URL so Ahmad can send a single project to a firm. This was the
deciding factor against a one page site.

## 4. Content model

Shaped for an editor from the start, because retrofitting hard coded HTML into editable
content is the expensive mistake here. Two documents, no more: the thing Ahmad edits
often, and the thing he edits rarely.

**`projects`** (a collection, one markdown file per project, in `src/content/projects/`)
- `title`, `slug`, `sheet` (validated against `A-\d{3}`), `category` (enum), `year`,
  `location`, `buildingType`, `area`, `status` (enum)
- `role` and `contribution`: what Ahmad personally did, deliberately separate fields from
  the description, because on team projects this is what a reviewer is assessing
- `summary`: the one line under the title
- `leadImage`, and `imageGroups[]` each with `layout` (full, pair, triptych), a shared
  `caption` and `images[]`, and `drawings[]` each with a `drawingType`
- `featured` controls appearance on the cover sheet, `order` is the sort key
- the markdown body is the brief, two to four paragraphs

**`resume`** (a singleton at `src/data/resume.json`) holds everything else: name,
discipline, credential, registration, location, years, availability, issue date,
positioning statement, biography paragraphs, portrait alt text, CV path, email, phone,
social links, the four cover sheet facts, and arrays for experience, education, skill
groups, languages, awards, publications and exhibitions.

This is one document rather than the five collections an earlier draft proposed. It is one
person's record, not a set of independent items, and splitting it would have meant five
editor screens to change a job title. Sections whose arrays are empty do not render at
all, rather than rendering an empty heading.

Every image slot requires alt text, enforced by the schema so the build fails without it.
That is the only reliable way to keep an image heavy site accessible once someone else is
adding content.

## 5. Technical approach

**Astro, static output, with Keystatic as the editor.**

> Superseded on the editor only. Keystatic was replaced by TinaCMS in August 2026,
> because Ahmad wanted to edit on the page rather than in a form beside it. The
> reasoning below still holds for Astro, for static output, and for keeping content
> as files in this repository; Tina keeps all three. See `docs/EDITING.md` for what
> is true now. The rest of this document is left as it was written.

- **Astro** ships zero JavaScript by default and includes a responsive image pipeline.
  For a site whose value is large architectural imagery loading fast, that default
  matters more than any framework feature. Client JavaScript is one 170 line module
  covering the print toggle, the sheet index, the scrollspy, scroll reveals, the
  full screen drawing viewer and the category filter. No framework runtime is shipped.
- **Keystatic, not Sanity.** The earlier draft of this spec recommended Sanity for its
  image pipeline. That was reversed during implementation for one decisive reason: Sanity
  requires creating an account, and this site is Ahmad's professional identity, so the
  account must be his rather than an intermediary's. Keystatic stores content as files in
  this repository and needs no third party account at all, which means the editor could be
  built and verified now rather than described.
- **The editor runs during `npm run dev` only.** Its admin UI needs server rendered
  routes, which a static build cannot produce, so the integration is mounted only when the
  dev server runs. `npm run build` stays fully static. Putting the editor online needs a
  host adapter and GitHub storage mode, which needs Ahmad's own GitHub account and is
  documented in the README as his step.
- **Images.** Every slot renders generated SVG line work while no real file is set, and a
  plain `<img>` from `public/media/` once one is. Real photographs are therefore served
  without responsive derivatives; if the portfolio grows past a handful of large images
  they should move to `src/assets/` and Astro's `<Image>` component. Recorded as an
  accepted trade-off rather than an oversight.
- **Hosting:** Cloudflare Pages, Netlify or GitHub Pages, static, no adapter required.
- **Contact form:** a `FORM_ENDPOINT` constant, empty until hosting is chosen. While it is
  empty the form validates and then states plainly that it is not connected, and gives the
  email address. It never displays a false success. Spam protection is a honeypot field and
  a timing check, not a CAPTCHA: making a hiring manager solve a puzzle to reach him is a
  worse outcome than a little spam.
- **Accounts:** the host, the domain and any future CMS account should be registered to
  Ahmad. An action item, not a technical task.

## 6. Visual direction

The reference material Ahmad supplied (a SiteBuilderReport gallery of 31 architect sites,
a Lovable architect portfolio template, and Wix's architecture template collection)
converges on one genre: monochrome palettes, heavy whitespace, neutral typography,
uniform grid galleries, category filtering, and system aware dark mode.

An earlier version of this section proposed a warm off-white ground with hairline rules.
That was rejected during implementation: warm cream with a high contrast serif, and
broadsheet hairline layouts, are two of the three looks that generated design currently
defaults to. They would have been arrived at regardless of the brief, which makes them a
default rather than a decision. The references left this axis free, so it was spent
elsewhere.

**Direction: the site is a drawing set.** The visual language is the apparatus of a
construction document set rather than gallery minimalism.

- **Signature: the title block.** A persistent strip on the right edge carries the sheet
  number, the sheet index, the scale, the issue date, the revision and who drew it,
  replacing the conventional header and footer. Navigation is by sheet number: A-000
  cover, A-100 project index, A-101 upward per project, A-900 curriculum vitae, A-990
  contact. Numbering is justified here, where most numbered markers in design are not,
  because a drawing set genuinely is an ordered sequence. On a bound set the drawing title
  runs up the sheet edge, so it does here too.
- **Column grid bubbles** run down the left margin, lettered, marking the sections of the
  page and tracking whichever is in view. On a drawing, grid bubbles locate things; here
  they locate and navigate.
- **Two print types, not light and dark mode.** `bond` is near black ink on cool bond
  paper laid on a drafting table, so the page has a ground and the sheet sits on it.
  `blueline` is a diazo print: white line work on a prussian ground. The control names
  which one you are looking at. Dark mode is a different print, not an inverted one.
- **Colour is restrained deliberately.** One dominant neutral, near black ink, a single
  cyanotype accent for links, focus and registration marks, and a revision red reserved
  for error states. The restraint is a choice about letting the drawings dominate, not a
  failure to pick a palette.
- **Typography carries the personality.** Archivo on its real variable width axis, pushed
  to 125% for the name and 112% for headings, set uppercase like drawing lettering, with
  weight extremes rather than adjacent steps. Newsreader for prose, the specification
  voice. IBM Plex Mono for every label, caption, fact table and title-block field, which
  is idiomatic rather than decorative: it is how drawings are annotated. Excluded by name:
  Inter, Roboto, Open Sans, Lato, system stacks, Space Grotesk. All three are self hosted.
- **Motion is one orchestrated page load** with staggered reveals, then near silence, plus
  fades as images enter the viewport and registration marks on card hover. All of it
  respects `prefers-reduced-motion`.

**Placeholder imagery.** Rather than stock photography, the site draws its own plans,
sections, elevations, axonometrics, site plans and interior perspectives procedurally in
SVG, deterministic per seed. This was chosen over downloading stock images for three
reasons: an architect's drawings are legitimately the content, the line work restyles
itself for both print types from the same source, and nothing is fetched from anywhere.
Real files replace them per slot with no redesign.

## 7. Accessibility and performance

Targets, verified rather than asserted:

- WCAG 2.2 AA. Contrast checked in both themes.
- Alt text required at the CMS layer, as above.
- Category filters are real buttons with `aria-pressed`, operable by keyboard, and the
  grid is announced as a live region when it changes.
- Visible focus styles throughout. No focus trap in the mobile menu.
- `prefers-reduced-motion` honoured for every animation.
- Semantic heading order, one `h1` per page.
- Largest Contentful Paint under 2.0 seconds on a simulated 4G connection.
- Modern formats served with fallbacks, low quality image placeholders, lazy loading
  below the fold, eager loading for the lead image only.

## 8. Testing

- **Playwright:** every route renders; filters narrow and restore the grid; form
  validation, success and error states; keyboard navigation through the menu and filters;
  previous and next project links resolve.
- **Empty and partial states, tested explicitly:** no projects, a project with no
  drawings, a profile with no portrait, empty awards and publications. Placeholder driven
  builds hide these failures until real content is thin in a way nobody predicted.
- **axe** scan on each route in continuous integration.
- **Lighthouse** budget enforced in continuous integration, failing on regression.

## 9. Open questions

1. **Typeface pairing.** Settled during implementation: Archivo on its width axis,
   Newsreader, IBM Plex Mono. Open only to Ahmad's reaction, not blocking.
2. **Hero image on the home page.** The wireframe deliberately has none. Noted as pin 1.2
   and the largest open structural question.
3. **Real project categories.** The wireframe uses residential, commercial, cultural and
   academic as placeholders. The real set depends on what Ahmad has built.
4. **Portrait.** If he has none he is willing to use, the About layout drops to a single
   column rather than showing an empty slot.
5. **Which of awards, publications and exhibitions have content.** Empty ones get cut.
6. **Domain name.** Unknown.
7. **Number of projects.** Determines whether filters appear at all in version one.

None of these block the implementation plan for structure, routing, content model or
tooling. Items 1 and 2 block the visual design stage.

## 10. Out of scope for version one

Blog, multi language support, project search, client testimonials, analytics beyond
privacy respecting page counts, animation beyond what section 6 describes.
