# Deploying

Everything below is one time setup. After it, deploying is `npm run cf:deploy`.

Nothing here can be done from this repository: it all needs the Cloudflare and
Neon accounts. The steps are in dependency order, so following them top to
bottom works.

---

## Before anything else

**Register the accounts in Ahmad's own name.** Cloudflare, Neon, and the domain.
Keeping the site online should never depend on anyone else's account. If they
are set up under someone else's login now, moving them later is a migration; at
this point it is a signup form.

---

## 1. The database

Neon, free tier, which comfortably fits a portfolio.

1. Create a project. Any region close to your visitors.
2. Copy the **pooled** connection string. It ends in `?sslmode=require`.
3. Push the schema:

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

4. Create a Hyperdrive configuration in front of it, so a Worker that lives for
   one request does not open a new Postgres connection every time:

```bash
npx wrangler hyperdrive create ahmadassi-db --connection-string="postgresql://..."
```

Put the id it prints into `wrangler.jsonc`, replacing `PLACEHOLDER_HYPERDRIVE_ID`.

---

## 2. The page cache

```bash
npx wrangler kv namespace create NEXT_INC_CACHE_KV
```

Put the id into `wrangler.jsonc`, replacing `PLACEHOLDER_KV_ID`.

### Or do steps 1 and 2 in one command

Once you have logged in and created the Neon project, this creates both
resources and writes both ids into `wrangler.jsonc` for you:

```bash
npm run provision -- "postgresql://user:pass@host/db?sslmode=require"
```

It refuses to run if you are not logged in, because every step below fails in a
different confusing way without it and none of them says so.

---

## 3. The bucket, and its domain

The bucket already exists and already holds the three films under a `media/`
prefix. Two things are missing.

**Attach a custom domain.** It is reachable today only at its
`pub-….r2.dev` address, which Cloudflare says not to use in production, and
`media.ahmadassi.ca` does not currently resolve at all. In the R2 dashboard,
under the bucket's settings, add `media.ahmadassi.ca` as a custom domain.

**Turn on Image Transformations** for that zone. It is what serves a right sized
derivative of every photograph, so a 39MB render costs a visitor nothing. The
free allowance is 5,000 unique transformations a month, which a portfolio of
roughly 300 images sits well inside.

**Create an S3 API token** for the bucket, with object read and write. You need
the account id, the access key id and the secret.

The bucket is called **`ahmadassi`**, and it already holds the three films under
a `media/` prefix: `hero-1440.mp4` at 44.8MB, `hero-720.mp4` at 8.2MB, and
`lincoln-beach-walkthrough.mp4` at 76.5MB. The migration matches those by key
and does not re-upload them. The hero poster is not there yet and will be.

---

## 4. Upload the media

The migration has only ever been run with `--skip-upload`, so the images are in
the repository and not in the bucket.

```bash
CLOUDFLARE_R2_ACCOUNT_ID=... \
CLOUDFLARE_R2_ACCESS_KEY_ID=... \
CLOUDFLARE_R2_SECRET_ACCESS_KEY=... \
CLOUDFLARE_R2_BUCKET=ahmadassi \
DATABASE_URL="postgresql://..." \
npm run migrate:content
```

It is idempotent, so it can be re-run. It uploads about 300 files, skips the
three films already in the bucket, and verifies every row resolves to a real
object before reporting success. If it reports problems, fix them before
deploying: it is telling you the site would have holes in it.

---

## 5. The login wall

Cloudflare Zero Trust, Access, self hosted application.

- **Domain:** `ahmadassi.ca`, path `/admin`
- Add a second application for `/api`
- **Policy:** allow, by email address. Ahmad's, and yours.
- **Identity:** one time email codes is enough and needs no other account

Copy the **application audience tag** from the application's overview.

Free up to 50 users, so this costs nothing.

---

## 6. Secrets

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put CLOUDFLARE_R2_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_R2_ACCESS_KEY_ID
npx wrangler secret put CLOUDFLARE_R2_SECRET_ACCESS_KEY
npx wrangler secret put CLOUDFLARE_R2_BUCKET
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
```

**`ACCESS_DEV_BYPASS` must not be set.** It exists so `/admin` opens locally
without a tunnel. The application throws on the first identity read if it is
ever set in production rather than letting anyone in, so a deployment carrying
it fails loudly, but do not rely on that: just do not set it.

---

## 7. Deploy

`NEXT_PUBLIC_MEDIA_ORIGIN` has to be set **in the environment the build runs
in**, not as a Worker variable. Next inlines it into the browser bundle when the
build runs, so one set on the Worker arrives too late.

```bash
NEXT_PUBLIC_MEDIA_ORIGIN="https://media.ahmadassi.ca" \
MEDIA_ORIGIN="https://media.ahmadassi.ca" \
DATABASE_URL="postgresql://..." \
npm run cf:build
```

```bash
npx wrangler deploy
```

Then point `ahmadassi.ca` at the Worker, in the Workers dashboard under Custom
Domains. Cloudflare handles the certificate.

---

## 8. Check it

- `https://ahmadassi.ca` shows the hero film and three lead projects
- A project page shows its images and, on Lincoln Beach, the walkthrough
- `https://ahmadassi.ca/admin` asks for a sign in
- Signing in reaches the projects list
- Uploading one image to a project works, and it appears on the public page
  within a few seconds

---

## Afterwards

**The portfolio PDF does not rebuild itself.** `npm run portfolio` needs a
machine with Node, Chrome and ffmpeg. Editing a project updates the site
immediately and leaves the PDF as it was.

**Backups.** Neon keeps point in time recovery on its own. R2 does not version
objects by default; turning that on is worth the few minutes if Ahmad is going
to be deleting things himself.
