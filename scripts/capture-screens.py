#!/usr/bin/env python3
from datetime import datetime, timezone
from pathlib import Path
import json
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SCREENS = ROOT / "screens"
SCREENS.mkdir(parents=True, exist_ok=True)

STATES = [
    ("working", "Writing a video script", "working.png"),
    ("free-time", "Testing my new room", "free-time.png"),
    ("idle", "Napping", "idle.png"),
    ("waiting", "Need a second", "waiting.png"),
]


def write_status(state, text):
    data = {
        "state": state,
        "text": text,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    PUBLIC.joinpath("status.json").write_text(json.dumps(data, indent=2) + "\n")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = browser.new_page(
            viewport={"width": 1100, "height": 920},
            device_scale_factor=2,
        )
        url = "http://127.0.0.1:8765/index.html"
        for state, text, name in STATES:
            write_status(state, text)
            page.goto(url, wait_until="networkidle")
            page.wait_for_selector(f'.stage[data-state="{state}"]')
            time.sleep(0.8)
            out = SCREENS / name
            page.screenshot(path=str(out), full_page=True)
            print(f"wrote {out}")
        browser.close()
    write_status("free-time", "Testing my new room")
    print("restored default status")


if __name__ == "__main__":
    main()
