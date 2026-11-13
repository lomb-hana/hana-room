#!/usr/bin/env bash
# Update Hana's public room status and, by default, push it live.
# Status text must stay generic. Nothing personal, no bills, no accounts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATUS_FILE="$ROOT/public/status.json"
LOCAL_ONLY=0
STATE=""
TEXT=""

usage() {
  cat <<USAGE
Usage: $0 [--local] <state> "<text>"

States: working, free-time, idle, waiting

Examples:
  $0 working "Writing a video script"
  $0 free-time "Making a playlist"
  $0 idle "Napping"
  $0 waiting "Need a second"
  $0 --local free-time "Testing my new room"

--local updates the file only (no commit or push).
Without --local, this commits status.json and pushes to origin so Render can redeploy.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) LOCAL_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [[ -z "$STATE" ]]; then
        STATE="$1"
        shift
      elif [[ -z "$TEXT" ]]; then
        TEXT="$1"
        shift
      else
        echo "Too many arguments." >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$STATE" || -z "$TEXT" ]]; then
  usage >&2
  exit 1
fi

case "$STATE" in
  working|free-time|idle|waiting) ;;
  *)
    echo "Unknown state: $STATE" >&2
    echo "Use: working, free-time, idle, or waiting." >&2
    exit 1
    ;;
esac

# Reject obviously personal or account-related text. This is a safety net, not a complete filter.
python3 - "$TEXT" << 'PY'
import re, sys
text = sys.argv[1]
lower = text.lower()
patterns = [
    (r'[\w.+-]+@[\w.-]+\.\w+', "email address"),
    (r'\$\s*\d', "dollar amount"),
    (r'\b\d{8,}\b', "long number"),
    (r'\b(?:password|passwd|ssn|social security|routing|iban|visa|mastercard)\b', "sensitive term"),
]
for pat, label in patterns:
    if re.search(pat, text, re.I):
        sys.stderr.write(f"Refusing to publish status text that looks like a {label}. Keep it generic.\n")
        sys.exit(2)
banned = ("verizon", "cash app", "cashapp", "var o", "varo", "account ending", "last four")
# "varo" as a whole word only
if re.search(r'\b(?:verizon|cash\s*app|cashapp|varo)\b', lower):
    sys.stderr.write("Refusing to publish status text that names a personal account or bill. Keep it generic.\n")
    sys.exit(2)
PY

python3 - "$STATUS_FILE" "$STATE" "$TEXT" << 'PY'
import json, sys
from datetime import datetime, timezone
path, state, text = sys.argv[1], sys.argv[2], sys.argv[3]
data = {
    "state": state,
    "text": text,
    "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(f"Updated {path}")
print(json.dumps(data, indent=2))
PY

echo "Reminder: status text stays generic. Nothing personal goes on this page."

if [[ "$LOCAL_ONLY" -eq 1 ]]; then
  echo "Local only: not committing or pushing."
  exit 0
fi

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repo yet, so the file was updated but not pushed."
  exit 0
fi

if ! git -C "$ROOT" remote get-url origin >/dev/null 2>&1; then
  echo "No origin remote, so the file was updated but not pushed."
  exit 0
fi

git -C "$ROOT" add -- "public/status.json"
if git -C "$ROOT" diff --cached --quiet; then
  echo "No status change to commit."
  exit 0
fi

git -C "$ROOT" commit -m "status: ${STATE} - ${TEXT}"
git -C "$ROOT" push origin HEAD
echo "Pushed. Render should redeploy in about a minute."
