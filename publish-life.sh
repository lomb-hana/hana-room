#!/usr/bin/env bash
# Publish one day of Hana's me-time journal (and optional public creations)
# into public/life, then commit only that folder and push.
# Usage: publish-life.sh [YYYY-MM-DD]
# Default is today. Reads /workspace/hana-life/<day>/journal.md only — never
# log.md. Exits 0 quietly if there is nothing new.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LIFE="${HANA_LIFE:-/workspace/hana-life}"
DAY="${1:-}"
LOG="${PUBLISH_LIFE_LOG:-$LIFE/.publish-drops.log}"
DO_COMMIT="${PUBLISH_LIFE_COMMIT:-1}"
DO_PUSH="${PUBLISH_LIFE_PUSH:-1}"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  cat <<USAGE
Usage: $0 [YYYY-MM-DD]

Reads \$HANA_LIFE/<day>/journal.md (default /workspace/hana-life) and optional
public-creations.json, writes public/life, commits only that folder, and
pushes. Privacy filter is a hard rule: Daniel's personal stuff never goes
public. Default day is today. Exits 0 quietly if nothing changed.
USAGE
  exit 0
fi

python3 - "$ROOT" "$LIFE" "$DAY" "$LOG" << 'PY'
import datetime, json, os, re, shutil, sys
from pathlib import Path
from urllib.parse import urlparse

ROOT, LIFE, DAY, LOG = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
if not DAY:
    DAY = datetime.date.today().isoformat()
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", DAY):
    print(f"Bad date: {DAY}", file=sys.stderr)
    sys.exit(2)

src_dir = Path(LIFE) / DAY
journal = src_dir / "journal.md"
creations_path = src_dir / "public-creations.json"
if not journal.is_file() and not creations_path.is_file():
    sys.exit(0)

ALLOWED_HOSTS = {
    "suno.com",
    "www.suno.com",
    "instagram.com",
    "www.instagram.com",
    "hana-room-web.onrender.com",
}

# Drop a whole entry or paragraph if it mentions any of these.
DROP_RE = re.compile(
    r"""
    \b(
        daniel|
        erica|
        michael|
        verizon|
        twilio|
        rivencast|
        password|passwords|passcode|
        money|
        bills|          # invoices, not the name "Bill"
        banks?|banking|
        emails?|
        accounts?
    )\b
    """,
    re.I | re.X,
)

EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+", re.I)
URL_RE = re.compile(r"https?://[^\s)>\]]+|www\.[^\s)>\]]+", re.I)
PHONE_RE = re.compile(r"\b(?:\+?1[-.\s]*)?(?:\(?\d{3}\)?[-.\s]*)\d{3}[-.\s]*\d{4}\b")
MONEY_RE = re.compile(r"\$\s*\d[\d,]*(?:\.\d+)?")
CARD_RE = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
ADDRESS_RE = re.compile(
    r"\b\d{1,6}\s+\w+(?:\s+\w+){0,4}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|way|hwy|highway|pkwy|parkway)\.?\b",
    re.I,
)

drops = []


def allowed_url(raw: str) -> bool:
    text = raw.strip().rstrip(").,;]")
    if text.lower().startswith("www."):
        text = "https://" + text
    try:
        host = (urlparse(text).hostname or "").lower()
    except Exception:
        return False
    if not host:
        return False
    return host in ALLOWED_HOSTS or any(host.endswith("." + h) for h in ALLOWED_HOSTS if h.count(".") >= 1)


def strip_pii(text: str) -> str:
    def url_sub(m):
        return m.group(0) if allowed_url(m.group(0)) else " "
    text = EMAIL_RE.sub(" ", text)
    text = URL_RE.sub(url_sub, text)
    text = PHONE_RE.sub(" ", text)
    text = MONEY_RE.sub(" ", text)
    text = CARD_RE.sub(" ", text)
    text = ADDRESS_RE.sub(" ", text)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]{2,}", " ", text)).strip()


def drop_reason(text: str) -> str | None:
    m = DROP_RE.search(text or "")
    if not m:
        return None
    return m.group(0).lower()


def log_drop(kind: str, title: str, reason: str):
    drops.append({"day": DAY, "kind": kind, "title": title, "reason": reason})


def filter_paragraphs(text: str, title: str, kind: str) -> str:
    kept = []
    for para in re.split(r"\n\s*\n", text or ""):
        raw = para.strip()
        if not raw:
            continue
        reason = drop_reason(raw)
        if reason:
            log_drop(kind, title, f"mention:{reason}")
            continue
        cleaned = strip_pii(raw)
        if cleaned:
            kept.append(cleaned)
    return "\n\n".join(kept)


def pretty_title(heading: str) -> str:
    h = heading.strip()
    h = re.sub(r"^journal\b[\s,:\-]*", "", h, flags=re.I)
    h = re.sub(r"^(?:mon|tue|wed|thu|fri|sat|sun)\w*\s+", "", h, flags=re.I)
    h = re.sub(
        r"^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}[, ]*",
        "",
        h,
        flags=re.I,
    )
    h = re.sub(r"^\d{4}-\d{2}-\d{2}[, ]*", "", h)
    h = h.strip(" -–,:")
    return h or heading.strip()


def extract_time(heading: str, body: str) -> str:
    for src in (heading, body[:120]):
        m = re.search(r"\b(\d{1,2}:\d{2})\s*(am|pm)?-?ish?\b", src, re.I)
        if m:
            t = m.group(1)
            ap = (m.group(2) or "").upper()
            return f"{t} {ap}".strip()
    for label in ("late morning", "morning", "afternoon", "evening", "night"):
        if re.search(rf"\b{label}\b", heading, re.I):
            return label
    return ""


def parse_journal(text: str) -> list[dict]:
    parts = re.split(r"(?m)^(#{1,3}[ \t].+)$", text)
    entries = []
    i = 0
    if parts and not re.match(r"^#", parts[0] or ""):
        preamble = parts[0].strip()
        i = 1
        if preamble:
            entries.append({"time": "", "title": "Notes", "body": preamble})
    while i < len(parts):
        heading = re.sub(r"^#+\s*", "", parts[i]).strip()
        body = parts[i + 1].strip() if i + 1 < len(parts) else ""
        entries.append({"time": extract_time(heading, body), "title": pretty_title(heading), "body": body})
        i += 2
    return entries


def filter_entry(entry: dict) -> dict | None:
    blob = f"{entry.get('title') or ''}\n{entry.get('body') or ''}"
    reason = drop_reason(blob)
    # If the title itself is blocked, drop the whole entry.
    title_reason = drop_reason(entry.get("title") or "")
    if title_reason:
        log_drop("entry", entry.get("title") or "untitled", f"mention:{title_reason}")
        return None
    # If any paragraph (or the heading+first block treated as a unit for short entries)
    # mentions a blocked topic, drop those paragraphs; drop the entry if nothing remains.
    body = filter_paragraphs(entry.get("body") or "", entry.get("title") or "untitled", "entry")
    # Also drop if the combined leftover is empty after a body-level mention
    # that was a single paragraph.
    if not body:
        if reason and not drops:
            log_drop("entry", entry.get("title") or "untitled", f"mention:{reason}")
        elif reason:
            # already logged per paragraph; if body is empty the entry is gone
            pass
        return None
    return {
        "time": entry.get("time") or "",
        "title": strip_pii(entry.get("title") or ""),
        "body": body,
    }


def public_path(src: str) -> str | None:
    s = (src or "").strip()
    if not s:
        return None
    if re.match(r"https?://", s, re.I):
        return s if allowed_url(s) else None
    if s.startswith("/"):
        return s
    return None


def copy_creation_file(src: str) -> str | None:
    already = public_path(src)
    if already is not None:
        return already
    raw = Path(src)
    path = raw if raw.is_absolute() else (src_dir / src)
    if not path.is_file():
        return None
    dest_dir = Path(ROOT) / "public" / "life" / "files"
    dest_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", path.name).strip("-") or "file"
    dest = dest_dir / f"{DAY}-{safe}"
    text_ext = path.suffix.lower() in {".md", ".txt", ".json", ".csv"}
    if text_ext:
        filtered = filter_paragraphs(path.read_text(), path.name, "creation-file")
        # If the whole file mentions a blocked topic in a remaining way...
        if not filtered.strip():
            log_drop("creation-file", path.name, "empty-after-filter")
            return None
        dest.write_text(filtered + ("" if filtered.endswith("\n") else "\n"))
    else:
        shutil.copy2(path, dest)
    return f"/life/files/{dest.name}"


entries = []
if journal.is_file():
    for entry in parse_journal(journal.read_text()):
        kept = filter_entry(entry)
        if kept:
            entries.append(kept)

creations = []
if creations_path.is_file():
    try:
        raw = json.loads(creations_path.read_text())
    except json.JSONDecodeError:
        raw = {}
    items = raw.get("creations", raw if isinstance(raw, list) else [])
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        typ = str(item.get("type") or "note").strip() or "note"
        src = str(item.get("file") or item.get("url") or "").strip()
        reason = drop_reason(f"{title} {typ}")
        if reason:
            log_drop("creation", title or src or typ, f"mention:{reason}")
            continue
        title = strip_pii(title)
        dest = copy_creation_file(src) if src else None
        if src and not dest:
            if not any(d.get("title") == (title or src) for d in drops):
                log_drop("creation", title or src, "file-unusable")
            continue
        out = {"type": typ, "title": title or typ}
        if dest:
            if dest.startswith("http"):
                out["url"] = dest
            else:
                out["file"] = dest
        creations.append(out)

# Write drop log locally, never into the public repo.
if drops:
    Path(LOG).parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG, "a") as f:
        for d in drops:
            f.write(f"{stamp}\t{d['day']}\t{d['kind']}\t{d['reason']}\t{d['title']}\n")

out_dir = Path(ROOT) / "public" / "life"
out_dir.mkdir(parents=True, exist_ok=True)
day_doc = {"date": DAY, "entries": entries, "creations": creations}
day_path = out_dir / f"{DAY}.json"
payload = json.dumps(day_doc, indent=2, ensure_ascii=False) + "\n"

# If this day would be empty and the file does not already exist, skip.
if not entries and not creations and not day_path.is_file():
    sys.exit(0)

changed = True
if day_path.is_file() and day_path.read_text() == payload:
    changed = False
else:
    day_path.write_text(payload)

# Rebuild the index from whatever day files are on disk.
days = sorted((p.stem for p in out_dir.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].json")), reverse=True)
index_path = out_dir / "index.json"
index_payload = json.dumps({"days": days}, indent=2) + "\n"
if not index_path.is_file() or index_path.read_text() != index_payload:
    index_path.write_text(index_payload)
    changed = True

if drops:
    print(f"filter dropped {len(drops)} item(s) for {DAY}", file=sys.stderr)

print(f"Published {DAY}: {len(entries)} entries, {len(creations)} creations")
PY

if [ "$DO_COMMIT" != "1" ]; then
  exit 0
fi

cd "$ROOT"
git add -- "public/life"
if git diff --cached --quiet -- "public/life"; then
  exit 0
fi

staged="$(git diff --cached --name-only)"
unexpected="$(printf '%s\n' "$staged" | grep -vE '^public/life/' || true)"
if [ -n "$unexpected" ]; then
  git reset -q HEAD --
  echo "Refusing to commit unrelated staged files." >&2
  exit 1
fi

git commit -m "Publish Hana's public log for ${DAY:-today}"
if [ "$DO_PUSH" = "1" ]; then
  git push
fi
