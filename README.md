# Ahmad Assi, architectural designer

Portfolio website. An online resume first and a project gallery second, with an
editing area Ahmad uses himself.

> **All content is Ahmad's own or is credited.** Sixteen projects span
> professional work, independent commissions and coursework from first through
> fourth year.
>
> **Crediting is deliberate and specific.** Much of the academic work is group
> work, and each page names the collaborators. Sts. Peter and Paul Church is a
> Muzaiko Architecture project, included with permission and credited to them.
> The Jacobs House and Schindler pages are studies of other architects'
> buildings and say so.
>
> Nothing on the site is stock.

## What this is

| | |
| --- | --- |
| Framework | Next.js 16, App Router, React 19, TypeScript |
| Hosting | Cloudflare Workers, through `@opennextjs/cloudflare` |
| Database | Neon Postgres, reached through Cloudflare Hyperdrive |
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| Files | Cloudflare R2, uploaded straight from the browser on presigned URLs |
| Sign in | Cloudflare Access, at the edge |
| Styling | Tailwind 4 for the editing area, authored CSS for the public site |
| Video | Compressed in the browser with `mediabunny`, before upload |
| Page cache | Cloudflare KV, through the OpenNext incremental cache |

Everything except the database is on one Cloudflare account, which is also where
the domain and the bucket already were. R2 charges no egress.

**This replaced an Astro static site**, and the reason was Ahmad. Every change
to the old site was a commit, so every change needed a developer. The design,
the content model and the three tier layout all came across; the way content
gets in did not.

## Running it

```bash
npm install
```

Copy `.env.example` to `.env` and fill it in. At a minimum you need
`DATABASE_URL`; set `ACCESS_DEV_BYPASS="true"` locally so `/admin` opens without
a Cloudflare tunnel.

```bash
npm run dev
```

http://localhost:3000, with `/admin` open.

```bash
npm run build
```

**The build needs a reachable database.** Every page is rendered from Postgres,
so `npm run build` checks the connection first and stops with a readable message
if it cannot get one. That is deliberate: a build that skipped the missing
content would publish an empty portfolio and cache it, which is worse than not
deploying.

| | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build, database checked first |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run cf:build` | The build that produces a deployable Worker |
| `npm run cf:deploy` | Deploy to Cloudflare |
| `npm run db:push` | Push the schema to the database |
| `npm run migrate:content` | Import the original markdown and media |

`npm run cf:build` is the one that matters before a deploy. `next build` can
succeed while it fails.

## Editing content

In a browser, at `/admin`. See [docs/EDITING.md](docs/EDITING.md), which is
written for Ahmad rather than for a developer.

## Deploying

Cloudflare Workers. The step by step version is in
[docs/DEPLOYING.md](docs/DEPLOYING.md); this is the summary.

**Bindings**, all in `wrangler.jsonc` and all needing real ids before the first
deploy:

| Binding | What it is |
| --- | --- |
| `HYPERDRIVE` | Pools the Neon connection. `wrangler hyperdrive create` |
| `NEXT_INC_CACHE_KV` | The rendered page cache. `wrangler kv namespace create` |
| `MEDIA_ORIGIN` | The bucket's public origin, read by the server at runtime |

`NEXT_PUBLIC_MEDIA_ORIGIN` must be set to the same origin **in the environment
the build runs in**, not as a Worker variable. Next inlines every
`NEXT_PUBLIC_` value into the browser bundle at build time, so one set on the
Worker arrives too late to have any effect and the browser keeps whatever was
compiled in.

**`media.ahmadassi.ca` does not exist yet.** The bucket is real and holds the
three films, but it is still only reachable at its `pub-….r2.dev` address, which
Cloudflare says not to use in production. Attach a custom domain to the bucket
before the first deploy, and upload the images: the migration has only been run
with `--skip-upload` so far.

**Secrets**, set with `wrangler secret put`, never committed:
`CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`,
`CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `DATABASE_URL`,
`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.

**Cloudflare Access** protects `/admin` and `/api`. Create a self hosted
application in Zero Trust covering those paths, add Ahmad and whoever else needs
in, and copy the application audience tag into `CF_ACCESS_AUD`. Access refuses an
unauthenticated request before it reaches the Worker; the application verifies
the assertion again itself, so a misconfigured policy fails closed.

`ACCESS_DEV_BYPASS` must never be set in production. The application throws on
the first identity read if it is, rather than letting anyone in.

## How it fits together

Three stores, each with one job:

- **Postgres** holds all content.
- **R2** holds every binary: images, video encodes, poster frames, PDFs.
- **KV** holds rendered pages.

**Rows store the R2 object key, never a URL.** URLs are composed at render time
from `MEDIA_ORIGIN`, so moving the bucket or its domain is one variable rather
than a migration over every row.

**Uploads go from the browser straight to R2** on a presigned URL. The bytes
never pass through the Worker, which is what makes file size a non issue: the
25 MiB published asset ceiling that shaped every media decision in the old site
does not apply at all.

**Images** are served through Cloudflare Image Transformations, via a custom
`next/image` loader, because Next's own optimiser does not run on Workers. One
39MB upload becomes whatever size the layout asks for, in AVIF or WebP.

**Video** is compressed in the browser before it uploads, by `mediabunny`, into
1440p and 720p with a poster frame. Workers cannot run ffmpeg, and there is no
Cloudflare Image Transformations for video, so without this every visitor would
download whatever Ahmad exported.

**Pages are statically rendered and held in KV.** A save revalidates the paths it
changed, so Ahmad sees his edit in seconds and a visitor never causes a database
query.

### Where things live

| Path | What it is |
| --- | --- |
| `prisma/schema.prisma` | Sixteen models. The content model |
| `src/lib/queries.ts` | Every read the public site performs |
| `src/lib/admin-queries.ts` | Every read the editing area performs |
| `src/lib/mutations.ts` | Every write, with its revalidation |
| `src/lib/validation.ts` | The content rules, checked on save |
| `src/lib/tiers.ts` | The three tier split, and the three lead rule |
| `src/lib/r2.ts` | Presigned uploads, downloads, deletes |
| `src/lib/transcode.ts` | Browser side video compression |
| `src/lib/access.ts` | Cloudflare Access verification |
| `src/styles/site.css` | The public design system. Every colour and size |
| `src/styles/print.css` | The portfolio PDF. Sheets, not a scrolling page |
| `src/app/(site)/` | The public pages |
| `src/app/(print)/` | The PDF source, on its own root layout |
| `src/app/(admin)/` | The editing area |
| `scripts/migrate-content.mjs` | The one time import from markdown |

Three route groups because there are three root layouts. `/print` loading the
site's stylesheet put Tailwind's preflight into the portfolio PDF and took the
bullets off the resume sheet.

## The design

Black and white only. No accent colour: emphasis comes from weight, scale, rule
and inversion. Colour belongs to the photographs, and Ahmad's renders bring
plenty. Light is the default because architectural imagery reads best on white;
dark is one click away.

Two typefaces, both self hosted so no request leaves the visitor's browser: Big
Shoulders Display for display lettering, Archivo for everything else.

- **Projects follow the Foster + Partners studio pattern.** The image sits flush
  at the top of a panel and the panel carries the title, a round arrow and one
  line of year and place. Nothing is laid over the image.
- **The front film** is Ahmad's Lincoln Beach walkthrough, muted and looping. Two
  encodes, chosen at runtime: 1440p for laptops and desktops, 720p for phones,
  slow connections and anyone asking to save data.
- **Nothing is embedded from a third party.** No analytics, no external fonts, no
  external images. A film too large to self host can use a YouTube facade that
  loads nothing until the visitor presses play.
- **Projects are in three tiers**, and the strip is a native scroll container, so
  trackpad, touch and keyboard work with no JavaScript. There is deliberately no
  drag to scroll: capturing the pointer to fake dragging is what once stopped the
  cards being clickable at all.
- **Every card says who did the work.** Required, because a portfolio that does
  not distinguish solo work from group work is misleading.

## Accessibility

WCAG 2.2 AA contrast in both themes, one `h1` per page, semantic headings, a skip
link, visible focus throughout, Escape closing the menu and the project panels
with focus returned, and reduced motion respected everywhere except the hero
film, which autoplays by explicit request.

In the editing area: every reorder handle works from the keyboard with a live
region announcing the new position, every field has a real label, and every error
is announced rather than only shown.

Alt text is required on every image and the save is refused without it.

## Still to do

1. **Register the accounts in Ahmad's own name.** The host and the domain should
   be his, so keeping the site online never depends on anyone else.
2. **Playwright coverage.** The unit tests are thorough; the browser paths are
   not covered yet.
3. **Automatic PDF rebuild.** `npm run portfolio` still needs a machine with
   Node, Chrome and ffmpeg.

### What still needs Ahmad

1. **Sts. Peter and Paul Church is deliberately not published.** The design
   development set is the copyright of **Muzaiko Architecture**, is drawn by
   "P.A." rather than by him, and carries an explicit notice forbidding
   reproduction without written permission. Before any of it goes online we need
   to know what his role actually was, and the Muzaiko sheets need their
   permission.
2. **Confirm "Dave's House" is La Casa Aranas.** The drawings in that folder
   describe the house his CV names, so they were merged into that project.
3. **Two dates are inferred**, not stated: the Lincoln Beach and La Casa Aranas
   years both come from his graduation year.
4. **A portrait**, if he wants one. There is no photograph of him in anything
   supplied.
