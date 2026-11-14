// Boot, I/O and side effects. All state lives in one store (state.ts) and only changes
// through dispatch(event); one subscribe pushes it to the canvas and the DOM.
//
//   /api/status (every ~20s) ─┐
//   /api/chat   (every ~4s)  ─┼──▶ dispatch ──▶ store ──▶ subscribe ──▶ viewer + hud
//   clicks: send, close bubble ┘
//
// There is no Grok Bot / Cursor sign-in. Hana's pose comes from /api/status;
// the chat bubble talks only to /api/chat and shows replies from /api/reply.

import './styles.css'
import { createStore } from 'zustand/vanilla'
import { setDither } from './engine/press.ts'
import type { Kind } from './engine/kinds.ts'
import { api, type ActivityFeed, type ChatMessage, type RoomState, type RoomStatus } from './api.ts'
import { createTerminal } from './ui/terminal.ts'
import { createRecords } from './ui/records.ts'
import { planOffice } from './layout.ts'
import { createViewer } from './scene/viewer.ts'
import { createHud, type View } from './ui/hud.ts'
import { createSound } from './sound.ts'
import { botById, bubbleOf, createEventLog, latestBotMessage, pendingSent, presenceOf, reduce, type OfficeEvent, type OfficeState } from './state.ts'
import type { FeedItem, Live, OfficeSnapshot, ReadState } from './protocol.ts'

const HANA_ID = 'hana'
const POLL_STATUS_MS = 20_000
const POLL_CHAT_MS = 4_000
const POLL_ACTIVITY_MS = 10_000
const STALE_MS = 30 * 60 * 1000
const STATES = new Set<RoomState>(['working', 'free-time', 'idle', 'waiting'])
const READ_KEY = 'hana-room-read-at'
const NAME_KEY = 'hana-room-name'

const view = document.querySelector<HTMLElement>('#view')!
const stage = document.querySelector<HTMLCanvasElement>('#stage')!

const initial: OfficeState = { mode: 'live', email: null, bots: [], selected: null, sent: {}, opened: {}, signingIn: null }
const store = createStore<OfficeState>(() => initial)
const log = createEventLog()
function dispatch(...events: OfficeEvent[]) {
  for (const event of events) log.push(event)
  store.setState((state) => events.reduce(reduce, state), true)
}

let kinds: Record<string, Kind> = {}
const sound = createSound()

const terminal = createTerminal({ host: view })
const records = createRecords({ host: view })

const viewer = createViewer({
  view,
  stage,
  onPick: (pick) => {
    if (pick?.item === 'crt-pc') {
      sound.play('tap')
      terminal.toggle()
      return
    }
    if (pick?.item === 'record-player') {
      sound.play('tap')
      records.toggle()
      return
    }
    select(pick?.botId ?? null, { focus: !pick?.bot })
  },
})
viewer.setMusic(() => records.isPlaying())
const hud = createHud({
  layer: document.querySelector('#layer')!,
  topbar: document.querySelector('#topbar')!,
  strip: document.querySelector('#strip')!,
  drawer: document.querySelector('#drawer')!,
  toasts: document.querySelector('#toasts')!,
  viewer,
  sound,
  actions: {
    select: (id) => select(id, { focus: true }),
    send,
    answer: async () => true,
    interrupt: async () => hud.toast('This page is chat-only.'),
    closeBubble,
    openBubble: (botId, entryId) => {
      sound.play('tap', { pitch: 3 })
      dispatch({ type: 'bubble.opened', botId, entryId })
    },
  },
})
viewer.onFrame(() => hud.place())

let status: RoomStatus = { state: 'free-time', text: 'Testing my new room', updated: null }
let messages: ChatMessage[] = []
let activity: ActivityFeed = { current: null, recent: [] }

function readAt(): number {
  const n = Number(localStorage.getItem(READ_KEY) || '0')
  return Number.isFinite(n) ? n : 0
}

function markReadLocal(at: number) {
  const prev = readAt()
  if (at > prev) localStorage.setItem(READ_KEY, String(at))
}

function effective(s: RoomStatus): RoomState {
  const state = STATES.has(s.state) ? s.state : 'idle'
  const then = Date.parse(s.updated || '')
  if (!Number.isFinite(then) || Date.now() - then > STALE_MS) return 'idle'
  return state
}

function liveOf(state: RoomState, s: RoomStatus, now: number): Live {
  const detail = s.text || null
  if (state === 'waiting') return { at: now, running: false, composing: false, retrying: false, activity: null, awaiting: 'chat', subagents: false }
  if (state === 'working') return { at: now, running: true, composing: false, retrying: false, activity: { kind: 'tool', tool: 'editor', detail }, awaiting: null, subagents: false }
  return { at: now, running: false, composing: false, retrying: false, activity: detail ? { kind: 'status', tool: null, detail } : null, awaiting: null, subagents: false }
}

function feedOf(list: ChatMessage[]): FeedItem[] {
  let seq = 0
  const items: FeedItem[] = []
  for (const m of list) {
    const at = Date.parse(m.ts) || Date.now()
    seq += 1
    items.push({ id: m.id, seq, updated: seq, at, who: m.name ? 'other' : 'user', kind: 'text', text: m.name ? `${m.name}: ${m.text}` : m.text, tool: null, app: null, card: null })
    seq += 1
    if (m.reply?.text) {
      const rt = Date.parse(m.reply.ts) || at + 1
      items.push({ id: `${m.id}-reply`, seq, updated: seq, at: rt, who: 'bot', kind: 'text', text: m.reply.text, tool: null, app: null, card: null })
    } else {
      items.push({ id: `${m.id}-reply`, seq, updated: seq, at: at + 1, who: 'bot', kind: 'text', text: m.ack || 'Hana will read this later', tool: null, app: null, card: null })
    }
  }
  return items
}

function officeOf(now: number): OfficeSnapshot {
  const state = effective(status)
  const lastActivityAt = state === 'idle' ? null : now
  const feed = feedOf(messages)
  const latest = [...feed].reverse().find((item) => item.who === 'bot')
  const read: ReadState = {
    at: now,
    lastViewedAt: readAt() || null,
    lastActivityAt,
    lastEntryId: latest?.id ?? null,
    unread: latest && latest.at > readAt() ? 1 : 0,
  }
  return {
    email: null,
    at: now,
    bots: [
      {
        bot: { id: HANA_ID, name: 'Hana', description: 'A sassy roommate with opinions.', shape: 'cloud', color: 'blush', isGroup: false, createdAt: null },
        live: liveOf(state, status, now),
        read,
        cursor: { generation: 1, seq: feed.at(-1)?.seq ?? 0 },
        automations: [],
        todos: [],
        tools: state === 'working' ? ['editor'] : [],
        feed,
      },
    ],
  }
}

function applyOffice() {
  dispatch({ type: 'office.loaded', mode: 'live', office: officeOf(Date.now()) })
}

function viewOf(state: OfficeState, now: number): View {
  return {
    mode: state.mode,
    email: state.email,
    selected: state.selected,
    signingIn: null,
    bots: state.bots.map((bot) => ({ bot, presence: presenceOf(state, bot, now), bubble: bubbleOf(state, bot), pending: pendingSent(state, bot) })),
  }
}

function render() {
  const state = store.getState()
  const now = Date.now()
  for (const bot of state.bots) viewer.setLive(bot.bot.id, presenceOf(state, bot, now))
  sound.setTypists(state.bots.filter((bot) => viewer.mood(bot.bot.id) === 'work').length)
  hud.update(viewOf(state, now))
}

store.subscribe((state, prev) => {
  const roomsOf = (s: OfficeState) => s.bots.map((b) => [b.bot, b.automations, b.todos, b.tools])
  const changed = state.bots.length !== prev.bots.length || roomsOf(state).some((parts, n) => parts.some((part, k) => part !== roomsOf(prev)[n]?.[k]))
  if (changed) {
    const now = Date.now()
    viewer.setOffice({
      plans: planOffice({ bots: state.bots, kinds }),
      kinds,
      lives: Object.fromEntries(state.bots.map((bot) => [bot.bot.id, presenceOf(state, bot, now)])),
      botLooks: Object.fromEntries(state.bots.map((b) => [b.bot.id, { shape: b.bot.shape, color: b.bot.color }])),
    })
  }
  if (state.mode === prev.mode && prev.bots.length) {
    for (const bot of state.bots) {
      const before = botById(prev, bot.bot.id)
      if (!before) continue
      const bubble = bubbleOf(state, bot)
      if (bubble && !bubble.mine && bubble.unread && bubble.key !== bubbleOf(prev, before)?.key) sound.play('reply')
      if (bot.live.awaiting && !before.live.awaiting) sound.play('needs')
      if (bot.live.running && !before.live.running) sound.play('wake')
    }
  }
  render()
})

function select(id: string | null, { focus }: { focus: boolean }) {
  if (id) sound.play('tap')
  const bot = id ? botById(store.getState(), id) : null
  const latest = bot ? latestBotMessage(bot) : null
  dispatch({ type: 'bot.selected', botId: id }, ...(id && latest ? [{ type: 'bubble.opened', botId: id, entryId: latest.id } as const] : []))
  if (id && focus) viewer.focus(id)
}

function closeBubble(botId: string) {
  const bot = botById(store.getState(), botId)
  const item = bot ? latestBotMessage(bot) : null
  sound.play('page')
  dispatch({ type: 'bubble.closed', botId })
  if (item) {
    markReadLocal(item.at)
    dispatch({ type: 'watch', event: { type: 'read', botId, read: { at: Date.now(), lastViewedAt: item.at, lastActivityAt: item.at, lastEntryId: item.id, unread: 0 } } })
  }
}

async function send(_botId: string, text: string) {
  const sent = { id: crypto.randomUUID(), text, at: Date.now() }
  sound.play('send')
  dispatch({ type: 'message.sent', botId: HANA_ID, sent })
  const name = localStorage.getItem(NAME_KEY) || undefined
  const result = await api.send({ name, text })
  if (result instanceof Error) {
    dispatch({ type: 'message.failed', botId: HANA_ID, id: sent.id })
    hud.toast(result.message, true)
    return false
  }
  await loadChat()
  return true
}

async function loadStatus() {
  const result = await api.status()
  if (result instanceof Error) {
    console.warn('status failed', result.message)
    return
  }
  status = { state: result.state, text: result.text || '', updated: result.updated }
  applyOffice()
}

async function loadChat() {
  const result = await api.chat()
  if (result instanceof Error) {
    console.warn('chat failed', result.message)
    return
  }
  messages = Array.isArray(result.messages) ? result.messages.slice(-30) : []
  applyOffice()
}

async function loadActivity() {
  const result = await api.activity()
  if (result instanceof Error) {
    console.warn('activity failed', result.message)
    return
  }
  activity = { current: result.current ?? null, recent: Array.isArray(result.recent) ? result.recent : [] }
  terminal.update(activity)
}

async function main() {
  setDither(false)
  // Bust the cache: kinds.json is a stable path, and a 1-hour cache of an older
  // catalogue would skip any furniture the current JS tries to place.
  const kindsUrl = `/kinds.json?v=${encodeURIComponent(new URL(import.meta.url).pathname.split('/').pop() || '1')}`
  const res = await fetch(kindsUrl)
  kinds = (await res.json()) as Record<string, Kind>
  viewer.start()
  applyOffice()
  await Promise.all([loadStatus(), loadChat(), loadActivity()])
  window.setInterval(() => void loadStatus(), POLL_STATUS_MS)
  window.setInterval(() => void loadChat(), POLL_CHAT_MS)
  window.setInterval(() => void loadActivity(), POLL_ACTIVITY_MS)
  window.setInterval(render, 1000)
  window.__office = { store, events: log.events, viewer: viewer.debug, glideTo: viewer.glideTo, select }
}

void main()

declare global {
  interface Window {
    __office?: { store: unknown; events: unknown; viewer: unknown; glideTo: unknown; select: (id: string | null, opts: { focus: boolean }) => void }
  }
}
