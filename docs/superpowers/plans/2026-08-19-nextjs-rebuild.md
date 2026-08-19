# ahmadassi.ca Next.js Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild ahmadassi.ca as a Next.js 16 application on Cloudflare Workers so Ahmad can upload, edit, reorder and delete his own projects and media, while the public site looks unchanged to a visitor.

**Architecture:** One Next.js App Router application serves both the public site and `/admin`. Content lives in Neon Postgres reached through Cloudflare Hyperdrive with Prisma 7. Every binary lives in R2 and is uploaded by the browser directly on a presigned URL, so bytes never pass through the Worker. Public pages are statically cached in KV and invalidated by tag when Ahmad saves.

**Tech Stack:** Next.js 16.3.1, React 19.2, TypeScript 5, `@opennextjs/cloudflare` 1.20.2, wrangler 4.124.0, Prisma 7.9.1 with `@prisma/adapter-pg`, Neon Postgres, Cloudflare R2 via `@aws-sdk/client-s3`, Cloudflare Access with `jose`, Tailwind CSS 4.3.3, Radix primitives, `mediabunny` 1.55.1, Vitest, Playwright.

## Global Constraints

Every task's requirements implicitly include this section.

- **Working directory is the worktree** `/Users/hassan/ahmadassi-nextjs`, branch `nextjs-rebuild`. The Astro site on `main` stays deployable and is never modified.
- **Node >= 22.12.0.** Already declared in `package.json` engines. Do not lower it.
- **Canadian English throughout**, in code comments, user-facing copy and commit messages.
- **Never use em dashes or en dashes** anywhere, including comments and commit messages. Use commas, colons or a restructured sentence.
- **Rows store R2 object keys, never URLs.** URLs are composed at render time from `MEDIA_ORIGIN`.
- **Alt text is required on every image.** A save without it is rejected with a message on the field.
- **No secret ever reaches the client.** R2 credentials are server only. Only `NEXT_PUBLIC_*` values cross the boundary.
- **Every commit must pass** `npm run lint`, `npx tsc --noEmit` and `npm run test`.
- **Version floors, exact:** `next@^16.3.1`, `@opennextjs/cloudflare@^1.20.2`, `wrangler@^4.124.0`, `prisma@^7.9.1`, `@prisma/client@^7.9.1`, `@prisma/adapter-pg@^7.9.1`, `tailwindcss@^4.3.3`, `mediabunny@^1.55.1`, `jose@^6.2.9`.
- **Reference implementations to copy patterns from**, in `/Users/hassan/Downloads/Ahlulbayt Scouting`: `src/lib/cloudflare-r2.ts`, `src/lib/db.ts`, `src/lib/env.ts`, `src/lib/upload-policy.ts`, `proxy.ts`.
- **Source of truth for the design**, in `/Users/hassan/Ahmad Assi Website`: `src/styles/site.css` (1780 lines), `src/styles/print.css` (504 lines), `src/scripts/site.ts` (299 lines), `src/components/*.astro`, `src/layouts/Site.astro`, `src/pages/**`.

---

## File Structure

```
prisma/schema.prisma            All 15 models
src/lib/env.ts                  Environment validation, server and client split
src/lib/db.ts                   Prisma client, PrismaPg adapter, Hyperdrive aware
src/lib/r2.ts                   S3 client, presign, head, delete, key building
src/lib/media-url.ts            Object key to public URL, next/image loader
src/lib/tiers.ts                The three tier split, ported verbatim in behaviour
src/lib/upload-policy.ts        Type and size validation, shared client and server
src/lib/access.ts               Cloudflare Access JWT verification
src/lib/slug.ts                 Slug generation and collision handling
src/lib/queries.ts              Every read the public site performs
src/lib/mutations.ts            Every write the admin performs, with revalidation
proxy.ts                        Next 16 middleware, guards /admin

src/app/layout.tsx              Root shell, fonts, theme bootstrap
src/app/page.tsx                Home
src/app/architecture/page.tsx   Projects listing
src/app/work/[slug]/page.tsx    One project
src/app/resume/page.tsx         Resume
src/app/contact/page.tsx        Contact
src/app/print/page.tsx          The PDF source
src/app/not-found.tsx           404

src/components/site/            Header, Footer, ThemeToggle, HeroFilm,
                                ProjectGrid, ProjectCard, ProjectPanels,
                                Rail, Film, SkillIcon, Reveal
src/components/admin/           Dropzone, UploadQueue, SortableList,
                                ProjectForm, MediaPanel, GroupEditor,
                                MediaLibrary, ResumeForm
src/components/ui/              Radix wrapped primitives

src/app/api/uploads/presign/route.ts
src/app/api/uploads/complete/route.ts
src/app/api/media/[id]/route.ts

src/styles/tokens.css           The design tokens as Tailwind 4 @theme
src/styles/site.css             Ported component CSS
src/styles/print.css            Ported print stylesheet

scripts/migrate-content.mjs     One time import from the Astro site
```

Client behaviour from `src/scripts/site.ts` splits by responsibility rather than staying one file: theme into `ThemeToggle`, hero source selection into `HeroFilm`, expansions into `ProjectPanels`, rail buttons into `Rail`, the YouTube facade into `Film`, and scroll reveals into a `Reveal` wrapper.

---

## Phase 1: Foundation

### Task 1: Scaffold the application and prove it builds for Workers

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `wrangler.jsonc`, `open-next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/styles/globals.css`
- Delete: every Astro file, once the scaffold builds

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm run build` and `npx opennextjs-cloudflare build`

- [ ] **Step 1: Remove the Astro application, keep the content and media**

Keep `src/content/`, `src/data/`, `public/media/`, `public/cv/`, `public/portfolio/`, `media/`, `docs/`, `scripts/build-*.sh`. They are the migration input. Everything else under `src/` goes.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "ahmad-assi-website",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "cf:build": "opennextjs-cloudflare build",
    "cf:preview": "opennextjs-cloudflare preview",
    "cf:deploy": "opennextjs-cloudflare deploy",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "migrate:content": "node scripts/migrate-content.mjs"
  }
}
```

Dependencies at the versions in Global Constraints, plus `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `pg`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, the Radix packages, and the five `@fontsource-variable` packages already in the Astro `package.json`.

- [ ] **Step 3: Write `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ahmadassi",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-08-19",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "kv_namespaces": [{ "binding": "NEXT_INC_CACHE_KV", "id": "PLACEHOLDER" }],
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "PLACEHOLDER" }],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "ahmadassi-media" }]
}
```

`nodejs_compat` is not optional. Prisma, the AWS SDK and `jose` all need Node built-ins.

- [ ] **Step 4: Write `open-next.config.ts`**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
```

- [ ] **Step 5: Verify both builds pass**

Run: `npm run build && npm run cf:build`
Expected: both succeed, `.open-next/worker.js` exists.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Scaffold the Next.js application and prove it builds for Workers"
```

---

### Task 2: The database schema

**Files:**
- Create: `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db.ts`, `src/lib/env.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `db` from `src/lib/db.ts`, a `PrismaClient`
  - `getServerEnv()`, `getClientEnv()`, `isR2Configured()` from `src/lib/env.ts`
  - Models: `Media`, `Project`, `ImageGroup`, `ProjectImage`, `Drawing`, `Film`, `FilmSource`, `Profile`, `Fact`, `SocialLink`, `ExperienceEntry`, `EducationEntry`, `SkillGroup`, `Skill`, `Language`, `ResumeEntry`

- [ ] **Step 1: Write the schema**

Enums: `Tier { lead set index }`, `GroupLayout { pair full triptych }`, `ProjectCategory { Residential Cultural Commercial Academic Competition }`, `ProjectStatus { Built UnderConstruction DesignDevelopment Unbuilt Competition Academic }`, `MediaKind { image video poster document }`, `ResumeSection { volunteering awards publications exhibitions }`.

`Media` carries `key String @unique`, `contentType`, `bytes Int`, `width Int?`, `height Int?`, `durationSeconds Float?`, `originalName`, `createdAt`.

`Project` carries every field from the Astro Zod schema: `slug @unique`, `title`, `sheet`, `category`, `year Int`, `location`, `buildingType`, `area String?`, `status`, `role`, `contribution`, `summary`, `body String`, `credit`, `tier`, `order Int`, `published Boolean @default(true)`, `leadImageId`, `leadImageAlt`, `filmId String?`, timestamps.

`ProjectImage` carries `alt` and `order`; ordering and alt text belong to the arrangement, not to the file. Cascade deletes from `Project` through `ImageGroup` to `ProjectImage`.

`Film` has many `FilmSource` rows, each `mediaId` plus `height Int`, so one film is several encodes. `Film.projectId` is nullable: a film with no project is the site hero.

Index `Project` on `(tier, order)` and on `published`.

- [ ] **Step 2: Write `src/lib/db.ts`**

Copy the pattern from the reference `src/lib/db.ts`, with one change: on Workers the connection string comes from the Hyperdrive binding rather than `DATABASE_URL`, so read `getCloudflareContext().env.HYPERDRIVE?.connectionString` first and fall back to `process.env.DATABASE_URL` for local development.

- [ ] **Step 3: Run the migration and verify**

Run: `npm run db:generate && npm run db:push && npx prisma validate`
Expected: schema valid, tables created.

- [ ] **Step 4: Commit**

---

## Phase 2: Core libraries, all independently testable

These four tasks touch disjoint files and can be done in any order or in parallel.

### Task 3: `src/lib/tiers.ts`

**Files:**
- Create: `src/lib/tiers.ts`, `src/lib/tiers.test.ts`

**Interfaces:**
- Produces: `tiers<T extends { tier: Tier; order: number }>(projects: T[]): { leads: T[]; set: T[]; index: T[] }`

The behaviour is ported from `/Users/hassan/Ahmad Assi Website/src/lib/tiers.ts` and its comment explains why: a fourth project marked `lead` once vanished from the home page entirely, because it was sliced out of the leads while its tier kept it out of the strip and the index too. Nothing warned. The rule is that only three lead and the rest fall through into the set in their normal order.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { tiers } from "./tiers";

const p = (id: string, tier: "lead" | "set" | "index", order: number) => ({ id, tier, order });

describe("tiers", () => {
  it("splits into three tiers and sorts by order within each", () => {
    const r = tiers([p("c", "set", 3), p("a", "lead", 1), p("b", "set", 2)]);
    expect(r.leads.map((x) => x.id)).toEqual(["a"]);
    expect(r.set.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("takes at most three leads", () => {
    const r = tiers([1, 2, 3, 4].map((n) => p(`p${n}`, "lead", n)));
    expect(r.leads).toHaveLength(3);
  });

  it("never loses a fourth lead: it falls through into the set in order", () => {
    const r = tiers([...[1, 2, 3, 4].map((n) => p(`L${n}`, "lead", n)), p("S", "set", 2)]);
    expect(r.leads.map((x) => x.id)).toEqual(["L1", "L2", "L3"]);
    expect(r.set.map((x) => x.id)).toEqual(["S", "L4"]);
    const all = [...r.leads, ...r.set, ...r.index];
    expect(all).toHaveLength(5);
  });

  it("returns empty tiers for an empty input", () => {
    expect(tiers([])).toEqual({ leads: [], set: [], index: [] });
  });
});
```

- [ ] **Step 2: Run and watch it fail.** `npx vitest run src/lib/tiers.test.ts`
- [ ] **Step 3: Implement, porting the original.**
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 4: `src/lib/r2.ts` and `src/lib/media-url.ts`

**Files:**
- Create: `src/lib/r2.ts`, `src/lib/media-url.ts`, `src/lib/media-url.test.ts`, `src/lib/r2.test.ts`

**Interfaces:**
- Produces:
  - `buildObjectKey(prefix: string, fileName: string): string`
  - `getSignedUploadUrl(args: { key: string; contentType: string; expiresIn?: number }): Promise<string>`
  - `headObject(key: string): Promise<{ bytes: number; contentType: string } | null>`
  - `deleteObject(key: string): Promise<void>`
  - `mediaUrl(key: string): string`
  - `imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }): string`

`buildObjectKey` sanitises exactly as the reference `sanitizeFileName` does, then prefixes with a timestamp and a UUID so two files of the same name never collide.

`imageLoader` targets Cloudflare Image Transformations, because `next/image` cannot optimise on Workers:

```ts
export function imageLoader({ src, width, quality }: ImageLoaderProps) {
  const params = `width=${width},format=auto,quality=${quality ?? 82}`;
  return `${MEDIA_ORIGIN}/cdn-cgi/image/${params}/${src.replace(/^\//, "")}`;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
describe("buildObjectKey", () => {
  it("lowercases, replaces whitespace and strips unsafe characters", () => {
    const key = buildObjectKey("projects/lincoln", "Lincoln Beach  RENDER (final)!.JPG");
    expect(key).toMatch(/^projects\/lincoln\/\d+-[0-9a-f-]{36}-lincoln-beach-renderfinal\.jpg$/);
  });

  it("never produces an empty file name", () => {
    expect(buildObjectKey("p", "!!!.")).toMatch(/-file$|-\.$|file/);
  });

  it("gives two identical names two different keys", () => {
    expect(buildObjectKey("p", "a.jpg")).not.toEqual(buildObjectKey("p", "a.jpg"));
  });
});

describe("mediaUrl", () => {
  it("joins the origin and the key without doubling the slash", () => {
    expect(mediaUrl("projects/a.jpg")).toBe("https://media.ahmadassi.ca/projects/a.jpg");
    expect(mediaUrl("/projects/a.jpg")).toBe("https://media.ahmadassi.ca/projects/a.jpg");
  });
});

describe("imageLoader", () => {
  it("builds a Cloudflare Image Transformations URL", () => {
    expect(imageLoader({ src: "projects/a.jpg", width: 1600 }))
      .toBe("https://media.ahmadassi.ca/cdn-cgi/image/width=1600,format=auto,quality=82/projects/a.jpg");
  });
});
```

- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement, copying the S3 client shape from the reference `cloudflare-r2.ts`.**
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 5: `src/lib/upload-policy.ts`

**Files:**
- Create: `src/lib/upload-policy.ts`, `src/lib/upload-policy.test.ts`

**Interfaces:**
- Produces:
  - `MAX_IMAGE_BYTES = 64 * 1024 * 1024`
  - `MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024`
  - `MAX_DOCUMENT_BYTES = 32 * 1024 * 1024`
  - `validateUpload(args: { name: string; size: number; type: string }): { ok: true; kind: MediaKind; contentType: string } | { ok: false; error: string }`
  - `formatBytes(n: number): string`

The image ceiling is 64MB deliberately: the largest file Ahmad has sent is a 39.6MB site map at 7200x4800, and the point of this rebuild is that he no longer has to think about size. Cloudflare Image Transformations serve the derivative, so the master being large costs a visitor nothing.

Video accepts up to 4GB because it is transcoded in the browser before upload, so the ceiling applies to what he selects, not to what is stored.

- [ ] **Step 1: Write the failing tests** covering: a 39MB JPEG accepted, a 70MB JPEG rejected naming the limit, a `.exe` rejected, an empty file rejected, an unnamed file rejected, a `.mov` accepted as video, and a mismatched extension and MIME type rejected.
- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement, following the reference `upload-policy.ts` shape.**
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit.**

---

### Task 6: `src/lib/access.ts` and `proxy.ts`

**Files:**
- Create: `src/lib/access.ts`, `src/lib/access.test.ts`, `proxy.ts`

**Interfaces:**
- Produces:
  - `verifyAccessJwt(token: string): Promise<{ email: string; sub: string } | null>`
  - `requireAdmin(): Promise<{ email: string }>` which throws a redirect when there is no valid assertion
  - `proxy(request: NextRequest)` guarding every path under `/admin` and `/api`

Cloudflare Access puts the assertion in the `Cf-Access-Jwt-Assertion` header. `jose` verifies it against the team's key set at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, checking both the audience tag and the issuer.

This is defence in depth rather than the only gate: Access already refuses the request at the edge. It exists so that a misconfigured Access policy fails closed instead of opening the administration area to the internet. Say so in the comment.

`ACCESS_DEV_BYPASS=true` skips verification for local development only, and `src/lib/access.ts` throws at module load if that variable is set while `NODE_ENV === "production"`.

- [ ] **Step 1: Write the failing tests** covering: a valid token returning the email, an expired token returning null, a wrong audience returning null, a malformed token returning null, and the production bypass guard throwing.
- [ ] **Step 2: Run and watch it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and watch it pass.**
- [ ] **Step 5: Commit.**

---

## Phase 3: The design system port

### Task 7: Tokens, fonts and the ported stylesheets

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/site.css`, `src/styles/print.css`, `src/app/globals.css`
- Read: `/Users/hassan/Ahmad Assi Website/src/styles/site.css` and `print.css`

**Interfaces:**
- Produces: every class the site components use, and the CSS custom properties `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-2`, `--invert-ink`, `--scrim`, `--display`, `--prose`, `--data`, `--t-hero`, `--t-title`, `--t-section`, `--t-lead`, `--t-body`, `--t-data`, `--pad`, `--ease`

The port is faithful, which means the 1780 lines are moved rather than rewritten as utilities. Tailwind 4 `@theme` exposes the same tokens so utilities and authored CSS resolve identically:

```css
@import "tailwindcss";

@theme {
  --color-paper: #ffffff;
  --color-ink: #0b0b0b;
  --font-display: "Big Shoulders Display Variable", sans-serif;
  --font-prose: "Archivo Variable", sans-serif;
}
```

Light stays the default and dark is `:root[data-theme="dark"]`, exactly as today. Both typefaces stay self hosted through `@fontsource-variable`, so no request leaves the visitor's browser.

- [ ] **Step 1: Copy `site.css` and `print.css` across unchanged.**
- [ ] **Step 2: Add the `@theme` block mirroring the token values.**
- [ ] **Step 3: Verify no token is defined twice with different values.** `npm run build`
- [ ] **Step 4: Commit.**

---

### Task 8: The root layout, header, footer and theme toggle

**Files:**
- Create: `src/app/layout.tsx`, `src/components/site/Header.tsx`, `src/components/site/Footer.tsx`, `src/components/site/ThemeToggle.tsx`, `src/components/site/Reveal.tsx`
- Read: `/Users/hassan/Ahmad Assi Website/src/layouts/Site.astro`, `src/scripts/site.ts` sections 1 and 5

**Interfaces:**
- Consumes: `getProfile()` from Task 12
- Produces: `<Header />`, `<Footer hideCta?: boolean />`, `<ThemeToggle />`, `<Reveal as?: string className?: string>`

The theme must be set before first paint or the page flashes the wrong one. That is an inline script in `<head>` today and stays one, as a `<script dangerouslySetInnerHTML>` in the layout. It reads `localStorage`, sets `document.documentElement.dataset.theme`, and adds the `js` class.

`Reveal` is a client component wrapping the `IntersectionObserver` behaviour from section 5 of `site.ts`, including the branch that adds `is-in` immediately when reduced motion is set or the observer is missing.

- [ ] **Step 1: Port the layout markup**, keeping `lang="en-CA"`, the skip link, the canonical link and the Open Graph tags.
- [ ] **Step 2: Port the theme script and `ThemeToggle`.**
- [ ] **Step 3: Port `Reveal`.**
- [ ] **Step 4: Verify** the toggle flips `data-theme`, persists across a reload, and never flashes.
- [ ] **Step 5: Commit.**

---

### Task 9: `HeroFilm`, `Film` and `SkillIcon`

**Files:**
- Create: `src/components/site/HeroFilm.tsx`, `src/components/site/Film.tsx`, `src/components/site/SkillIcon.tsx`
- Read: the three matching `.astro` files and sections 2 and 4 of `site.ts`

**Interfaces:**
- Produces:
  - `<HeroFilm eyebrow name surname intro ctaLabel ctaHref sources={{ large: string; small: string }} poster={string} />`
  - `<Film sources={{ height: number; url: string }[]} youtube?: string poster: string caption?: string />`
  - `<SkillIcon name: string />`

Three behaviours are load bearing and must survive the port. Each has a comment in the original explaining why, and the reason moves with the code:

1. **The hero source is attached in an effect, never in the markup.** Setting `src` in JSX would start the download before the right encode is chosen.
2. **The source choice is made on layout width in CSS pixels, not multiplied by `devicePixelRatio`.** Multiplying pushed a phone held sideways past the threshold and pulled 42.8MB over cellular.
3. **The `IntersectionObserver` that pauses the hero has a `seen` guard.** The first callback can report `isIntersecting: false` while layout settles, which paused the film microseconds after `play()` began and made autoplay look intermittent. Never pause something that has not been visible yet.

`Film` keeps the click to load YouTube facade. No iframe is created until the visitor presses play, so nothing is requested from Google and no cookie is set for a visitor who never watches.

`SkillIcon` ports all nine glyphs plus the initials fallback.

- [ ] **Step 1: Port `HeroFilm` with all three behaviours and their comments.**
- [ ] **Step 2: Port `Film`.**
- [ ] **Step 3: Port `SkillIcon`.**
- [ ] **Step 4: Verify** the hero autoplays, the correct encode is chosen at 1199 and 1201 CSS pixels, and the film does not pause on load.
- [ ] **Step 5: Commit.**

---

### Task 10: `ProjectCard`, `ProjectGrid`, `Rail` and `ProjectPanels`

**Files:**
- Create: `src/components/site/ProjectCard.tsx`, `ProjectGrid.tsx`, `Rail.tsx`, `ProjectPanels.tsx`
- Read: the matching `.astro` files and sections 3 and 3b of `site.ts`

**Interfaces:**
- Consumes: `tiers()` from Task 3, `ProjectSummary` from Task 12
- Produces: `<ProjectGrid projects: ProjectSummary[] />`

Two behaviours are load bearing:

1. **The rail has no drag to scroll.** It is a native scroll container, so trackpad, touch and keyboard all work with no JavaScript. The two buttons exist only for a mouse with no horizontal wheel. Capturing the pointer to fake dragging is what stopped the cards being clickable the last time this was a rail. Do not add it back.
2. **Expansions are progressive enhancement.** Panels render server side and closed, the tile stays a real link, and a modified click (new tab, download) is left alone. Escape closes and returns focus to the trigger. The deep link `#panel-<slug>` opens that project.

The card shows the place, not the postal address: a first segment starting with a street number is dropped, so `13904 Hayne Boulevard, New Orleans, Louisiana` reads as `New Orleans, Louisiana`.

- [ ] **Step 1: Port `ProjectCard`,** using `next/image` with the custom loader from Task 4.
- [ ] **Step 2: Port `ProjectGrid` and `ProjectPanels`.**
- [ ] **Step 3: Port `Rail`,** buttons disabling at each end, stepping by one card plus its gap.
- [ ] **Step 4: Verify** keyboard navigation, Escape, the deep link, and that a fourth lead appears in the strip.
- [ ] **Step 5: Commit.**

---

## Phase 4: The public pages

### Task 11: Queries

**Files:**
- Create: `src/lib/queries.ts`, `src/lib/slug.ts`, `src/lib/slug.test.ts`

**Interfaces:**
- Produces:
  - `getPublishedProjects(): Promise<ProjectSummary[]>`
  - `getProjectBySlug(slug: string): Promise<ProjectDetail | null>`
  - `getProjectSlugs(): Promise<string[]>`
  - `getAdjacentProjects(slug: string): Promise<{ prev: ProjectSummary; next: ProjectSummary }>`
  - `getProfile(): Promise<ProfileWithRelations>`
  - `getHeroFilm(): Promise<FilmWithSources | null>`
  - `toSlug(title: string): string`, `uniqueSlug(base: string, taken: string[]): string`
  - Types `ProjectSummary`, `ProjectDetail`, `ProfileWithRelations`, `FilmWithSources`

Every query is tagged with `unstable_cache` under `project:<slug>`, `projects`, `profile` or `hero`, so a write can invalidate precisely what changed.

`getAdjacentProjects` wraps around, which is what the Astro `getStaticPaths` does today with the modulo.

- [ ] **Step 1: Write failing tests for `toSlug` and `uniqueSlug`,** covering accents, punctuation, leading and trailing hyphens, empty input, and a collision producing `-2` rather than overwriting.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `slug.ts` and `queries.ts`.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit.**

---

### Task 12: The seven public routes

**Files:**
- Create: `src/app/page.tsx`, `src/app/architecture/page.tsx`, `src/app/work/[slug]/page.tsx`, `src/app/resume/page.tsx`, `src/app/contact/page.tsx`, `src/app/print/page.tsx`, `src/app/not-found.tsx`
- Read: the matching `.astro` pages

**Interfaces:**
- Consumes: everything from Tasks 8 through 11

Each page ports its Astro counterpart markup for markup. `generateStaticParams` on `/work/[slug]` replaces `getStaticPaths`. `generateMetadata` replaces the title and description props.

The resume page keeps its "At a glance" block, which is four hand written categories rather than data, because a reader scans before they read. Those four blocks become `Fact` rows so Ahmad can edit them, but the layout does not change.

The contact page keeps having no form, for the reason already recorded: Cloudflare has nothing that accepts a submission without a third party service, and markup that silently posts nowhere is worse than none.

- [ ] **Step 1: Port the home page.**
- [ ] **Step 2: Port `/architecture` and `/work/[slug]`.**
- [ ] **Step 3: Port `/resume` and `/contact`.**
- [ ] **Step 4: Port `/print` and the 404.**
- [ ] **Step 5: Verify** every route renders and `npm run build` reports the expected page count.
- [ ] **Step 6: Commit.**

---

## Phase 5: The administration area

### Task 13: UI primitives

**Files:**
- Create: `src/components/ui/{button,input,textarea,select,label,dialog,dropdown-menu,tabs,toast,progress,badge,skeleton,confirm-dialog}.tsx`, `src/lib/utils.ts`

**Interfaces:**
- Produces: `cn(...inputs)` and the shadcn style components above

Copy the shape of the reference project's `src/components/ui`. The administration area is a working tool rather than a showcase, so these stay plain: Tailwind utilities, Radix behaviour, no bespoke CSS.

- [ ] **Step 1: Write `cn` and the primitives.**
- [ ] **Step 2: Verify** with a scratch page rendering each one.
- [ ] **Step 3: Commit.**

---

### Task 14: The upload pipeline, server side

**Files:**
- Create: `src/app/api/uploads/presign/route.ts`, `src/app/api/uploads/complete/route.ts`, `src/app/api/media/[id]/route.ts`

**Interfaces:**
- Consumes: `validateUpload`, `buildObjectKey`, `getSignedUploadUrl`, `headObject`, `deleteObject`, `requireAdmin`
- Produces:
  - `POST /api/uploads/presign` taking `{ files: { name, size, type }[], prefix }` and returning `{ uploads: { key, url, name }[] }`
  - `POST /api/uploads/complete` taking `{ key, name, width?, height?, durationSeconds? }` and returning the created `Media`
  - `DELETE /api/media/[id]` returning 409 with the referencing rows when the file is still in use

`complete` issues a `HeadObject` before writing the row. An upload that failed halfway must never leave a `Media` row pointing at nothing.

`DELETE` is reference aware. It counts `ProjectImage`, `Drawing`, `FilmSource`, `Project.leadImageId` and the `Profile` file columns, and refuses while any exist, naming what still uses the file. Only when nothing refers to it are the object and the row both removed, object first, so a failed delete leaves a row rather than an orphaned object.

- [ ] **Step 1: Write failing tests** for: presign rejecting an oversized file, presign requiring authentication, complete refusing a key that is not in R2, delete refusing a referenced file with 409, and delete removing an unreferenced one.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement the three routes.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit.**

---

### Task 15: Browser side video transcoding

**Files:**
- Create: `src/lib/transcode.ts`, `src/lib/transcode.test.ts`

**Interfaces:**
- Produces:
  - `canTranscode(): boolean`
  - `transcodeVideo(file: File, onProgress: (fraction: number) => void): Promise<{ encodes: { height: 1440 | 720; blob: Blob }[]; poster: Blob; durationSeconds: number }>`

`mediabunny` reads the file, decodes it, re-encodes at 1440p and 720p, and muxes MP4 out. The poster frame is taken at two seconds in, or at the midpoint for anything shorter.

`canTranscode` checks for `window.VideoEncoder` and `window.VideoDecoder`. Firefox cannot encode, so where the check fails the dropzone refuses video and names the browsers that work. It must never silently accept an unencoded 4K file: that failure is invisible until a visitor on a phone pays for it.

The two heights match what `scripts/build-hero.sh` produces today, so the encodes the site already serves and the ones Ahmad makes from now on are the same shape.

- [ ] **Step 1: Write failing tests** for `canTranscode` returning false when `VideoEncoder` is absent, and for the poster timestamp choice on a one second clip.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit.**

---

### Task 16: The dropzone and upload queue

**Files:**
- Create: `src/components/admin/Dropzone.tsx`, `src/components/admin/UploadQueue.tsx`, `src/hooks/use-uploads.ts`

**Interfaces:**
- Consumes: Tasks 14 and 15
- Produces: `<Dropzone accept="image" | "video" | "any" prefix={string} onUploaded={(media: Media[]) => void} />`, and `useUploads()` returning `{ items, add, retry, remove }`

The whole point of the rebuild, so it has to be good:

1. Drop many files at once, or click to choose. The drop target covers the panel, not a small strip.
2. Validate immediately and show the reason on the file that failed, keeping the rest of the batch.
3. Transcode video first, with its own progress, since it takes longer than the upload.
4. Request presigned URLs for the whole batch in one call.
5. `PUT` straight to R2 with `XMLHttpRequest` so upload progress is real rather than indeterminate.
6. Call `complete`, then hand the `Media` rows to the parent.
7. A failed file can be retried on its own without restarting the batch.

Paste from the clipboard works as well as dropping, because that is how someone moves one render out of an email.

- [ ] **Step 1: Build `useUploads` with the state machine:** `queued`, `transcoding`, `uploading`, `finishing`, `done`, `failed`.
- [ ] **Step 2: Build `Dropzone` and `UploadQueue`.**
- [ ] **Step 3: Verify** by dropping twenty images at once and one video, watching per file progress, and forcing one failure to confirm the rest survive.
- [ ] **Step 4: Commit.**

---

### Task 17: Sortable lists

**Files:**
- Create: `src/components/admin/SortableList.tsx`, `src/components/admin/SortableList.test.tsx`

**Interfaces:**
- Produces: `<SortableList items={T[]} getId={(t) => string} onReorder={(ids: string[]) => void} renderItem={(t, handle) => ReactNode} />`

Native HTML drag and drop, with keyboard equivalents on the handle: `ArrowUp` and `ArrowDown` move the item, `Home` and `End` send it to either end, and a live region announces the new position. Keyboard support is not optional here. It is both the accessible answer and the reason the original site refused to capture the pointer to fake dragging.

- [ ] **Step 1: Write failing tests** for reordering by keyboard, for the announcement text, and for `onReorder` receiving the full new order.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit.**

---

### Task 18: Mutations

**Files:**
- Create: `src/lib/mutations.ts`, `src/lib/validation.ts`, `src/lib/validation.test.ts`

**Interfaces:**
- Produces server actions: `saveProject`, `createProject`, `deleteProject`, `reorderProjects`, `setProjectTier`, `saveImageGroup`, `reorderGroupImages`, `deleteImageGroup`, `saveProfile`, `saveResumeSection`
- Produces: `projectSchema`, `profileSchema` and `type FieldErrors = Record<string, string>`

Every rule the Astro Zod schema enforces at build time is enforced here at save time, and each returns a message against the field rather than a build log entry:

| Rule | Message |
| --- | --- |
| Alt text on every image | `Alt text is required. It is what a screen reader announces.` |
| `credit` present | `Say who did the work. A portfolio that does not distinguish solo work from group work is misleading.` |
| `sheet` matches `^A-\d{3}$` | `Sheet numbers look like A-101.` |
| A film has a source or a YouTube id | `A film needs either an uploaded file or a YouTube id.` |

Every mutation calls `revalidateTag` for what it touched, so Ahmad sees his change within seconds without the site querying the database on every visit.

`setProjectTier` returns a warning, not an error, when a fourth project is marked `lead`: the extra one falls through into the strip. Today that happens silently, which is the bug `tiers.ts` exists to contain. The administration area says so out loud.

- [ ] **Step 1: Write failing tests** for each validation rule and for the fourth lead warning.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit.**

---

### Task 19: The administration screens

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/projects/[id]/page.tsx`, `src/app/admin/projects/new/page.tsx`, `src/app/admin/media/page.tsx`, `src/app/admin/resume/page.tsx`, `src/app/admin/settings/page.tsx`
- Create: `src/components/admin/{ProjectForm,MediaPanel,GroupEditor,MediaLibrary,ResumeForm}.tsx`

**Interfaces:**
- Consumes: Tasks 13 through 18

| Screen | What Ahmad does |
| --- | --- |
| `/admin` | Every project as a row with its thumbnail. Drag to reorder, change tier, publish or unpublish, delete with confirmation |
| `/admin/projects/[id]` | Every field on the left, media on the right. Drop files, group them as pair, full or triptych, drag to reorder groups and images, set the lead image, attach a film |
| `/admin/media` | The whole library with a usage count on each file, and a delete that refuses while anything still uses it |
| `/admin/resume` | Profile, facts, experience, education, skills, languages, community, contact details, all reorderable |
| `/admin/settings` | The hero film and its two encodes, and the site level copy |

`/admin` is a server component reading through `queries.ts`. The forms are client components calling the server actions from Task 18. Saving is optimistic with a toast, and reverts on failure.

- [ ] **Step 1: Build the layout and `/admin`.**
- [ ] **Step 2: Build the project editor and media panel.**
- [ ] **Step 3: Build the media library.**
- [ ] **Step 4: Build the resume and settings screens.**
- [ ] **Step 5: Verify** the whole loop: create a project, drop images, group them, reorder, save, and see it on the public page.
- [ ] **Step 6: Commit.**

---

## Phase 6: Migration and verification

### Task 20: The migration script

**Files:**
- Create: `scripts/migrate-content.mjs`

**Interfaces:**
- Consumes: `src/content/projects/*.md`, `src/data/resume.json`, `public/media/**`
- Produces: a populated database and bucket

1. Parse the 18 markdown files, frontmatter and body.
2. Upload the 298 images from `public/media/` to R2 under `projects/<slug>/`, skipping any key that already exists so a re-run is cheap.
3. Match the three films already in the bucket by key rather than re-uploading them.
4. Read image dimensions so `Media.width` and `Media.height` are populated.
5. Write every row: projects, groups, images, drawings, films, and the whole resume.
6. **Verify before reporting success:** every `Media` row resolves to an object that exists, every project has a lead image, every image has alt text, and the count matches the source.

Idempotent, so it can be run against a fresh database at any time.

- [ ] **Step 1: Write the script.**
- [ ] **Step 2: Run it against a scratch database.**
- [ ] **Step 3: Verify** 18 projects, 298 media rows, 3 films, and every check passing.
- [ ] **Step 4: Commit.**

---

### Task 21: End to end tests

**Files:**
- Create: `playwright.config.ts`, `e2e/{public,admin,upload}.spec.ts`

Cover the paths that are tedious by hand and expensive to get wrong:

- every public route returns 200 and has exactly one `h1`
- `/admin` redirects an unauthenticated visitor
- drop an image, watch it upload, see it on the public page
- reorder two projects and see the new order on the home page
- delete a project and confirm the page 404s
- mark a fourth project as `lead` and confirm it appears in the strip rather than vanishing
- a media file in use refuses to delete and names what uses it

- [ ] **Step 1: Write the configuration and the public spec.**
- [ ] **Step 2: Write the admin and upload specs.**
- [ ] **Step 3: Run the suite and watch it pass.**
- [ ] **Step 4: Commit.**

---

### Task 22: Documentation and deployment

**Files:**
- Modify: `README.md`, `docs/EDITING.md`
- Create: `.env.example`

`docs/EDITING.md` is rewritten for Ahmad rather than for a developer. It is now a short document about a website he edits in a browser, not a repository he edits as files.

`README.md` records the stack, the environment variables, the Cloudflare Access configuration, the Hyperdrive and KV bindings, and how to deploy. It also fixes two things that are currently wrong:

1. It describes `src/lib/drawing.ts` and a generated SVG line work fallback. That file does not exist and the feature is gone.
2. Its "Still to do" list is stale in several places now that this rebuild closes those items, including the responsive image derivatives trade off.

- [ ] **Step 1: Rewrite `docs/EDITING.md` for Ahmad.**
- [ ] **Step 2: Rewrite `README.md`.**
- [ ] **Step 3: Write `.env.example` with every variable and a comment on each.**
- [ ] **Step 4: Commit.**

---

## Self-Review

**Spec coverage.** Every section of `docs/superpowers/specs/2026-08-19-nextjs-rebuild-design.md` maps to a task: architecture to Tasks 1 and 2, the image loader to Task 4, the data model to Task 2, the save time rules to Task 18, the upload pipeline to Tasks 14 through 16, browser support to Task 15, reference aware deletion to Task 14, the administration area to Task 19, Access to Task 6, the design port to Tasks 7 through 10 and 12, migration to Task 20, testing to Tasks 3 through 6 and 21, and the two documentation corrections to Task 22.

**Type consistency.** `tiers()` is used with the same signature in Tasks 3, 10 and 18. `Media` is the return type of `/api/uploads/complete` in Task 14 and the argument to `onUploaded` in Task 16. `validateUpload` returns the same discriminated union in Tasks 5, 14 and 16. `buildObjectKey` and `mediaUrl` keep the same signatures in Tasks 4, 14 and 20.

**Out of scope, as decided in the spec:** no page builder, no contact form, no multi user editing, no automatic PDF rebuild.
