import type { TranscodeProgress, TranscodeResult } from './transcode';

const SOURCE_ERROR = 'This browser cannot read the video in that file. Export it as an H.264 MP4 and try again.';

/** Safari can play some files that its WebCodecs decoder cannot read. Record
 * native playback at 720p instead, keeping the original off the public site.
 * This runs at playback speed and never uses the camera or microphone. */
export async function transcodeNativeVideo(
  file: File,
  options: {
    keepAudio: boolean;
    bitrate: number;
    signal?: AbortSignal;
    onProgress?: (progress: TranscodeProgress) => void;
  },
): Promise<TranscodeResult> {
  const { keepAudio, bitrate, signal, onProgress } = options;
  const mimeType = keepAudio
    ? 'video/mp4;codecs=avc1,mp4a.40.2'
    : 'video/mp4;codecs=avc1';
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error(SOURCE_ERROR);
  }

  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') throw new Error(SOURCE_ERROR);

  const url = URL.createObjectURL(file);
  let stream: MediaStream | undefined;
  let audio: AudioContext | undefined;
  let recorder: MediaRecorder | undefined;
  let animation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectPending: ((error: Error) => void) | undefined;
  let poster: Blob | null = null;

  const abort = () => rejectPending?.(new DOMException('Cancelled.', 'AbortError'));
  const fail = () => rejectPending?.(new Error(SOURCE_ERROR));
  const waitFor = (event: 'loadeddata' | 'seeked') => new Promise<void>((resolve, reject) => {
    rejectPending = reject;
    const done = () => {
      video.removeEventListener(event, done);
      resolve();
    };
    video.addEventListener(event, done, { once: true });
    // A damaged or unplayable file must not leave the upload spinning forever.
    timer = setTimeout(() => reject(new Error(SOURCE_ERROR)), 20_000);
  }).finally(() => {
    clearTimeout(timer);
    rejectPending = undefined;
  });

  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  video.setAttribute('aria-hidden', 'true');
  document.body.appendChild(video);
  video.addEventListener('error', fail);
  signal?.addEventListener('abort', abort, { once: true });

  try {
    signal?.throwIfAborted();
    onProgress?.({ stage: 'reading', fraction: 0, label: 'Preparing the film for this phone' });
    const ready = waitFor('loadeddata');
    video.src = url;
    video.load();
    await ready;
    signal?.throwIfAborted();

    const durationSeconds = video.duration;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !sourceWidth || !sourceHeight) {
      throw new Error(SOURCE_ERROR);
    }

    // Even dimensions keep H.264 encoders happy. Never enlarge a small source.
    const scale = Math.min(1, 720 / sourceHeight, 1280 / sourceWidth);
    canvas.width = Math.max(2, Math.floor(sourceWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(sourceHeight * scale / 2) * 2);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the film. Try again.');

    // Take the poster before recording, so JPEG encoding cannot stall playback.
    video.currentTime = Math.min(2, durationSeconds / 2);
    await waitFor('seeked');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    poster = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!poster) throw new Error('Could not read a poster frame from that film.');
    video.currentTime = 0;
    await waitFor('seeked');
    signal?.throwIfAborted();

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream = canvas.captureStream(30);
    if (keepAudio) {
      audio = new AudioContext();
      const source = audio.createMediaElementSource(video);
      const destination = audio.createMediaStreamDestination();
      source.connect(destination);
      const soundtrackError = 'Tap Try again to allow this phone to process the soundtrack.';
      await new Promise<void>((resolve, reject) => {
        rejectPending = reject;
        timer = setTimeout(() => reject(new Error(soundtrackError)), 10_000);
        void audio!.resume().then(resolve, reject);
      }).finally(() => {
        clearTimeout(timer);
        rejectPending = undefined;
      });
      if (audio.state !== 'running') throw new Error('Tap Try again to allow this phone to process the soundtrack.');
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
      // Muting the element also silences its Web Audio source. Its sound is
      // routed only into the recording destination, never to the speakers.
      video.muted = false;
    }

    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128_000 });
    const blob = await new Promise<Blob>((resolve, reject) => {
      rejectPending = reject;
      recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder!.onerror = () => reject(new Error('This phone could not finish compressing the film. Try again.'));
      recorder!.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
      video.onended = () => { if (recorder?.state !== 'inactive') recorder?.stop(); };
      const draw = () => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        onProgress?.({
          stage: 'encoding',
          fraction: Math.min(0.92, video.currentTime / durationSeconds * 0.92),
          label: 'Compressing to 720p. Keep this page open',
        });
        animation = requestAnimationFrame(draw);
      };
      // Give stalled playback a bounded failure, including when iOS suspends
      // the page. A normal conversion takes roughly the length of the clip.
      timer = setTimeout(() => reject(new Error('The film stopped processing. Keep this page open and tap Try again.')), (durationSeconds + 30) * 1000);
      recorder!.start(1000);
      draw();
      void video.play().catch(() => reject(new Error('Tap Try again and keep this page open while the film is compressed.')));
    });
    signal?.throwIfAborted();
    if (!blob.size) throw new Error('The phone produced an empty film. Try again.');
    onProgress?.({ stage: 'poster', fraction: 1, label: 'Done' });
    return { encodes: [{ height: 720, blob }], poster, durationSeconds, sourceWidth, sourceHeight };
  } finally {
    clearTimeout(timer);
    cancelAnimationFrame(animation);
    signal?.removeEventListener('abort', abort);
    video.removeEventListener('error', fail);
    video.onended = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    if (audio) await audio.close();
    URL.revokeObjectURL(url);
  }
}
