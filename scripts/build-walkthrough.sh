#!/bin/bash
#
# Build the self-hosted project walkthrough from a full quality master.
#
#   ./scripts/build-walkthrough.sh "/path/to/Lincoln Beach Center Project by Ahmad Assi.mp4"
#
# This is the copy on the project page, behind a click. It is not the hero: that
# one autoplays and is built by build-hero.sh at a fraction of this size.
#
# Decisions worth knowing:
#   1440p     the 4K master at a bitrate that fits GitHub's 100MB per file limit
#             is 96MB, and at matched display size it is indistinguishable from
#             this. Compared frame for frame before choosing. 1440p at 9 Mbps
#             lands near 73MB and leaves real headroom under the limit.
#   full 67s  the title card is kept here. On the project page the film is the
#             film, titles and all. Only the hero trims it, because there it
#             would sit on top of Ahmad's name.
#   audio     kept. The master has a real soundtrack, mean volume -18 dB, so this
#             is not silence that can be dropped.
#   faststart moves the index to the front so playback can begin before the whole
#             file has arrived. Essential at this size.
#
# Nothing is requested from any third party to play this. It used to be an
# unlisted YouTube embed behind a click-to-load facade; it is now served from the
# same domain as the rest of the site.
set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "usage: $0 <source-video>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/media/lincoln-beach-walkthrough.mp4"
POSTER="$ROOT/public/media/lincoln-beach-film-poster.jpg"
LOG="$(mktemp -d)/pass"

SCALE="scale=2560:1440:flags=lanczos"
BITRATE=9000k

echo "pass 1 of 2"
ffmpeg -y -loglevel error -i "$SRC" -an -vf "$SCALE" \
  -c:v libx264 -preset medium -b:v "$BITRATE" -g 60 \
  -pass 1 -passlogfile "$LOG" -f null /dev/null

echo "pass 2 of 2"
ffmpeg -y -loglevel error -i "$SRC" -vf "$SCALE" \
  -c:v libx264 -preset medium -b:v "$BITRATE" -g 60 \
  -pass 2 -passlogfile "$LOG" \
  -profile:v high -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -ac 2 "$OUT"

ffmpeg -y -loglevel error -ss 2 -i "$OUT" -frames:v 1 -vf scale=1920:-2 -q:v 3 "$POSTER"

rm -rf "$(dirname "$LOG")"

SIZE_MB=$(( $(stat -f%z "$OUT") / 1048576 ))
echo
echo "lincoln-beach-walkthrough.mp4  ${SIZE_MB}MB  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)s"
echo "lincoln-beach-film-poster.jpg  $(du -h "$POSTER" | cut -f1)"
if [ "$SIZE_MB" -ge 100 ]; then
  echo
  echo "REFUSING: ${SIZE_MB}MB is at or over GitHub's 100MB per file limit." >&2
  echo "Lower BITRATE and run again." >&2
  exit 1
fi
