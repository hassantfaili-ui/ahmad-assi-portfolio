# Ahmad Assi Website: design

**Date:** 2026-07-26
**Status:** awaiting review
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

Shaped for a CMS from the start, because retrofitting hard coded HTML into editable
content is the expensive mistake here.

**`project`** (collection, the only content Ahmad will touch often)
- `title`, `slug`, `category` (enum), `year`, `location`, `buildingType`, `size`,
  `status` (enum: built, under construction, unbuilt, competition, academic)
- `role`: what Ahmad personally did, a separate required field from the description
- `leadImage`: image with a focal point, so crops never decapitate a building
- `brief`: rich text, two to four short paragraphs
- `imageGroups`: repeatable blocks, each with `layout` (pair, full, triptych),
  `images[]`, and one shared `caption`
- `drawings`: repeatable, each with `image`, `caption`, `drawingType`
- `featured`: boolean, controls appearance on the home page
- `order`: manual sort key

**`profile`** (singleton): `name`, `positioningStatement`, `availabilityStatus`,
`location`, `credential`, `yearsExperience`, `longBio`, `portrait`, `cvFile`, `email`,
`phone`, `socialLinks[]`.

**`experience`** (collection): `role`, `firm`, `location`, `startDate`, `endDate`,
`contributions[]`, `showOnHome`.

**`education`** (collection): `credential`, `institution`, `year`, `note`.

**`skillGroup`** (collection): `label`, `items[]`. Rendered as tags, because hiring firms
scan for specific software names.

**`award`** and **`publication`** (collections): optional. Their sections do not render
at all when empty, rather than rendering an empty heading.

**`siteSettings`** (singleton): SEO defaults, social share image.

Every image field requires alt text at the CMS level. Making it a required field is the
only reliable way to keep an image heavy site accessible once someone else is adding
content.

## 5. Technical approach

**Astro, static output, with Sanity as the CMS.**

- **Astro** ships zero JavaScript by default and includes a responsive image pipeline.
  For a site whose entire value is large architectural imagery loading fast, that
  default matters more than any framework feature. Interactive JavaScript is limited to
  three islands: the category filter, the mobile menu, and image zoom on drawings.
- **Sanity** is the recommendation over a git based CMS specifically because of images.
  Its asset pipeline handles focal point cropping, format negotiation and derivative
  sizes on its own CDN, and it gives Ahmad a genuine editing interface. The free tier
  covers a single editor comfortably. The alternative considered was Keystatic, which is
  simpler and has no third party dependency, but stores originals in the repository and
  would make a portfolio of large renders unpleasant to maintain.
- **Hosting:** Cloudflare Pages or Netlify, static, with a deploy webhook fired when
  Ahmad publishes in Sanity, so publishing rebuilds the site without his involvement.
- **Contact form:** the host's native form handling or a small serverless function, with
  a honeypot field and a timing check. No CAPTCHA: making a hiring manager solve a puzzle
  to reach him is a worse outcome than a little spam.
- **Accounts:** the Sanity project, the host account and the domain should be registered
  to Ahmad, not to an intermediary. This is his professional identity and he should not
  need anyone's cooperation to keep it online. Flagged as an action item, not a technical
  task.

## 6. Visual direction

The reference material Ahmad supplied (a SiteBuilderReport gallery of 31 architect
sites, a Lovable architect portfolio template, and Wix's architecture template
collection) converges on one genre: monochrome palettes, heavy whitespace, neutral
typography, uniform grid galleries, category filtering, and system aware dark mode.

This sits in tension with the Anthropic frontend aesthetics guidance, which warns that
converging on neutral defaults produces exactly the interchangeable result the genre is
full of. The resolution adopted here: **restraint in colour, commitment in typography
and structure.** The imagery stays dominant, but the site is identifiable rather than
template shaped, and the restraint is a decision rather than a default.

**Direction: drafting room, not gallery.** The visual language borrows from
architectural drawing conventions rather than art gallery minimalism.

- **Palette:** warm off white ground rather than pure white, near black ink, and a
  single saturated accent used only for links, focus states and metadata marks. One
  dominant neutral plus one sharp accent, never an evenly distributed palette. Dark mode
  is a full sibling theme via CSS custom properties, not an inversion filter.
- **Typography:** two families in high contrast. A distinctive text or display face for
  the name, project titles and headings, paired with a monospace for fact tables,
  captions and metadata. Monospace is idiomatic here rather than decorative: it is how
  drawings are annotated. Excluded by name: Inter, Roboto, Open Sans, Lato, system font
  stacks, and Space Grotesk. Two candidate pairings will be presented for Ahmad to
  choose from before any page is built.
- **Weight and scale:** extremes rather than adjacent steps. Light display weights
  against heavy small caps labels, and size jumps of three times or more between levels.
- **Structure:** a visible measured grid with hairline rules, wide outer margins, and
  one consistent inset margin across every page including lead images.
- **Motion:** one orchestrated page load with staggered reveals, then near silence.
  Images fade up as they enter the viewport. No scattered micro interactions. All motion
  respects `prefers-reduced-motion`.

Because no real content exists, the built preview will use licensed placeholder
architectural photography so the design can be judged honestly. Grey boxes belong in the
wireframes; a design cannot be evaluated against them.

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

1. **Typeface pairing.** Two candidates to be presented before build. Blocking the visual
   design, not the structure.
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
