const POLL_MS = 20000;
const STALE_MS = 30 * 60 * 1000;
const STATES = new Set(["working", "free-time", "idle", "waiting"]);

const LABELS = {
  working: "Working",
  "free-time": "On a break",
  idle: "Napping",
  waiting: "Waiting",
};

const stage = document.querySelector(".stage");
const labelEl = document.getElementById("state-label");
const textEl = document.getElementById("status-text");
const updatedEl = document.getElementById("updated");

let current = {
  state: "free-time",
  text: "Testing my new room",
  updated: null,
};

function effectiveState(status) {
  const state = STATES.has(status.state) ? status.state : "idle";
  const then = Date.parse(status.updated);
  if (!Number.isFinite(then) || Date.now() - then > STALE_MS) {
    return "idle";
  }
  return state;
}

function formatAgo(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "Last updated unknown";
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 20) return "Last updated just now";
  if (sec < 60) return `Last updated ${sec} seconds ago`;
  const min = Math.round(sec / 60);
  if (min === 1) return "Last updated 1 min ago";
  if (min < 60) return `Last updated ${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr === 1) return "Last updated 1 hour ago";
  if (hr < 24) return `Last updated ${hr} hours ago`;
  const days = Math.round(hr / 24);
  return days === 1 ? "Last updated 1 day ago" : `Last updated ${days} days ago`;
}

function apply(status) {
  current = status;
  const state = effectiveState(status);
  stage.dataset.state = state;
  labelEl.textContent = LABELS[state];
  textEl.textContent = status.text || "";
  updatedEl.textContent = formatAgo(status.updated);
}

async function loadStatus() {
  try {
    const res = await fetch(`./status.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    apply({
      state: data.state,
      text: typeof data.text === "string" ? data.text : "",
      updated: data.updated,
    });
  } catch (err) {
    updatedEl.textContent = "Could not load status";
    console.warn("status.json failed", err);
  }
}

apply(current);
loadStatus();
setInterval(loadStatus, POLL_MS);
setInterval(() => {
  if (current.updated) apply(current);
}, POLL_MS);
