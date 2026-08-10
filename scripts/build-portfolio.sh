#!/bin/bash
#
# Render the portfolio PDF from the site itself.
#
#   ./scripts/build-portfolio.sh
#
# The point of generating it rather than laying it out by hand: Ahmad sends a PDF
# to an application and a link alongside it, and the two have to tell the same
# story. Both read src/content/projects, so they cannot drift.
#
# How it works, and why it takes two builds:
#   1. Build. /print references /print/<name>.jpg, which does not exist yet. That
#      is fine, a static build does not check.
#   2. Read the built HTML to find exactly which images the document uses, and
#      downscale only those. Embedding the 2200px originals produces a 25MB PDF
#      and application portals reject it. 1400px at quality 72 is past what an A4
#      page resolves and lands the whole document around 5MB.
#   3. Build again so dist carries the new images.
#   4. Serve dist with astro preview, which honours the /ahmad-assi-portfolio base
#      path. Chrome cannot resolve absolute asset paths over file://, so a real
#      server is needed.
#   5. Print with headless Chrome, then put public/print back the way it was.
#
# The PDF lands in public/portfolio/ and is committed. Everything in public/print
# is scratch and is deleted.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=4399
BASE=$(node -e "console.log(require('./astro.config.mjs').default.base ?? '')" 2>/dev/null || echo "/ahmad-assi-portfolio")
OUT="$ROOT/public/portfolio/Ahmad_Assi_Portfolio.pdf"
MAXW=1400
QUALITY=3          # ffmpeg -q:v, roughly quality 72

[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")" public/print

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$ROOT/public/print"
}
trap cleanup EXIT

echo "1/5  building to discover the image list"
npm run build --silent >/dev/null

echo "2/5  making print sized copies"
python3 - "$MAXW" "$QUALITY" <<'PY'
import pathlib, re, subprocess, sys

maxw, q = sys.argv[1], sys.argv[2]
html = pathlib.Path('dist/print/index.html')
if not html.exists():
    sys.exit('dist/print/index.html missing: did the build fail?')

names = sorted(set(re.findall(r'/print/([^"\'?\s>]+\.(?:jpg|jpeg|png))', html.read_text())))
src_dir, out_dir = pathlib.Path('public/media'), pathlib.Path('public/print')
out_dir.mkdir(exist_ok=True)

made = missing = 0
for n in names:
    src = src_dir / n
    if not src.exists():
        print(f'   !! no source for {n}')
        missing += 1
        continue
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(src),
         '-vf', f"scale='min({maxw},iw)':-2:flags=lanczos",
         '-q:v', q, '-pix_fmt', 'yuvj420p', str(out_dir / n)],
        check=True, stdin=subprocess.DEVNULL)
    made += 1

total = sum(f.stat().st_size for f in out_dir.iterdir() if f.is_file())
print(f'   {made} images, {total / 1048576:.1f}MB' + (f', {missing} MISSING' if missing else ''))
if missing:
    sys.exit(1)
PY

echo "3/5  rebuilding with the print images"
npm run build --silent >/dev/null

echo "4/5  serving dist"
npx astro preview --port "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://localhost:$PORT$BASE/print" && break
  sleep 0.5
done
curl -sf -o /dev/null "http://localhost:$PORT$BASE/print" \
  || { echo "preview server never answered on $PORT" >&2; exit 1; }

echo "5/5  printing"
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --hide-scrollbars \
  --virtual-time-budget=20000 \
  --no-pdf-header-footer \
  --print-to-pdf-no-header \
  --print-to-pdf="$OUT" \
  "http://localhost:$PORT$BASE/print" 2>/dev/null

[ -s "$OUT" ] || { echo "Chrome produced no PDF" >&2; exit 1; }

PAGES=$(python3 - "$OUT" <<'PY'
import re, sys
data = open(sys.argv[1], 'rb').read()
counts = [int(m.group(1)) for m in re.finditer(rb'/Count\s+(\d+)', data)]
print(max(counts) if counts else '?')
PY
)

echo
echo "$OUT"
echo "  $(du -h "$OUT" | cut -f1), $PAGES pages"
