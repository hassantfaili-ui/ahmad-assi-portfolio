import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PUT_ATTEMPTS, putToR2, retryDelay, sendUpload } from './upload-client';

/**
 * A stand in for XMLHttpRequest whose sends play out a script: 'drop' fires
 * the error event a dropped connection fires, a number finishes with that
 * status. One instance per attempt, like the real thing.
 */
let script: ('drop' | number)[] = [];
let sends = 0;
let sent: { url: string; size: number }[] = [];

class FakeRequest {
  status = 0;
  upload = { addEventListener: () => {} };
  private listeners = new Map<string, () => void>();
  private url = '';
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  abort() {
    this.listeners.get('abort')?.();
  }
  send(body: Blob) {
    sent.push({ url: this.url, size: body.size });
    const outcome = script[sends++] ?? 200;
    queueMicrotask(() => {
      if (outcome === 'drop') {
        this.listeners.get('error')?.();
        return;
      }
      this.status = outcome;
      this.listeners.get('load')?.();
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('XMLHttpRequest', FakeRequest);
  sends = 0;
  sent = [];
  script = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function put(onRetry?: (attempt: number, of: number) => void, signal?: AbortSignal) {
  return putToR2('https://bucket.example/key', new Blob(['x']), 'video/mp4', () => {}, signal, onRetry);
}

describe('putToR2', () => {
  it('sends the file again after a dropped connection, without being asked', async () => {
    script = ['drop', 'drop', 200];
    const retries: string[] = [];
    const done = put((attempt, of) => retries.push(`${attempt}/${of}`));

    await vi.runAllTimersAsync();
    await expect(done).resolves.toBeUndefined();
    expect(sends).toBe(3);
    expect(retries).toEqual([`2/${PUT_ATTEMPTS}`, `3/${PUT_ATTEMPTS}`]);
  });

  it('gives up after the last attempt and says the connection dropped', async () => {
    script = Array(PUT_ATTEMPTS).fill('drop');
    const done = put();
    const outcome = expect(done).rejects.toThrow('The connection dropped during the upload.');

    await vi.runAllTimersAsync();
    await outcome;
    expect(sends).toBe(PUT_ATTEMPTS);
  });

  it('tries again on a server failure', async () => {
    script = [503, 200];
    const done = put();
    await vi.runAllTimersAsync();
    await expect(done).resolves.toBeUndefined();
    expect(sends).toBe(2);
  });

  it('does not repeat a refusal, which would only be refused again', async () => {
    script = [403, 200];
    const done = put();
    const outcome = expect(done).rejects.toThrow('status 403');

    await vi.runAllTimersAsync();
    await outcome;
    expect(sends).toBe(1);
  });

  it('stops waiting to try again the moment Cancel is pressed', async () => {
    script = ['drop', 200];
    const controller = new AbortController();
    const done = put(undefined, controller.signal);
    const outcome = expect(done).rejects.toThrow('Aborted');

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await outcome;
    expect(sends).toBe(1);
  });
});

describe('retryDelay', () => {
  it('waits one, three, then nine seconds', () => {
    expect([1, 2, 3].map(retryDelay)).toEqual([1000, 3000, 9000]);
  });
});

describe('sendUpload', () => {
  it('sends a small file whole, to its one URL', async () => {
    const receipt = sendUpload(
      { name: 'a.jpg', key: 'k', url: 'https://bucket.example/whole', contentType: 'image/jpeg', kind: 'image' },
      new Blob(['12345']),
      () => {},
    );
    await vi.runAllTimersAsync();
    await expect(receipt).resolves.toBeUndefined();
    expect(sent).toEqual([{ url: 'https://bucket.example/whole', size: 5 }]);
  });

  it('cuts a large file into its parts, the last taking what is left, and resends only a dropped part', async () => {
    script = [200, 'drop', 200, 200];
    const progress: number[] = [];
    const receipt = sendUpload(
      {
        name: 'film.mp4',
        key: 'k',
        parts: { uploadId: 'u', partSize: 4, urls: ['p1', 'p2', 'p3'] },
        contentType: 'video/mp4',
        kind: 'video',
      },
      new Blob(['0123456789']),
      (fraction) => progress.push(fraction),
    );
    await vi.runAllTimersAsync();

    await expect(receipt).resolves.toEqual({ uploadId: 'u', parts: 3 });
    expect(sent).toEqual([
      { url: 'p1', size: 4 },
      { url: 'p2', size: 4 },
      { url: 'p2', size: 4 },
      { url: 'p3', size: 2 },
    ]);
    expect(progress.at(-1)).toBe(1);
  });
});
