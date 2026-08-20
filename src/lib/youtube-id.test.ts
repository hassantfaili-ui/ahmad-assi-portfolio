import { describe, it, expect } from 'vitest';
import { extractYouTubeId } from './youtube-id';

const ID = 'dQw4w9WgXcQ';

describe('extractYouTubeId', () => {
  it.each([
    ['a bare id', ID],
    ['a watch URL', `https://www.youtube.com/watch?v=${ID}`],
    ['a watch URL with more parameters', `https://www.youtube.com/watch?v=${ID}&t=42s`],
    ['a share link', `https://youtu.be/${ID}`],
    ['a share link with tracking', `https://youtu.be/${ID}?si=AbCdEf123456`],
    ['an embed URL', `https://www.youtube.com/embed/${ID}`],
    ['a privacy conscious embed URL', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['an id needing a trim', `  ${ID}  `],
  ])('finds the id in %s', (_shape, pasted) => {
    expect(extractYouTubeId(pasted)).toBe(ID);
  });

  it.each([
    ['prose', 'watch my walkthrough film'],
    ['a wrong length bare string', 'abc123'],
    ['a too long bare string', 'dQw4w9WgXcQdQw4w9WgXcQ'],
    ['a URL with no id in it', 'https://www.youtube.com/'],
    ['an empty string', ''],
    ['whitespace', '   '],
  ])('returns null for %s, never the input back', (_shape, pasted) => {
    // The old extractor fell back to the raw string, which is exactly how a
    // junk id reached the player. Null is the contract.
    expect(extractYouTubeId(pasted)).toBeNull();
  });
});
