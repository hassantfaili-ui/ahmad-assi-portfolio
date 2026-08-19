import * as React from 'react';
import type { TinaField } from 'tinacms';
import { wrapFieldsWithMeta } from 'tinacms';

/**
 * The film field, and the only upload on this site that does not go through Git.
 *
 * Every other file Ahmad adds is committed to the repository, which is what makes
 * an edit reviewable and undoable. Films cannot be: the hero alone is 42.8MB, one
 * save is capped at 45MB by GitHub's own API, and Cloudflare refuses to serve any
 * single asset over 25 MiB. So films live in the R2 bucket that already serves
 * them, and this field puts them there.
 *
 * The browser uploads straight to R2. It asks the site for a presigned PUT URL
 * and then sends the bytes to Cloudflare directly, so a 200MB master never
 * passes through the Worker, which has its own request size and CPU limits and
 * would be the first thing to break on a 4K file.
 *
 * WHAT IT DOES WHEN UPLOADS ARE NOT CONFIGURED. It becomes a text box. The
 * endpoint answers 501 when the R2 variables are unset, and this field falls
 * back to what the field always was: a path under /media that a developer put
 * in the bucket by hand. That is deliberate. Somebody cloning this repository
 * with no bucket of their own still gets a working editor, and the site still
 * builds, rather than a control that looks live and fails on use.
 */

/** Matches the server's own list. Kept here only to fail early and say why. */
const ACCEPT = ['video/mp4', 'video/webm', 'video/quicktime'];

/** Where the presign endpoint lives. Same origin as the admin, so relative. */
const SIGN_URL = '/api/film-upload';

/** The passphrase is remembered per browser so it is asked for once, not once per film. */
const PASS_KEY = 'tina.filmUploadKey';

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'ready' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'failed'; reason: string };

interface SignResponse {
  url: string;
  path: string;
}

function readPassphrase(): string {
  try {
    return window.localStorage.getItem(PASS_KEY) || '';
  } catch {
    return '';
  }
}

function writePassphrase(value: string): void {
  try {
    window.localStorage.setItem(PASS_KEY, value);
  } catch {
    /* A browser with storage blocked just asks again next time. */
  }
}

/** PUT the file to R2, reporting progress. XHR rather than fetch, because fetch
    still cannot report upload progress and a 200MB upload with no bar looks hung. */
function put(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 refused the upload (${xhr.status})`)),
    );
    xhr.addEventListener('error', () => reject(new Error('The upload could not reach R2')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
    xhr.send(file);
  });
}

/** What Tina hands a custom field. Narrowed to the two things this one uses. */
type FilmInput = { value?: string; onChange: (value: string) => void };

const FilmUploader = wrapFieldsWithMeta<{ input: FilmInput }>(({ input }: { input: FilmInput }) => {
  const [state, setState] = React.useState<State>({ kind: 'checking' });

  /* Ask the site once whether uploading is switched on at all, so the control
     can present itself honestly before Ahmad picks a file rather than after. */
  React.useEffect(() => {
    let live = true;
    fetch(SIGN_URL, { method: 'GET' })
      .then((res) => (res.ok ? { kind: 'ready' as const } : res.json().catch(() => ({}))))
      .then((body: unknown) => {
        if (!live) return;
        if (body && typeof body === 'object' && 'kind' in body) {
          setState(body as State);
          return;
        }
        const reason =
          (body as { error?: string })?.error ||
          'Film uploads are not configured for this site.';
        setState({ kind: 'unavailable', reason });
      })
      .catch(() => live && setState({ kind: 'unavailable', reason: 'The site did not answer.' }));
    return () => {
      live = false;
    };
  }, []);

  const onPick = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      if (file.type && !ACCEPT.includes(file.type)) {
        setState({ kind: 'failed', reason: `${file.type} is not a film. Use MP4, WebM or MOV.` });
        return;
      }

      let passphrase = readPassphrase();
      if (!passphrase) {
        passphrase = window.prompt('Upload passphrase for the film bucket') || '';
        if (!passphrase) return;
      }

      setState({ kind: 'uploading', percent: 0 });
      try {
        const res = await fetch(SIGN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${passphrase}`,
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'video/mp4',
            size: file.size,
          }),
        });
        if (res.status === 401) {
          writePassphrase('');
          throw new Error('That passphrase was not accepted. Try again.');
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `The site refused the upload (${res.status})`);
        }
        const { url, path } = (await res.json()) as SignResponse;

        await put(url, file, (percent) => setState({ kind: 'uploading', percent }));

        writePassphrase(passphrase);
        input.onChange(path);
        setState({ kind: 'ready' });
      } catch (error) {
        setState({
          kind: 'failed',
          reason: error instanceof Error ? error.message : 'The upload failed.',
        });
      }
    },
    [input],
  );

  const value = input.value || '';

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={(event) => input.onChange(event.target.value)}
        placeholder="/media/lincoln-beach-walkthrough.mp4"
        className="shadow-inner focus:shadow-outline focus:border-blue-500 focus:outline-none block text-base placeholder:text-gray-300 px-3 py-2 text-gray-600 w-full bg-white border border-gray-200 transition-all ease-out duration-150 focus:text-gray-900 rounded-md"
      />

      {state.kind === 'unavailable' ? (
        <p style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
          {state.reason} Put the file in the bucket under <code>media/</code> and type its path
          above, for example <code>/media/lincoln-beach-walkthrough.mp4</code>.
        </p>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          <label
            style={{
              display: 'inline-block',
              cursor: state.kind === 'uploading' ? 'progress' : 'pointer',
              fontSize: '0.8125rem',
              padding: '0.4rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              background: state.kind === 'uploading' ? '#f3f4f6' : '#fff',
              color: '#374151',
            }}
          >
            {state.kind === 'uploading' ? `Uploading ${state.percent}%` : 'Upload a film'}
            <input
              type="file"
              accept={ACCEPT.join(',')}
              onChange={onPick}
              disabled={state.kind === 'uploading' || state.kind === 'checking'}
              style={{ display: 'none' }}
            />
          </label>
          <p style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#6b7280' }}>
            Goes straight to the film bucket, not into the site's files. Nothing else on the
            site is stored this way.
          </p>
        </div>
      )}

      {state.kind === 'failed' && (
        <p style={{ marginTop: '0.4rem', fontSize: '0.8125rem', color: '#b91c1c' }}>
          {state.reason}
        </p>
      )}
    </div>
  );
});

/**
 * The cast is upstream's disagreement with itself, not a shortcut here.
 *
 * `wrapFieldsWithMeta` returns a component whose props include a `form` that
 * Tina's own `ui.component` contract never passes, and its `input.onChange` is
 * declared as taking a change event while the documented way to call it is with
 * the value. The two are exact at runtime and irreconcilable in TypeScript.
 * Asserting once, here, keeps it out of the collection file, where it would read
 * as this field being special rather than a type being wrong.
 */
export const filmField = {
  type: 'string',
  name: 'src',
  label: 'Film file',
  description:
    'The walkthrough itself. Upload it here, or type the path of a file already in the bucket.',
  ui: { component: FilmUploader },
} as unknown as TinaField;
