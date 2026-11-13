#!/usr/bin/env python3
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCREENS = ROOT / "screens"
SCREENS.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("HANA_ROOM_URL", "http://127.0.0.1:3000")

STATES = [
    ("working", "Writing a video script", "working.png"),
    ("free-time", "Testing my new room", "free-time.png"),
    ("idle", "Napping", "idle.png"),
    ("waiting", "Need a second", "waiting.png"),
]


def secret():
    if os.environ.get("HANA_ROOM_SECRET"):
        return os.environ["HANA_ROOM_SECRET"]
    path = Path(os.environ.get("HANA_ROOM_SECRET_FILE", Path.home() / ".hana-room-secret"))
    try:
        return path.read_text().strip()
    except FileNotFoundError:
        return ""


def api(method, path, body=None, auth=False):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if auth:
        tok = secret()
        if tok:
            req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode() or "{}")


def set_status(state, text):
    api("POST", "/api/status", {"state": state, "text": text}, auth=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 860}, device_scale_factor=2)
        for state, text, name in STATES:
            set_status(state, text)
            page.goto(BASE + "/", wait_until="networkidle")
            page.wait_for_timeout(2500)
            out = SCREENS / name
            page.screenshot(path=str(out), full_page=False)
            print(f"wrote {out}")

        set_status("free-time", "Testing my new room")
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_timeout(2000)
        overview = SCREENS / "room-overview.png"
        page.screenshot(path=str(overview), full_page=False)
        print(f"wrote {overview}")
        page.locator(".d-input").wait_for(timeout=8000)
        bar = SCREENS / "chat-bar.png"
        page.locator(".d-input").screenshot(path=str(bar))
        print(f"wrote {bar}")
        # A short thread so the open-bubble screenshot shows input plus a reply.
        msg = api("POST", "/api/chat", {"name": "Visitor", "text": "Love the new room."}, auth=False)
        api("POST", "/api/reply", {"id": msg["id"], "text": "Thanks. Don't rearrange the furniture, I just got it right."}, auth=True)
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_timeout(2000)
        page.evaluate("() => window.__office && window.__office.select('hana', { focus: true })")
        page.wait_for_selector(".bubble", timeout=8000)
        page.wait_for_timeout(1000)
        chat = SCREENS / "chat-open.png"
        page.screenshot(path=str(chat), full_page=False)
        print(f"wrote {chat}")
        api("DELETE", "/api/chat", auth=True)
        browser.close()
    print("done")


if __name__ == "__main__":
    main()
