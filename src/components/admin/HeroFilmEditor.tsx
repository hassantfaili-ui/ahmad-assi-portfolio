'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, useTransition } from 'react';

import { Dropzone } from '@/components/admin/Dropzone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useRegisterUnsaved } from '@/components/admin/UnsavedWork';
import { useSaveFlag } from '@/hooks/use-save-flag';
import type { UploadedFilm, UploadedItem } from '@/hooks/use-uploads';
import { runAction } from '@/lib/action-result';
import { deleteFilm, saveFilm } from '@/lib/mutations';
import { mediaUrl } from '@/lib/media-url';
import { formatBytes } from '@/lib/upload-policy';

/**
 * The film behind Ahmad's name on the home page.
 *
 * It is the one Film row with no project attached, which is why every call here
 * passes null where a project id would go.
 *
 * The screen is mostly explanation, and that is deliberate. This film starts
 * playing by itself on every visit, so its weight is spent out of the visitor's
 * data rather than ours, and it is encoded far harder than a project
 * walkthrough for exactly that reason. Nothing in the file itself says so, so
 * the only place that reasoning can live where it will be read before it is
 * undone is here, next to the button that replaces it.
 */

/** Only the fields this screen shows. Kept local so no server module is imported. */
export interface HeroMedia {
  id: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface HeroFilmValue {
  caption: string | null;
  youtubeId: string | null;
  poster: HeroMedia | null;
  sources: { height: number; media: HeroMedia }[];
}

/** Tallest first, which is the order the home page reads the two ends of. */
function tallestFirst(sources: { height: number; media: HeroMedia }[]) {
  return [...sources].sort((a, b) => b.height - a.height);
}

/**
 * The videos of a film in one comparable string.
 *
 * A save sends the ids it read when the button was pressed. Comparing them
 * against the ids on screen when the answer arrives is what tells a save that
 * covered the film showing here from one that answered for a film that has
 * since been replaced. Sorted, so the answer is about which files are in the
 * film and not the order they are listed in.
 */
function sourceIds(sources: { media: { id: string } }[]): string {
  return sources
    .map((source) => source.media.id)
    .sort()
    .join(',');
}

function describeLength(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;

  const whole = Math.round(seconds);
  if (whole < 60) return `${whole} seconds`;

  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const minutePart = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (rest === 0) return minutePart;
  return `${minutePart} ${rest} second${rest === 1 ? '' : 's'}`;
}

/**
 * Who plays which encode, in the visitor's terms.
 *
 * This mirrors the choice src/components/site/HeroFilm.tsx makes in the
 * browser: the widest screens get the largest encode, everything else gets the
 * smallest. Said here so the numbers below are not just a list of files.
 */
function whoPlaysIt(index: number, count: number): string {
  if (count === 1) return 'Every visitor plays this one.';
  if (index === 0) return 'Laptops and wide screens play this one.';
  if (index === count - 1) {
    return 'Phones, tablets, and anyone on a slow connection play this one.';
  }
  return 'Kept as a spare. Nothing plays this one at the moment.';
}

export function HeroFilmEditor({ film }: { film: HeroFilmValue | null }) {
  const { push } = useToast();
  const router = useRouter();

  const [poster, setPoster] = useState<HeroMedia | null>(film?.poster ?? null);
  const [sources, setSources] = useState(tallestFirst(film?.sources ?? []));
  const [length, setLength] = useState<number | null>(
    film?.sources[0]?.media.durationSeconds ?? null,
  );

  const [caption, setCaption] = useState(film?.caption ?? '');

  /* Which videos the home page is actually playing. Set from what a save sent,
     never from what happens to be on screen when it answers, so a film uploaded
     during the round trip is still counted as waiting afterwards. */
  const [savedSourceIds, setSavedSourceIds] = useState(() => sourceIds(film?.sources ?? []));

  /* The same reading, kept where a save or a removal that left before the
     latest upload can still read it. Those run from a closure built when the
     button was pressed, and that closure cannot see a film that landed after. */
  const liveSourceIds = useRef(savedSourceIds);

  const [problems, setProblems] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, startWork] = useTransition();

  /* Carried through a save untouched. It is only set on a film hosted on
     YouTube, which this hero is not, but dropping it on save would quietly
     throw away a link nothing here put back. */
  const youtubeId = film?.youtubeId ?? null;

  const totalBytes =
    sources.reduce((sum, source) => sum + source.media.bytes, 0) + (poster?.bytes ?? 0);
  const smallest = sources[sources.length - 1];

  const hasFilm = sources.length > 0 || Boolean(poster) || Boolean(youtubeId);

  /* The unsaved flag for this screen. One flag, because the one Save button
     covers both things that can be waiting: a caption typed into the field, and
     a film dropped into the box above.

     It counts edits rather than latching a boolean, because a save of a hero
     film is a large payload on a slow line and everything here stays live while
     it is out. Clearing on any ok answer would report a caption typed during
     the round trip, or worse a film uploaded during it, as being on the home
     page when neither was ever sent. */
  const flag = useSaveFlag();
  const { markDirty, snapshot, settle, reset } = flag;

  useRegisterUnsaved('hero:film', flag.dirty);

  /* A film uploaded but not yet on the home page. Read off the ids rather than
     a boolean so it stays true for a film that landed while a save was out.
     Saying so is the difference between waiting and uploading it a second
     time. */
  const waiting = sources.length > 0 && sourceIds(sources) !== savedSourceIds;

  const canSave = flag.dirty && (sources.length > 0 || Boolean(youtubeId));

  /* Why Save is greyed out, in the row beside it. A disabled button with
     nothing next to it reads as broken rather than as nothing to do. */
  const whyNoSave = canSave
    ? null
    : sources.length === 0
      ? 'Nothing to save yet. Drop a film above first.'
      : 'Nothing has changed since you last saved.';

  const handleUploaded = useCallback(
    (items: UploadedItem[]) => {
      const films = items.filter((item): item is UploadedFilm => item.kind === 'film');
      const newest = films[films.length - 1];

      if (!newest) {
        push('That file is not a video. Choose an MP4 or a MOV.', 'error');
        return;
      }

      const uploaded = tallestFirst(newest.sources);

      liveSourceIds.current = sourceIds(uploaded);
      markDirty();
      setSources(uploaded);
      setPoster(newest.poster);
      setLength(newest.durationSeconds);
      setProblems([]);
      setWarning(null);
    },
    [markDirty, push],
  );

  const save = useCallback(() => {
    /* Both taken before the payload is read out of state. The counter catches a
       caption typed while the save is out, and the ids catch a film uploaded
       while it is out: the answer is only about what went, and what went is
       these ids. */
    const at = snapshot();
    const sent = sources.map((source) => ({ mediaId: source.media.id, height: source.height }));
    const sentIds = sourceIds(sources);

    startWork(async () => {
      const result = await runAction(() =>
        saveFilm(null, {
          posterMediaId: poster?.id ?? null,
          youtubeId,
          caption: caption.trim() || null,
          sources: sent,
        }),
      );

      if (!result.ok) {
        const listed = Object.values(result.errors ?? {});
        setProblems(listed.length > 0 ? listed : [result.message ?? 'Nothing was saved. Try again.']);
        push('Nothing was saved. Read what needs fixing above.', 'error');
        return;
      }

      setProblems([]);
      setWarning(result.warning ?? null);
      /* The home page is playing what this payload carried. If a film landed
         while it was out, the ids on screen are no longer these, the badge and
         the Save button have to keep saying so, and the flag is not settled for
         a film that was never sent. */
      setSavedSourceIds(sentIds);
      if (liveSourceIds.current === sentIds) settle(at);
      push('Saved. The home page is playing this film.');
      router.refresh();
    });
  }, [caption, poster, push, router, settle, snapshot, sources, youtubeId]);

  const remove = useCallback(() => {
    /* The film he answered the question about. */
    const answered = sourceIds(sources);

    startWork(async () => {
      const result = await runAction(() => deleteFilm(null));

      if (!result.ok) {
        setProblems([result.message ?? 'The film was not removed. Try again.']);
        push('The film was not removed.', 'error');
        return;
      }

      setProblems([]);
      setWarning(null);
      setConfirming(false);
      setSavedSourceIds('');

      /* A film that landed while the removal was out was no part of what he
         agreed to, and clearing the screen would throw away a compression
         nothing here can repeat. It stays, and so does the flag. */
      if (liveSourceIds.current !== answered) {
        push(
          'The film is off the home page. The one you uploaded while that was happening is still here and still needs saving.',
        );
        router.refresh();
        return;
      }

      setSources([]);
      liveSourceIds.current = '';
      setPoster(null);
      setLength(null);
      setCaption('');
      reset(false);
      push('The film is off the home page.');
      router.refresh();
    });
  }, [push, reset, router, sources]);

  return (
    <section className="grid gap-6" aria-labelledby="hero-film">
      <div className="grid gap-1">
        <h2 id="hero-film" className="text-lg font-semibold tracking-tight">
          The film behind your name
        </h2>
        <p className="text-sm text-neutral-600">
          It plays on the home page, behind your name, on every visit.
        </p>
      </div>

      {/* The one thing on this screen that would otherwise be changed by
          accident, so it is stated before anything can be dropped. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Read this before you replace it</p>
        <p className="mt-1">
          This film starts playing by itself on every visit, including on a phone, and it plays
          silently. Every visitor downloads it out of their own data allowance, whether they wanted
          moving pictures or not, so it is compressed harder than a walkthrough on a project page
          and its sound is dropped. A walkthrough is someone choosing to press play. This one is
          not, so it is kept small on purpose.
        </p>
        <p className="mt-2">
          Anything dropped below is compressed that way automatically, in this window, before it
          uploads. Drop the full quality export.
        </p>
      </div>

      {problems.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Nothing was saved</p>
          <ul className="mt-1 grid gap-1">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {warning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {warning}
        </div>
      )}

      {hasFilm ? (
        <div className="grid gap-4 rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-neutral-800">
              {waiting ? 'The film you just uploaded' : 'On the home page now'}
            </h3>
            {waiting && <Badge variant="warning">Not saved yet</Badge>}
          </div>

          {waiting && (
            <p className="text-sm text-neutral-600">
              The home page is still playing the old film. Press Save below to put this one in its
              place.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,20rem)_1fr]">
            {poster ? (
              <figure className="grid gap-1.5">
                <Image
                  src={poster.key}
                  alt="The still the home page shows before the film starts playing"
                  width={poster.width ?? 800}
                  height={poster.height ?? 450}
                  className="h-auto w-full rounded-md border border-neutral-200 bg-neutral-100"
                />
                <figcaption className="text-xs text-neutral-500">
                  The still shown before the film starts, taken from the film itself.{' '}
                  {formatBytes(poster.bytes)}
                </figcaption>
              </figure>
            ) : (
              <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                There is no still for this film. Upload the film again to make one.
              </p>
            )}

            <div className="grid content-start gap-3">
              <dl className="grid gap-1 text-sm text-neutral-700">
                <div className="flex gap-2">
                  <dt className="font-medium">Length</dt>
                  <dd>{describeLength(length) ?? 'Not known'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Sound</dt>
                  <dd>None. It plays silently.</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium">Everything together</dt>
                  <dd>{formatBytes(totalBytes)}</dd>
                </div>
              </dl>

              {sources.length > 0 ? (
                <ul className="grid gap-2">
                  {sources.map((source, index) => (
                    <li
                      key={source.media.id}
                      className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-medium text-neutral-900">
                          {source.height} pixels tall
                        </span>
                        <span className="text-neutral-600">{formatBytes(source.media.bytes)}</span>
                        <a
                          href={mediaUrl(source.media.key)}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto text-xs underline underline-offset-4 hover:text-neutral-900"
                        >
                          Play this one
                        </a>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-600">
                        {whoPlaysIt(index, sources.length)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-600">
                  No video has been uploaded for the home page yet.
                </p>
              )}

              {smallest && sources.length > 1 && (
                <p className="text-xs text-neutral-500">
                  A visitor plays one of these, never both. On a phone that is{' '}
                  {formatBytes(smallest.media.bytes)} out of their data, every visit.
                </p>
              )}
            </div>
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              Take the film off the home page
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">There is no film on the home page</p>
          <p className="mt-1">
            Your name sits on the plain background at the moment, with nothing playing behind it.
            Drop a film below to change that.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-neutral-800">
          {hasFilm ? 'Replace it' : 'Upload one'}
        </h3>
        <Dropzone
          destination="film"
          accept="video"
          filmProfile="hero"
          onUploaded={handleUploaded}
          label="Drop the film here"
          hint="An MP4 or a MOV, straight out of D5. It is compressed here before it uploads, so a large export is fine. This takes a few minutes."
        />
      </div>

      <Field
        label="What the film shows"
        htmlFor="hero-caption"
        hint="Kept with the film, so you know later which one this is. Something like: Lincoln Beach Center, walkthrough."
      >
        <Input
          value={caption}
          onChange={(event) => {
            markDirty();
            setCaption(event.target.value);
          }}
          placeholder="Lincoln Beach Center, walkthrough"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={busy || !canSave}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        {flag.dirty && <Badge variant="warning">Not saved yet</Badge>}
        {!busy && (
          <p className="text-sm text-neutral-600">
            {whyNoSave ?? 'You have changes that are not on the home page yet.'}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Take the film off the home page?"
        description={
          <>
            <p>
              Your name will sit on the plain background, with no film and no still behind it, until
              you upload another one.
            </p>
            {waiting ? (
              /* The library line below is true of a film that has been saved and
                 false of one that has only been uploaded, so it is not said
                 here. What this takes off is the compression he has just waited
                 through, and he is told that before he answers. */
              <p className="mt-2">
                The film you uploaded has not been saved yet, and this takes it off with the old
                one. Its files are in your library, but nothing on this screen can put them back
                together into a film, so keeping it would mean dropping the original in again and
                waiting through the whole compression. Press Save first if you want to keep it.
              </p>
            ) : (
              <p className="mt-2">
                The video files stay in your media library, so you can put this film back by
                uploading it again.
              </p>
            )}
          </>
        }
        confirmLabel="Take it off"
        onConfirm={remove}
        busy={busy}
      />
    </section>
  );
}
