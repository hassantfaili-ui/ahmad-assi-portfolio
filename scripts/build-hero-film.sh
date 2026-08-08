#!/usr/bin/env bash
# Rebuilds public/media/hero.mp4 and its poster from the project renders.
#
# Only image-led renders, and only from projects the footage can be honestly
# credited to: the Lincoln Beach Center aerial and the Renewal Square aerial.
# Text-carrying sheets were tried and dropped; their own paragraphs fight the
# hero copy sitting over the film.
#
# Encoded at 1080p and a high bitrate: this is the first thing a visitor sees and
# it should not look like a compressed background loop.
#
# Three clips, so it loops cleanly: the house render panning one way, the
# masterplan panning the other, then the house render panning back to where it
# started. The last frame therefore lands close to the first.
#
#   ./scripts/build-hero-film.sh
#
# Requires ffmpeg (brew install ffmpeg).
set -euo pipefail
cd "$(dirname "$0")/.."

D=6                      # seconds per clip
X=1.4                    # crossfade
OUT=public/media/hero.mp4
A=public/media/lb-birdseye-1.jpg
B=public/media/gh-aerial.jpg

# xfade consumes the overlap, so each offset steps by D - X
O1=$(echo "$D - $X" | bc)
O2=$(echo "2 * ($D - $X)" | bc)

ffmpeg -y -hide_banner -loglevel error \
  -loop 1 -t $D -i "$A" \
  -loop 1 -t $D -i "$B" \
  -loop 1 -t $D -i "$A" \
  -filter_complex "\
[0:v]scale=2400:-2,crop=1920:1080:x='(iw-ow)*(t/$D)':y='(ih-oh)/2',setsar=1,fps=25,format=yuv420p[v0];\
[1:v]scale=2400:-2,crop=1920:1080:x='(iw-ow)*(1-t/$D)':y='(ih-oh)/2',setsar=1,fps=25,format=yuv420p[v1];\
[2:v]scale=2400:-2,crop=1920:1080:x='(iw-ow)*(1-t/$D)':y='(ih-oh)/2',setsar=1,fps=25,format=yuv420p[v2];\
[v0][v1]xfade=transition=fade:duration=$X:offset=$O1[x1];\
[x1][v2]xfade=transition=fade:duration=$X:offset=$O2[vout]" \
  -map "[vout]" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart -an \
  "$OUT"

ffmpeg -y -hide_banner -loglevel error -i "$OUT" \
  -vf "select=eq(n\,10)" -frames:v 1 -q:v 6 public/media/hero-poster.jpg

echo "built $OUT ($(du -h "$OUT" | cut -f1)), $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s"
