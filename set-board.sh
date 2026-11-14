#!/usr/bin/env bash
# Update Hana's corkboard: write public/board.json, commit, and push.
# Usage: set-board.sh "hot take" [note ...]
# Date is today's date in America/Chicago.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BOARD="$ROOT/public/board.json"

usage() {
  cat <<USAGE
Usage: $0 "hot take" [note ...]

Writes public/board.json, commits just that file, and pushes. Example:

  ./set-board.sh "A rainy window is just the room asking for a record." \
    "Water the little flower pot." "Keep Static Heart v1 on the platter."
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ $# -lt 1 ]; then
  usage
  [ $# -ge 1 ] || exit 2
  exit 0
fi

TAKE="$1"
shift || true

export TAKE
python3 - "$BOARD" "$@" << 'ENDPY'
import json, os, sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

path = Path(sys.argv[1])
notes = [n.strip() for n in sys.argv[2:] if n.strip()]
take = os.environ.get("TAKE", "").strip()
if not take:
    print("A hot take is required.", file=sys.stderr)
    sys.exit(2)
if len(take) > 200:
    take = take[:200].rstrip()
notes = [n[:120].rstrip() for n in notes[:8]]
today = datetime.now(ZoneInfo("America/Chicago")).date().isoformat()
data = {"hotTake": take, "date": today, "notes": notes}
path.write_text(json.dumps(data, indent=2) + "\n")
print(f"Updated corkboard for {today}: {take}")
ENDPY

cd "$ROOT"
git add -- public/board.json
if git diff --cached --quiet; then
  echo "Nothing to commit." >&2
  exit 1
fi
staged="$(git diff --cached --name-only)"
unexpected="$(printf '%s\n' "$staged" | grep -vE '^public/board\.json$' || true)"
if [ -n "$unexpected" ]; then
  git reset -q HEAD --
  echo "Refusing to commit unrelated staged files." >&2
  exit 1
fi
git commit -m "Update the corkboard hot take."
git push
