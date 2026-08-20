/**
 * Pull the video id out of whatever was pasted.
 *
 * Ahmad pastes whatever the share sheet handed him: a watch URL, a youtu.be
 * link, an embed URL, or now and then the bare eleven character id itself.
 * They all carry the same id, so each shape is unpacked here.
 *
 * Returning null instead of echoing the input back is the point of this file.
 * An earlier version of this extractor lived inside the player and fell back
 * to the raw string, so any junk saved cleanly and visitors got a dead player
 * with nothing behind it. Nothing failed and nothing warned, which is the
 * worst way for a save to go wrong.
 *
 * Pure on purpose, like src/lib/validation.ts: imported by the player, which
 * is a client component, and by the validation the server actions run.
 */

/** Accepts a bare id, a watch URL, a youtu.be link or an embed URL. */
export function extractYouTubeId(raw: string): string | null {
  const s = raw.trim();
  const m =
    s.match(/[?&]v=([\w-]{6,})/) ||
    s.match(/youtu\.be\/([\w-]{6,})/) ||
    s.match(/\/embed\/([\w-]{6,})/) ||
    /* Exactly eleven characters for a bare string. The URL shapes above can
       afford to be looser because the address structure vouches for them; a
       bare string has nothing vouching for it but its own length. */
    s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
