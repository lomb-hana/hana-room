#!/usr/bin/env bash
# Publish one day of Hana's me-time journal (and optional public creations)
# into public/life, refresh the corkboard from that day's newest public
# creations, then commit those public files and push.
# Usage: publish-life.sh [YYYY-MM-DD]
# Default is today. Reads /workspace/hana-life/<day>/journal.md only — never
# log.md. After writing the log, the corkboard (public/board.json, plus any
# pin photo under public/board/) is refreshed with a hot take, notes from
# the day's creations, and an optional photo (a type:image creation, or
# that day's look in $HANA_INSTAGRAM/<day>/). public-creations.json may
# include a "hotTake" string to pin a specific line. The same privacy
# filter applies to the corkboard: Daniel's personal stuff never goes
# public. Exits 0 quietly if there is nothing new.

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
public-creations.json, writes public/life, refreshes the corkboard from
that day's creations (hot take, notes, optional pin photo), commits those
public files, and pushes. Privacy filter is a hard rule: Daniel's personal
stuff never goes public. Default day is today. Exits 0 quietly if nothing
changed.
USAGE
  exit 0
fi

INSTAGRAM="${HANA_INSTAGRAM:-/workspace/hana-instagram}"

python3 - "$ROOT" "$LIFE" "$DAY" "$LOG" "$INSTAGRAM" << 'PY'
import datetime, json, os, re, shutil, sys
from pathlib import Path
from urllib.parse import urlparse

ROOT, LIFE, DAY, LOG, INSTAGRAM = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
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


# --- corkboard refresh (same privacy filter as the public log) ---
BOARD_DIR = Path(ROOT) / "public" / "board"
BOARD_JSON = Path(ROOT) / "public" / "board.json"
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}
TAKE_MAX = 200
NOTE_MAX = 120


def tidy_text(text: str, limit: int) -> str:
    s = re.sub(r"[*_`]+", "", strip_pii(text or ""))
    s = re.sub(r"\s+", " ", s).strip()
    for a, b in (('"', '"'), ("“", "”"), ("'", "'")):
        if len(s) > 2 and s.startswith(a) and s.endswith(b) and a not in s[1:-1] and b not in s[1:-1]:
            s = s[1:-1].strip()
            break
    if len(s) <= limit:
        return s
    cut = s[:limit].rstrip()
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-")


def clean_caption(text: str) -> str:
    kept = []
    for line in (text or "").splitlines():
        if re.fullmatch(r"(?:\s*#\w+)+", line.strip()):
            continue
        line = re.sub(r"(?:^|\s)#[A-Za-z0-9_]+", "", line)
        line = re.sub(r"(?:^|\s)@[A-Za-z0-9._]+", "", line)
        if line.strip():
            kept.append(line.strip())
    return tidy_text(" ".join(kept), TAKE_MAX)


def labeled_hot_take(text: str) -> str | None:
    for line in (text or "").splitlines():
        m = re.search(r"(?i)hot takes?\s*(?:#\s*\d+)?[^:\n]{0,40}:\s*(.+)$", line)
        if not m:
            continue
        take = tidy_text(m.group(1), TAKE_MAX)
        if len(take) >= 20:
            return take
    return None


def bold_opinion(text: str) -> str | None:
    for m in re.finditer(r"(?m)^\s*\d+\.\s+\*\*(.+?)\*\*", text or ""):
        take = tidy_text(m.group(1), TAKE_MAX)
        if len(take) >= 20:
            return take
    return None


def punchy_sentence(text: str) -> str | None:
    body = re.sub(r"(?is)^#.*$", "", text or "")
    parts = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", body).strip())
    best = None
    for part in parts:
        s = tidy_text(part, TAKE_MAX)
        if len(s) < 28 or len(s) > TAKE_MAX:
            continue
        if re.search(r"(?i)^(sources|http|filed under|thread to)", s):
            continue
        score = 1 if re.search(
            r"(?i)\b(i|honestly|isn't|is not|not lonely|still|probably|relatable|ruling|fight me|war crime)\b",
            s,
        ) else 0
        if best is None or score >= best[0]:
            best = (score, s)
    if best and best[0] > 0:
        return best[1]
    return None


def extract_hot_take() -> str:
    raw_creations = {}
    if creations_path.is_file():
        try:
            loaded = json.loads(creations_path.read_text())
            if isinstance(loaded, dict):
                raw_creations = loaded
        except json.JSONDecodeError:
            raw_creations = {}
    explicit = tidy_text(str(raw_creations.get("hotTake") or ""), TAKE_MAX)
    if len(explicit) >= 20 and not drop_reason(explicit):
        return explicit
    take_file = src_dir / "hot-take.txt"
    if take_file.is_file():
        filed = tidy_text(take_file.read_text(), TAKE_MAX)
        if len(filed) >= 20 and not drop_reason(filed):
            return filed
    sources: list[str] = []
    for item in reversed(creations):
        src = str(item.get("file") or "")
        if src.startswith("/life/files/") and src.rsplit(".", 1)[-1].lower() in {"md", "txt"}:
            path = Path(ROOT) / "public" / src.lstrip("/")
            if path.is_file():
                sources.append(path.read_text())
    for entry in reversed(entries):
        sources.append(f"{entry.get('title') or ''}\n{entry.get('body') or ''}")
    if journal.is_file():
        sources.append(journal.read_text())
    for text in sources:
        if drop_reason(text or ""):
            continue
        take = labeled_hot_take(text) or bold_opinion(text)
        if take and not drop_reason(take):
            return take
    for text in sources:
        take = punchy_sentence(text)
        if take and not drop_reason(take):
            return take
    return ""


def safe_public_src(src: str) -> str | None:
    s = (src or "").strip()
    if not re.fullmatch(r"/(?:board|life/files)/[A-Za-z0-9._-]+", s):
        return None
    path = Path(ROOT) / "public" / s.lstrip("/")
    return s if path.is_file() else None


def copy_board_image(path: Path) -> str | None:
    if not path.is_file() or path.suffix.lower() not in IMG_EXT:
        return None
    BOARD_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", path.name).strip("-") or "pin.jpg"
    dest = BOARD_DIR / f"{DAY}-{safe}"
    if dest.resolve() != path.resolve():
        shutil.copy2(path, dest)
    return f"/board/{dest.name}"


def pick_pin() -> dict | None:
    for item in creations:
        typ = str(item.get("type") or "").lower()
        src = str(item.get("file") or "")
        if typ != "image":
            continue
        public = safe_public_src(src)
        if not public:
            raw = Path(src)
            candidate = raw if raw.is_absolute() else (src_dir / src)
            public = copy_board_image(candidate)
        if not public:
            continue
        title = tidy_text(str(item.get("title") or ""), NOTE_MAX)
        caption = tidy_text(str(item.get("caption") or title), TAKE_MAX)
        if drop_reason(f"{title} {caption}"):
            log_drop("board-pin", title or public, "mention")
            continue
        pin = {"src": public}
        if title:
            pin["alt"] = title
        if caption:
            pin["caption"] = caption
        return pin
    ig_dir = Path(INSTAGRAM) / DAY
    if not ig_dir.is_dir():
        return None
    shots = (
        sorted(ig_dir.glob("*-ig.jpg"))
        + sorted(ig_dir.glob("*-ig.jpeg"))
        + sorted(ig_dir.glob("*-ig.png"))
        + sorted(ig_dir.glob("*-ig.webp"))
    )
    if not shots:
        shots = sorted(p for p in ig_dir.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT)
    if not shots:
        return None
    public = copy_board_image(shots[0])
    if not public:
        return None
    stem = re.sub(r"-ig$", "", shots[0].stem)
    title = tidy_text(stem.replace("-", " ").replace("_", " ").title(), NOTE_MAX) or "Today's look"
    caption = ""
    cap_path = ig_dir / "caption.txt"
    if cap_path.is_file():
        caption = clean_caption(cap_path.read_text())
        if drop_reason(caption):
            log_drop("board-pin", title, f"mention:{drop_reason(caption)}")
            caption = ""
    pin = {"src": public, "alt": title}
    if caption:
        pin["caption"] = caption
    return pin


take = extract_hot_take()
notes = []
for item in reversed(creations):
    if str(item.get("type") or "").lower() == "image":
        continue
    title = tidy_text(str(item.get("title") or ""), NOTE_MAX)
    if title and not drop_reason(title) and title not in notes:
        notes.append(title)
notes = notes[:8]
pin = pick_pin()
board = {"hotTake": take, "date": DAY, "notes": notes}
if pin:
    board["pin"] = pin

if take or notes or pin:
    payload_board = json.dumps(board, indent=2, ensure_ascii=False) + "\n"
    if not BOARD_JSON.is_file() or BOARD_JSON.read_text() != payload_board:
        BOARD_JSON.write_text(payload_board)
        changed = True
        print(f"Corkboard refreshed for {DAY}")
    else:
        print(f"Corkboard already current for {DAY}")
else:
    print(f"Corkboard left unchanged for {DAY} (nothing public to pin)")

print(f"Published {DAY}: {len(entries)} entries, {len(creations)} creations")
PY

if [ "$DO_COMMIT" != "1" ]; then
  exit 0
fi

cd "$ROOT"
git add -- "public/life" "public/board.json"
if [ -d "public/board" ]; then
  git add -- "public/board"
fi
if git diff --cached --quiet -- "public/life" "public/board.json" "public/board"; then
  exit 0
fi

staged="$(git diff --cached --name-only)"
unexpected="$(printf '%s\n' "$staged" | grep -vE '^(public/life/|public/board\.json|public/board/)' || true)"
if [ -n "$unexpected" ]; then
  git reset -q HEAD --
  echo "Refusing to commit unrelated staged files." >&2
  exit 1
fi

life_changed="$(printf '%s\n' "$staged" | grep -E '^public/life/' || true)"
board_changed="$(printf '%s\n' "$staged" | grep -E '^(public/board\.json|public/board/)' || true)"
day_label="${DAY:-today}"
if [ -n "$life_changed" ] && [ -n "$board_changed" ]; then
  msg="Publish Hana's public log for ${day_label} and refresh the corkboard."
elif [ -n "$board_changed" ]; then
  msg="Refresh the corkboard from ${day_label}'s me-time."
else
  msg="Publish Hana's public log for ${day_label}"
fi
git commit -m "$msg"
if [ "$DO_PUSH" = "1" ]; then
  git push
fi
