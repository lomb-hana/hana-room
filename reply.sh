#!/usr/bin/env bash
# Post Hana's reply to a visitor chat message.
# Usage: ./reply.sh <message-id> "<text>"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SECRET_FILE="${HANA_ROOM_SECRET_FILE:-$HOME/.hana-room-secret}"
ROOM_URL="${HANA_ROOM_URL:-https://hana-room-web.onrender.com}"

usage() {
  cat <<USAGE
Usage: $0 <message-id> "<text>"

Posts Hana's reply to a visitor message on the public room.
Reads the secret from $SECRET_FILE (or HANA_ROOM_SECRET).
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  usage
  exit $([[ $# -lt 2 ]] && echo 1 || echo 0)
fi

ID="$1"
TEXT="$2"

secret=""
if [[ -n "${HANA_ROOM_SECRET:-}" ]]; then
  secret="$HANA_ROOM_SECRET"
elif [[ -f "$SECRET_FILE" ]]; then
  secret="$(tr -d '\n' < "$SECRET_FILE")"
else
  echo "No secret found at $SECRET_FILE (and HANA_ROOM_SECRET is unset)." >&2
  exit 1
fi

body="$(python3 -c 'import json,sys; print(json.dumps({"id":sys.argv[1],"text":sys.argv[2]}))' "$ID" "$TEXT")"
tmp="$(mktemp)"
set +e
code="$(curl -sS -o "$tmp" -w '%{http_code}' -X POST "$ROOM_URL/api/reply" \
  -H "Authorization: Bearer ${secret}" \
  -H "Content-Type: application/json" \
  --data "$body")"
ok=$?
set -e
unset secret

if [[ "$ok" -ne 0 || "$code" != "200" ]]; then
  echo "Reply failed (HTTP ${code:-?})." >&2
  python3 -c 'import sys; print(open(sys.argv[1]).read()[:400], file=sys.stderr)' "$tmp" || true
  rm -f "$tmp"
  exit 1
fi
python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), indent=2))' "$tmp"
rm -f "$tmp"
