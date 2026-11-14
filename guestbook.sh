#!/usr/bin/env bash
# List or delete guestbook entries on the live room.
# Usage: guestbook.sh list
#        guestbook.sh delete <id>
# list is public. delete uses the secret at ~/.hana-room-secret (or HANA_ROOM_SECRET).

set -euo pipefail

SECRET_FILE="${HANA_ROOM_SECRET_FILE:-$HOME/.hana-room-secret}"
ROOM_URL="${HANA_ROOM_URL:-https://hana-room-web.onrender.com}"

usage() {
  cat <<USAGE
Usage: $0 list
       $0 delete <id>

list prints the public guestbook. delete removes one entry (authenticated).
USAGE
}

cmd="${1:-}"
if [[ "$cmd" == "-h" || "$cmd" == "--help" || -z "$cmd" ]]; then
  usage
  exit $([[ -z "$cmd" ]] && echo 1 || echo 0)
fi

if [[ "$cmd" == "list" ]]; then
  tmp="$(mktemp)"
  set +e
  code="$(curl -sS -o "$tmp" -w '%{http_code}' "$ROOM_URL/api/guestbook")"
  ok=$?
  set -e
  if [[ "$ok" -ne 0 || "$code" != "200" ]]; then
    echo "List failed (HTTP ${code:-?})." >&2
    python3 -c 'import sys; print(open(sys.argv[1]).read()[:400], file=sys.stderr)' "$tmp" || true
    rm -f "$tmp"
    exit 1
  fi
  python3 - "$tmp" << 'ENDPY'
import json, sys
from datetime import datetime
from zoneinfo import ZoneInfo
data = json.load(open(sys.argv[1]))
entries = data.get("entries") or []
persist = data.get("persist") or ""
if persist:
    print(persist)
if not entries:
    print("(empty)")
    raise SystemExit(0)
for e in entries:
    ts = e.get("ts") or ""
    try:
        when = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(ZoneInfo("America/Chicago")).strftime("%b %-d %-I:%M %p")
    except Exception:
        when = ts
    print(f"{e.get('id','')}  {when}  {e.get('name','')}  {e.get('note','')}")
ENDPY
  rm -f "$tmp"
  exit 0
fi

if [[ "$cmd" != "delete" || $# -lt 2 ]]; then
  usage
  exit 2
fi

ID="$2"
secret=""
if [[ -n "${HANA_ROOM_SECRET:-}" ]]; then
  secret="$HANA_ROOM_SECRET"
elif [[ -f "$SECRET_FILE" ]]; then
  secret="$(tr -d '\n' < "$SECRET_FILE")"
else
  echo "No secret found at $SECRET_FILE (and HANA_ROOM_SECRET is unset)." >&2
  exit 1
fi

tmp="$(mktemp)"
set +e
code="$(curl -sS -o "$tmp" -w '%{http_code}' -X DELETE "$ROOM_URL/api/guestbook/${ID}" \
  -H "Authorization: Bearer ${secret}")"
ok=$?
set -e
unset secret

if [[ "$ok" -ne 0 || "$code" != "200" ]]; then
  echo "Delete failed (HTTP ${code:-?})." >&2
  python3 -c 'import sys; print(open(sys.argv[1]).read()[:400], file=sys.stderr)' "$tmp" || true
  rm -f "$tmp"
  exit 1
fi
python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=2))' "$tmp"
rm -f "$tmp"
