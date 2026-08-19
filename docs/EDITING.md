# Editing the site

Everything on ahmadassi.ca is edited in a browser. Go to
**[ahmadassi.ca/admin](https://ahmadassi.ca/admin)**, sign in when Cloudflare
asks, and you are in.

There is nothing to install and nothing to run. A change is live within a few
seconds of saving.

---

## The four screens

| Screen | What it is for |
| --- | --- |
| **Projects** | Every project. Add, edit, reorder, publish, delete |
| **Media** | Every photograph, drawing, film and PDF that has been uploaded |
| **Resume** | Your biography, experience, education, skills and contact details |
| **Settings** | The film behind your name on the home page |

---

## Adding a project

1. **Projects**, then **New project**. Give it a title.
2. It opens straight into the editor. It is **not published yet**, which is
   deliberate: nobody sees it until you say so.
3. Fill in the fields on the left.
4. Drag your renders onto the panel on the right. Drop as many at once as you
   like, or paste them straight out of an email.
5. Give each image a **description**. See below.
6. Choose the **cover**, which is the image that represents the project
   everywhere else on the site.
7. Turn on **Published**.

---

## Uploading

Drag files onto the page. That is the whole thing.

**Do not resize anything first.** Export at whatever quality you like. A 39MB
render is fine. The site makes its own smaller copies and gives each visitor the
right size for the screen they are on, so a large original costs them nothing.

**Films are compressed in your browser before they upload**, into a large copy
and a small one, and a still frame is taken for the poster. A four minute
upload bar is the compression, not a problem. This needs **Chrome, Edge, or
Safari 16.4 or newer**. Firefox cannot do it and will say so rather than
uploading something unusable.

Accepted: JPEG, PNG, WebP, AVIF, GIF, TIFF, MP4, MOV, WebM, and PDF.

---

## Descriptions, and why they are required

Every image needs one sentence describing what is in it. The save will not go
through without it.

It is the sentence read aloud to somebody who cannot see the image, and it is
also what search engines read. "The museum on the corner of Hayne Boulevard,
yellow weatherboard with teal shutters" is a description. "Render 4" is not.

---

## Arranging a project's images

Images sit in **groups**, and a group has a layout:

- **Pair**, two side by side
- **Full**, one across the full width
- **Triptych**, three across

A group can carry one caption for all of its images.

Drag to reorder, either the groups or the images inside them. It also works from
the keyboard: tab to the handle and use the arrow keys.

**Drawings** are separate from photographs and appear in their own section, each
labelled with what it is: a plan, a section, an elevation.

---

## Where a project appears

The home page has three tiers, set by **Tier** on each project:

- **Lead**, the three large cards at the top
- **Set**, the horizontal strip below them
- **Index**, a compact list at the bottom, for coursework

**Only three projects can lead.** Marking a fourth does not break anything and
does not lose it: it drops into the strip instead, in its usual place. The
Projects screen says so when it happens. To swap one in, move one of the current
three down first.

**Order** is the drag handle on the Projects screen. It applies within each
tier.

---

## Two things worth knowing

**Changing a project's web address breaks links to it.** The address is the
`slug` field. If anyone has linked to `/work/lincoln-beach-center`, changing it
means that link stops working. Changing the title alone is always safe.

**Deleting a project leaves its files alone.** They stay in Media, so nothing is
lost by accident. Removing a file for good is a separate deliberate act on the
Media screen, and the site refuses to do it while anything still uses that file,
naming what.

---

## The portfolio PDF

The PDF at `/portfolio` does **not** rebuild itself. It is made from the same
projects, in the same order, by a person running one command on a computer with
the tools installed. Editing a project updates the website immediately and
leaves the PDF as it was.

Ask Hassan when you want a fresh one.

---

## If something goes wrong

- **A save is refused.** The reason is written on the field that caused it. Most
  often it is a missing description on an image.
- **A film will not upload.** Check the browser. Firefox cannot compress video.
- **A file will not delete.** Something still uses it, and the message names
  what. Remove it there first.
- **A change is not showing.** Give it a few seconds and reload. If it still is
  not there, the save did not go through, and it will have said so.
