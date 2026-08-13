#!/bin/bash
#
# Build the front hero film from a full quality walkthrough.
#
#   ./scripts/build-hero.sh "/path/to/Lincoln Beach Center Project by Ahmad Assi.mp4"
#
# Why this exists rather than committing the original: the 4K master is 354MB at
# 44 Mbps, and GitHub refuses anything over 100MB. More to the point, this file
# autoplays on every visit to the home page, so it has to be small enough not to
# punish someone on a phone. Output is about 29MB at 1440p and 8MB at 720p.
#
# Decisions worth knowing:
#   TRIM      the film opens with its own burned-in "LINCOLN BEACH CENTER" title
#             card, running roughly 1s to 6s. That would sit on top of Ahmad's
#             name in the hero, so the first seven seconds are cut.
#   two files  1440p at 4 Mbps for screens big enough to show it, 720p at
#             1.1 Mbps for phones, slow connections and save-data. The hero
#             autoplays, so the size is spent from the visitor's data allowance.
#   two pass  a fixed bitrate gives a predictable file size. CRF is quality
#             targeted and the size then varies with the footage.
#   -an       it is a muted background loop. The audio is dead weight.
#
# Not 4K. Sixty seconds of watchable 4K is about 80MB, downloaded by every
# visitor before they read a word, for a film that is scrimmed, cropped to the
# viewport and playing behind text. The project page carries the good copy.
set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "usage: $0 <source-video>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LARGE="$ROOT/public/media/hero-1440.mp4"
SMALL="$ROOT/public/media/hero-720.mp4"
POSTER="$ROOT/public/media/hero-poster.jpg"
LOG="$(mktemp -d)/pass"

TRIM=7          # seconds cut from the head, to clear the title card

encode() {      # encode <scale> <bitrate> <out>
  ffmpeg -y -loglevel error -ss "$TRIM" -i "$SRC" -an -vf "scale=${1}:flags=lanczos" \
    -c:v libx264 -preset slow -b:v "$2" -g 60 \
    -pass 1 -passlogfile "$LOG" -f null /dev/null
  ffmpeg -y -loglevel error -ss "$TRIM" -i "$SRC" -an -vf "scale=${1}:flags=lanczos" \
    -c:v libx264 -preset slow -b:v "$2" -g 60 \
    -pass 2 -passlogfile "$LOG" \
    -profile:v high -pix_fmt yuv420p -movflags +faststart "$3"
}

echo "1440p, two passes"
encode "2560:1440" 4000k "$LARGE"

echo "720p, two passes"
encode "1280:720" 1100k "$SMALL"

# The poster only shows while the video loads, and on narrow screens and for
# anyone who asked for reduced motion, where the video is never fetched at all.
ffmpeg -y -loglevel error -ss 5 -i "$LARGE" -frames:v 1 -vf scale=1920:-2 -q:v 3 "$POSTER"

rm -rf "$(dirname "$LOG")"

echo
echo "hero-1440.mp4   $(du -h "$LARGE" | cut -f1)  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$LARGE" | cut -d. -f1)s"
echo "hero-720.mp4    $(du -h "$SMALL" | cut -f1)"
echo "hero-poster.jpg $(du -h "$POSTER" | cut -f1)"
