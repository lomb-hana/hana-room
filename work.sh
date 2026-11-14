#!/usr/bin/env bash
# Start or finish a public-safe activity in Hana's Room.
# Usage: work.sh start "label"
#        work.sh done
# Uses ~/.hana-room-secret (or HANA_ROOM_SECRET) the same way set-status.sh does,
# and never prints it. If the room is unreachable, exits 0 quietly so it never
# breaks other work.

set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
SECRET_FILE="${HANA_ROOM_SECRET_FILE:-$HOME/.hana-room-secret}"
ROOM_URL="${HANA_ROOM_URL:-https://hana-room-web.onrender.com}"

usage() {
  cat <<USAGE
Usage: $0 start "label"
       $0 done

Examples:
  $0 start "coding on Hana's Room"
  $0 done
USAGE
}

ACTION="${1-}"
LABEL="${2-}"

if [[ "$ACTION" != "start" && "$ACTION" != "done" ]]; then
  usage >&2
  exit 1
fi
if [[ "$ACTION" == "start" && -z "$LABEL" ]]; then
  usage >&2
  exit 1
fi

secret=""
if [[ -n "${HANA_ROOM_SECRET:-}" ]]; then
  secret="$HANA_ROOM_SECRET"
elif [[ -f "$SECRET_FILE" ]]; then
  secret="$(tr -d '\n' < "$SECRET_FILE")"
fi
if [[ -z "$secret" ]]; then
  exit 0
fi

if [[ "$ACTION" == "start" ]]; then
  body="$(python3 -c 'import json,sys; print(json.dumps({"action":"start","label":sys.argv[1]}))' "$LABEL" 2>/dev/null)" || exit 0
else
  body='{"action":"done"}'
fi

tmp="$(mktemp 2>/dev/null)" || exit 0
set +e
code="$(curl -s -o "$tmp" -w '%{http_code}' --max-time 8 -X POST "$ROOM_URL/api/activity" \
  -H "Authorization: Bearer ${secret}" \
  -H "Content-Type: application/json" \
  --data "$body" 2>/dev/null)"
curl_ok=$?
set -e
unset secret

if [[ "$curl_ok" -ne 0 || "$code" != "200" ]]; then
  rm -f "$tmp"
  exit 0
fi

python3 - "$tmp" "$ACTION" << 'PY' 2>/dev/null || true
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text() or "{}")
action = sys.argv[2]
cur = data.get("current") or {}
status = data.get("status") or {}
if action == "start":
    label = cur.get("label") or status.get("text") or "started"
    print(f"Started: {label}")
else:
    state = status.get("state") or "idle"
    print(f"Done ({state}).")
PY
rm -f "$tmp"
exit 0
