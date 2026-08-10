#!/bin/bash
#
# Build the front hero film from a full quality walkthrough.
#
#   ./scripts/build-hero.sh "/path/to/Lincoln Beach Center Project by Ahmad Assi.mp4"
#
# Why this exists rather than committing the original: the 4K master is 354MB at
# 44 Mbps, and GitHub refuses anything over 100MB. More to the point, this file
# autoplays on every visit to the home page, so it has to be small enough not to
# punish someone on a phone. The output is about 9MB.
#
# Decisions worth knowing:
#   TRIM      the film opens with its own burned-in "LINCOLN BEACH CENTER" title
#             card, running roughly 1s to 6s. That would sit on top of Ahmad's
#             name in the hero, so the first seven seconds are cut.
#   1600x900  more bits per pixel than 1080p at the same budget, and the hero is
#             behind a scrim, cropped to the viewport, so the extra width buys
#             nothing visible.
#   two pass  a fixed bitrate gives a predictable file size. CRF 30 came out at
#             29MB, which is far too heavy for something on the front page.
#   -an       it is a muted background loop. The audio is dead weight.
#
# The full quality version lives on YouTube and is reached from the project page
# through the click-to-load facade, so nothing is requested from Google here.
set -euo pipefail

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "usage: $0 <source-video>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/media/hero.mp4"
POSTER="$ROOT/public/media/hero-poster.jpg"
LOG="$(mktemp -d)/pass"

TRIM=7          # seconds cut from the head, to clear the title card
BITRATE=1150k
SCALE="scale=1600:900:flags=lanczos"

echo "pass 1 of 2"
ffmpeg -y -loglevel error -ss "$TRIM" -i "$SRC" -an -vf "$SCALE" \
  -c:v libx264 -preset slow -b:v "$BITRATE" -g 60 \
  -pass 1 -passlogfile "$LOG" -f null /dev/null

echo "pass 2 of 2"
ffmpeg -y -loglevel error -ss "$TRIM" -i "$SRC" -an -vf "$SCALE" \
  -c:v libx264 -preset slow -b:v "$BITRATE" -g 60 \
  -pass 2 -passlogfile "$LOG" \
  -profile:v high -level 4.0 -pix_fmt yuv420p -movflags +faststart "$OUT"

# The poster only shows while the video loads, and on narrow screens and for
# anyone who asked for reduced motion, where the video is never fetched at all.
ffmpeg -y -loglevel error -ss 5 -i "$OUT" -frames:v 1 -q:v 3 "$POSTER"

rm -rf "$(dirname "$LOG")"

echo
echo "hero.mp4        $(du -h "$OUT" | cut -f1)  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT" | cut -d. -f1)s"
echo "hero-poster.jpg $(du -h "$POSTER" | cut -f1)"
