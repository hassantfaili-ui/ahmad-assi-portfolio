# Editing the site

Everything on this site is editable from a browser, with a login and no code.
The editor is [Keystatic](https://keystatic.com). It writes ordinary files back
to the repository, so every change is a normal commit that can be read and
undone, and Netlify rebuilds the site within a minute or two of a save.

The editor lives at **`/admin`**, for example `https://ahmadassi.netlify.app/admin`.
That is the address to give Ahmad and the one to bookmark. It hands straight on
to `/keystatic`, which is where the editor actually runs.

---

## Turning the login on

This is the one part that cannot be done from inside the repository, because it
needs accounts. It takes about ten minutes, once.

1. Go to [keystatic.cloud](https://keystatic.cloud) and sign in with GitHub.
2. Create a team, then create a project inside it and point it at the GitHub
   repository this site is in.
3. Install the Keystatic Cloud GitHub App when it asks, granting it access to
   that one repository.
4. Copy the project identifier it gives you. It looks like `team-name/project-name`.
5. In Netlify, open the site, then **Site configuration → Environment variables**,
   and add:

   ```
   PUBLIC_KEYSTATIC_CLOUD_PROJECT = team-name/project-name
   ```

6. Redeploy. **Deploys → Trigger deploy → Deploy site.**
7. Check it took:

   ```bash
   npm run editor:check -- https://ahmadassi.netlify.app
   ```

   That reports what is configured and whether the deployed site is actually
   serving the editor. It exists because the failure is otherwise silent: with
   the variable missing or malformed the site still builds and every page still
   works, and only `/keystatic` is quietly absent. Pasting the Keystatic Cloud
   URL instead of the bare `team-name/project-name` is the usual slip, and the
   check names it.

After that, `/keystatic` shows a login screen. Sign in with an email address and
password, or a passkey. The free tier covers three people.

A GitHub account is needed once, at step 1, to create the project and install the
app. It is never needed again: Keystatic Cloud does the committing.

### Doing it without Keystatic Cloud

The alternative is to set `PUBLIC_KEYSTATIC_GITHUB_REPO` to `owner/repo` instead
and create a GitHub OAuth app. That works, but it means signing in to the editor
with a GitHub account every time, which is the thing Cloud exists to avoid.

### Editing without any login at all

On your own machine:

```bash
npm run dev
```

Then open `http://localhost:4321/keystatic`. This writes straight to the files on
disk, with no login and no network, which is the quickest way to make a lot of
changes at once. Commit them afterwards.

---

## What can be changed

**Projects.** Every project is one entry under Projects.

- *Photographs.* Add, remove and drag to reorder inside each group. Uploading is
  choosing a file or dragging one in. Photographs are shrunk in the browser as
  they are added, so exports straight out of a renderer are fine.
- *The cover photo.* The "Lead image" at the top of the entry. It is what appears
  on the projects page and at the top of the project's own page.
- *Descriptions and specs.* Title, year, location, building type, area, status,
  role, what you personally did, the one line summary, and the longer text at the
  bottom of the entry.
- *Where it sits.* "Where it sits on the projects page" chooses the top three,
  the set, or the archive. "Order" is a number, low first, that decides the
  sequence within all of them.
- *Adding a project.* The "+" on the Projects list. *Removing one.* The bin icon
  inside the entry.

**Resume and contact.** Both live under Resume. That single entry holds the
experience, education, skills and languages on the resume page, and also the
email address, phone number, location and availability shown on the contact page.

**Alt text is required on every image.** It is the sentence a screen reader
reads, and search engines use it too.

---

## Two things worth knowing

**Only three projects can be in the top three.** Marking a fourth does not break
anything and does not lose it: it falls into the set instead, in its usual place
by order. Move one of the existing three down first if you want to swap.

**The portfolio PDF does not regenerate itself.** It is built from the same
projects, in the same order, by `npm run portfolio`, which needs a computer with
Node, Chrome and ffmpeg. Editing a project in the browser updates the website
immediately and leaves the PDF as it was until someone rebuilds it.
