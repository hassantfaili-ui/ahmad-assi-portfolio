#!/usr/bin/env bash
# Rasterise selected pages of a PDF into public/media as web-sized JPEGs.
#
#   ./scripts/sheets.sh <pdf> <prefix> [first] [last] [width]
#
# Academic work arrives as multi-page PDFs. The site shows a curated set of
# sheets rather than every page, so page ranges are chosen per project.
set -euo pipefail
cd "$(dirname "$0")/.."
PDF="$1"; PREFIX="$2"; FIRST="${3:-1}"; LAST="${4:-4}"; W="${5:-2000}"
pdftoppm -jpeg -jpegopt quality=72 -scale-to "$W" -f "$FIRST" -l "$LAST" "$PDF" "public/media/$PREFIX" 2>/dev/null
# pdftoppm numbers from the first extracted page; normalise to two digits
for f in public/media/"$PREFIX"-*.jpg; do
  [ -f "$f" ] || continue
  n=$(basename "$f" .jpg | sed "s/^$PREFIX-//" | sed 's/^0*//')
  printf -v new "public/media/%s-%02d.jpg" "$PREFIX" "$n" 2>/dev/null || new=$(printf "public/media/%s-%02d.jpg" "$PREFIX" "$n")
  [ "$f" != "$new" ] && mv -f "$f" "$new"
done
ls public/media/"$PREFIX"-*.jpg | while read -r f; do echo "  $(basename "$f")  $(du -h "$f" | cut -f1)"; done
