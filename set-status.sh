#!/usr/bin/env bash
# Update Hana's public room status.
# Prefers POST /api/status (instant, no redeploy). Falls back to committing
# public/status.json and pushing, the way the old static site worked.
# Status text must stay generic. Nothing personal, no bills, no accounts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATUS_FILE="$ROOT/public/status.json"
SECRET_FILE="${HANA_ROOM_SECRET_FILE:-$HOME/.hana-room-secret}"
ROOM_URL="${HANA_ROOM_URL:-https://hana-room-web.onrender.com}"
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

By default this posts to $ROOM_URL/api/status using the secret in
$SECRET_FILE (or HANA_ROOM_SECRET). If that fails, it falls back to
committing public/status.json and pushing, so a static deploy can pick it up.

--local writes the local file only (no API call, no commit or push).
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
if re.search(r'\b(?:verizon|cash\s*app|cashapp|varo)\b', lower):
    sys.stderr.write("Refusing to publish status text that names a personal account or bill. Keep it generic.\n")
    sys.exit(2)
PY

write_local() {
  python3 - "$STATUS_FILE" "$STATE" "$TEXT" << 'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
path, state, text = sys.argv[1], sys.argv[2], sys.argv[3]
Path(path).parent.mkdir(parents=True, exist_ok=True)
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
}

echo "Reminder: status text stays generic. Nothing personal goes on this page."

if [[ "$LOCAL_ONLY" -eq 1 ]]; then
  write_local
  echo "Local only: not calling the API or pushing."
  exit 0
fi

secret=""
if [[ -n "${HANA_ROOM_SECRET:-}" ]]; then
  secret="$HANA_ROOM_SECRET"
elif [[ -f "$SECRET_FILE" ]]; then
  secret="$(tr -d '\n' < "$SECRET_FILE")"
fi

if [[ -n "$secret" ]]; then
  body="$(python3 -c 'import json,sys; print(json.dumps({"state":sys.argv[1],"text":sys.argv[2]}))' "$STATE" "$TEXT")"
  tmp="$(mktemp)"
  set +e
  code="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$ROOM_URL/api/status" \
    -H "Authorization: Bearer ${secret}" \
    -H "Content-Type: application/json" \
    --data "$body")"
  curl_ok=$?
  set -e
  unset secret
  if [[ "$curl_ok" -eq 0 && "$code" == "200" ]]; then
    echo "Updated live status at $ROOM_URL (no redeploy needed)."
    python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=2))' "$tmp"
    rm -f "$tmp"
    mkdir -p "$(dirname "$STATUS_FILE")"
    # Keep a local copy in sync, but do not commit or push.
    python3 - "$STATUS_FILE" "$STATE" "$TEXT" << 'PY' >/dev/null
import json, sys
from datetime import datetime, timezone
from pathlib import Path
path, state, text = sys.argv[1], sys.argv[2], sys.argv[3]
Path(path).parent.mkdir(parents=True, exist_ok=True)
data = {"state": state, "text": text, "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
    exit 0
  fi
  echo "API update failed (HTTP ${code:-?}). Falling back to git push." >&2
  if [[ -f "$tmp" ]]; then
    # Do not print unexpected bodies that might be huge; a short error is enough.
    python3 -c 'import json,sys
from pathlib import Path
p=Path(sys.argv[1])
t=p.read_text()[:400]
try:
    d=json.loads(t)
    print(d.get("error") or t, file=sys.stderr)
except Exception:
    print(t or "(empty response)", file=sys.stderr)
' "$tmp" || true
    rm -f "$tmp"
  fi
else
  echo "No HANA_ROOM_SECRET or secret file; falling back to git push."
fi

write_local

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
