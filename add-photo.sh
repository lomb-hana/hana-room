#!/usr/bin/env bash
# Add a photo to Hana's photo album: resize a copy to web size (JPEG, about
# 1080px on the long side, under ~400 KB, metadata stripped) into
# public/photobook, update public/photobook/photos.json (newest first),
# commit just those files, pull --rebase, and push.
# Usage: add-photo.sh <image> "<caption>" [YYYY-MM-DD]
# Set PHOTO_NO_GIT=1 to only copy + update the manifest (no commit/push).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BOOK="$ROOT/public/photobook"
MANIFEST="$BOOK/photos.json"
MAX_SIDE=1080
MAX_BYTES=409600

usage() {
  cat <<USAGE
Usage: $0 <image> "<caption>" [YYYY-MM-DD]

Resizes the image to a web JPEG in public/photobook, adds it to
public/photobook/photos.json (newest first), commits just those files, and
pushes. The date defaults to today (America/Chicago). Example:

  ./add-photo.sh ~/pics/booth.jpg "Four frames of me being smug." 2026-11-23
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ $# -lt 2 ]; then
  usage
  [ $# -ge 2 ] || exit 2
  exit 0
fi

SRC="$1"
CAPTION="$2"
DATE="${3:-$(TZ=America/Chicago date +%Y-%m-%d)}"

if [ ! -f "$SRC" ]; then
  echo "No such file: $SRC" >&2
  exit 1
fi
if [ -z "$CAPTION" ]; then
  echo "Caption is required." >&2
  exit 2
fi
if ! printf '%s' "$DATE" | grep -Eq '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'; then
  echo "Date must look like YYYY-MM-DD: $DATE" >&2
  exit 2
fi
for tool in ffmpeg node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is required." >&2
    exit 1
  fi
done

mkdir -p "$BOOK"
base="$(basename "$SRC")"
stem="${base%.*}"
stem="$(printf '%s' "$stem" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]+/-/g; s/-+/-/g; s/^[-_]+//; s/[-_]+$//' | cut -c1-60)"
[ -n "$stem" ] || stem="photo"
case "$stem" in
  "$DATE"-*) safe="${stem}.jpg" ;;
  *) safe="${DATE}-${stem}.jpg" ;;
esac

dest="$BOOK/$safe"
if [ -e "$dest" ]; then
  echo "Already exists: public/photobook/$safe" >&2
  exit 1
fi

# Scale down only (never up) so the long side is at most MAX_SIDE, drop all
# metadata, and step the quality down until it fits under MAX_BYTES.
tmp="$(mktemp --suffix=.jpg)"
trap 'rm -f "$tmp"' EXIT
scale="scale='if(gte(iw,ih),min(${MAX_SIDE},iw),-2)':'if(gte(iw,ih),-2,min(${MAX_SIDE},ih))':flags=lanczos,format=yuvj420p"
ok=0
for q in 3 4 5 6 8 10 12; do
  ffmpeg -nostdin -loglevel error -y -i "$SRC" -frames:v 1 -vf "$scale" -map_metadata -1 -flags +bitexact -fflags +bitexact -q:v "$q" "$tmp"
  size="$(stat -c %s "$tmp")"
  if [ "$size" -le "$MAX_BYTES" ]; then
    ok=1
    break
  fi
done
if [ "$ok" != 1 ]; then
  echo "Could not get $base under $((MAX_BYTES / 1024)) KB." >&2
  exit 1
fi
cp "$tmp" "$dest"
chmod 644 "$dest"

node - "$MANIFEST" "$DATE" "$safe" "$CAPTION" <<'JS'
const fs = require('fs')
const [path, date, file, caption] = process.argv.slice(2)
let data = { photos: [] }
try {
  const loaded = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (loaded && Array.isArray(loaded.photos)) data = loaded
} catch {}
const rest = data.photos.filter((p) => p && typeof p === 'object' && p.file !== file)
// Newest first; a new photo goes ahead of others from the same day.
const photos = [{ date, file, caption }, ...rest].map((p, n) => ({ p, n }))
photos.sort((a, b) => (a.p.date === b.p.date ? a.n - b.n : a.p.date < b.p.date ? 1 : -1))
data.photos = photos.map(({ p }) => p)
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
console.log(`Added: ${date} -> public/photobook/${file} (${fs.statSync(require('path').join(require('path').dirname(path), file)).size} bytes)`)
JS

if [ "${PHOTO_NO_GIT:-}" = "1" ]; then
  exit 0
fi

cd "$ROOT"
# Only the new photo and the manifest belong in this commit.
git add -- "public/photobook/$safe" "public/photobook/photos.json"
if git diff --cached --quiet; then
  echo "Nothing to commit." >&2
  exit 1
fi
staged="$(git diff --cached --name-only)"
unexpected="$(printf '%s\n' "$staged" | grep -vxF -e "public/photobook/photos.json" -e "public/photobook/$safe" || true)"
if [ -n "$unexpected" ]; then
  git reset -q HEAD -- "public/photobook/$safe" "public/photobook/photos.json"
  echo "Refusing to commit: other files are already staged." >&2
  exit 1
fi
git commit -m "Add photo: ${DATE} ${safe}"
git pull --rebase --autostash
git push
