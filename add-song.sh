#!/usr/bin/env bash
# Add a song to Hana's records: copy the mp3 into public/music, update
# public/music/songs.json, commit those two files, and push.
# Usage: add-song.sh <mp3> "<title>"
# Duration is read with ffprobe. The added date is today's date.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MUSIC="$ROOT/public/music"
MANIFEST="$MUSIC/songs.json"

usage() {
  cat <<USAGE
Usage: $0 <mp3> "<title>"

Copies the file into public/music, updates public/music/songs.json, commits
just those files, and pushes. Example:

  ./add-song.sh ./new-track.mp3 "Static Heart (demo)"
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ $# -lt 2 ]; then
  usage
  [ $# -ge 2 ] || exit 2
  exit 0
fi

SRC="$1"
TITLE="$2"

if [ ! -f "$SRC" ]; then
  echo "No such file: $SRC" >&2
  exit 1
fi
if [ -z "$TITLE" ]; then
  echo "Title is required." >&2
  exit 2
fi

mkdir -p "$MUSIC"
base="$(basename "$SRC")"
safe="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/-+/-/g; s/^[-.]+//; s/[-.]+$//')"
case "$safe" in
  *.mp3) ;;
  *) safe="${safe}.mp3" ;;
esac
if [ -z "$safe" ] || [ "$safe" = ".mp3" ]; then
  echo "Could not make a safe filename from $base" >&2
  exit 1
fi

dest="$MUSIC/$safe"
if [ -e "$dest" ]; then
  echo "Already exists: public/music/$safe" >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe is required to read the duration." >&2
  exit 1
fi

secs="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SRC")"
if [ -z "$secs" ]; then
  echo "Could not read duration from $SRC" >&2
  exit 1
fi

added="$(date +%Y-%m-%d)"
cp -a "$SRC" "$dest"

python3 - "$MANIFEST" "$TITLE" "$safe" "$secs" "$added" << 'PY'
import json, math, sys
from pathlib import Path

path, title, file, secs, added = sys.argv[1:]
p = Path(path)
data = {"songs": []}
if p.exists():
    try:
        loaded = json.loads(p.read_text())
        if isinstance(loaded, dict) and isinstance(loaded.get("songs"), list):
            data = loaded
    except json.JSONDecodeError:
        pass
duration = int(round(float(secs)))
if duration < 0:
    duration = 0
songs = [s for s in data.get("songs", []) if not (isinstance(s, dict) and s.get("file") == file)]
songs.append({"title": title, "file": file, "duration": duration, "added": added})
data["songs"] = songs
p.write_text(json.dumps(data, indent=2) + "\n")
print(f"Added: {title} ({duration}s) -> public/music/{file}")
PY

cd "$ROOT"
# Only the new song and the manifest belong in this commit.
git add -- "public/music/$safe" "public/music/songs.json"
if git diff --cached --quiet; then
  echo "Nothing to commit." >&2
  exit 1
fi
# Refuse if the index also has unrelated staged files.
staged="$(git diff --cached --name-only)"
unexpected="$(printf '%s\n' "$staged" | grep -vE '^public/music/(songs\.json|'"$safe"')$' || true)"
if [ -n "$unexpected" ]; then
  git reset -q HEAD --
  echo "Refusing to commit unrelated staged files." >&2
  exit 1
fi
git commit -m "Add song: ${TITLE}"
git push
