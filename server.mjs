// Tiny Node server for Hana's Room: static files from dist/ plus status and chat APIs.
// No Grok Bot / Cursor credentials are used or requested.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { BLOCKED_MESSAGE, containsBlocked } from './moderation.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data')
const STATUS_FILE = path.join(DATA, 'status.json')
const CHAT_FILE = path.join(DATA, 'chat.json')
const ACTIVITY_FILE = path.join(DATA, 'activity.json')
const GUESTBOOK_FILE = process.env.GUESTBOOK_FILE || path.join(DATA, 'guestbook.json')
const MAX_GUEST_NAME = 24
const MAX_GUEST_NOTE = 200
const MAX_GUEST = 200
const GUEST_IP_MS = 10 * 60 * 1000
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const STATES = new Set(['working', 'free-time', 'idle', 'waiting'])
const MAX_TEXT = 300
const MAX_LABEL = 60
const STALE_WORK_MS = 45 * 60 * 1000
const CHAT_NAME_MIN = 2
const CHAT_NAME_MAX = 20
const MAX_CHAT = 200
const PER_IP_MS = 20_000
const GLOBAL_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000

fs.mkdirSync(DATA, { recursive: true })

const defaultStatus = () => ({
  state: 'idle',
  text: 'Moved into my new iso room',
  updated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
})

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

let status = readJson(STATUS_FILE, null)
if (!status || !STATES.has(status.state)) {
  status = defaultStatus()
  writeJson(STATUS_FILE, status)
}

let messages = readJson(CHAT_FILE, { messages: [] })
if (!Array.isArray(messages.messages)) messages = { messages: [] }

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function sanitizeLabel(value) {
  let text = cleanText(value ?? '', 400)
  const patterns = [
    /[\w.+-]+@[\w.-]+\.\w+/gi,
    /https?:\/\/\S+/gi,
    /\bwww\.\S+/gi,
    /\$\s*\d[\d,]*(?:\.\d+)?/g,
    /\b(?:\d[ -]*?){13,19}\b/g,
    /\b(?:\+?1[-.\s]*)?(?:\(?\d{3}\)?[-.\s]*)\d{3}[-.\s]*\d{4}\b/g,
  ]
  for (const pat of patterns) text = text.replace(pat, ' ')
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)
}

function asCurrent(entry) {
  if (!entry || typeof entry !== 'object') return null
  const label = typeof entry.label === 'string' ? entry.label : ''
  const started = typeof entry.started === 'string' ? entry.started : ''
  if (!label || !started) return null
  return { label, started }
}

function asRecent(entry) {
  const cur = asCurrent(entry)
  if (!cur) return null
  const ended = typeof entry.ended === 'string' ? entry.ended : ''
  if (!ended) return null
  return { label: cur.label, started: cur.started, ended }
}

function loadActivity() {
  const raw = readJson(ACTIVITY_FILE, { current: null, recent: [] })
  const recent = Array.isArray(raw.recent) ? raw.recent.map(asRecent).filter(Boolean) : []
  return { current: asCurrent(raw.current), recent }
}

let activity = loadActivity()

function saveActivity() {
  writeJson(ACTIVITY_FILE, {
    current: activity.current,
    recent: activity.recent.slice(-20),
  })
}

function setStatus(state, text) {
  status = { state, text, updated: nowIso() }
  writeJson(STATUS_FILE, status)
}

function finishCurrent(ended) {
  if (!activity.current) return
  activity.recent.push({ label: activity.current.label, started: activity.current.started, ended })
  if (activity.recent.length > 20) activity.recent = activity.recent.slice(-20)
  activity.current = null
}

function expireIfStale() {
  if (status.state !== 'working') return false
  const then = Date.parse(status.updated || '')
  if (!Number.isFinite(then) || Date.now() - then < STALE_WORK_MS) return false
  finishCurrent(nowIso())
  setStatus('idle', 'Idle')
  saveActivity()
  return true
}

function publicActivity() {
  expireIfStale()
  return {
    current: activity.current,
    recent: activity.recent.slice(-10),
  }
}

setInterval(expireIfStale, 60_000)

const ipLast = new Map()
const globalTimes = []

function loadSecret() {
  if (process.env.HANA_ROOM_SECRET) return process.env.HANA_ROOM_SECRET
  const file = process.env.HANA_ROOM_SECRET_FILE || path.join(process.env.HOME || '', '.hana-room-secret')
  try {
    const text = fs.readFileSync(file, 'utf8').trim()
    return text || null
  } catch {
    return null
  }
}

const SECRET = loadSecret()

function isLoopback(req) {
  const ip = clientIp(req)
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function authorized(req) {
  const got =
    bearer(req.headers.authorization) ||
    header(req, 'x-hana-room-secret') ||
    ''
  if (SECRET) return timingSafe(got, SECRET)
  // Local dev only: if no secret is configured, allow loopback writes.
  return isLoopback(req)
}

function header(req, name) {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

function bearer(value) {
  if (!value) return ''
  const s = Array.isArray(value) ? value[0] : value
  return s.startsWith('Bearer ') || s.startsWith('bearer ') ? s.slice(7).trim() : s.trim()
}

function timingSafe(a, b) {
  const A = Buffer.from(String(a))
  const B = Buffer.from(String(b))
  if (A.length !== B.length) {
    crypto.timingSafeEqual(A.length ? A : Buffer.from('x'), A.length ? A : Buffer.from('x'))
    return false
  }
  return crypto.timingSafeEqual(A, B)
}

function clientIp(req) {
  const forwarded = header(req, 'x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const raw = req.socket?.remoteAddress || ''
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw
}

function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  let text = value.replace(/<[^>]*>/g, '')
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

const RESERVED_CHAT_NAMES = new Set(['hana', 'daniel', 'tenderqwerty'])

function reservedChatKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function validateChatName(raw) {
  const name = cleanText(raw ?? '', CHAT_NAME_MAX)
  if (name.length < CHAT_NAME_MIN || name.length > CHAT_NAME_MAX) {
    return { error: 'Pick a name between 2 and 20 characters.' }
  }
  if (RESERVED_CHAT_NAMES.has(reservedChatKey(name))) {
    return { error: 'That name is reserved. Please pick another.' }
  }
  if (containsBlocked(name)) return { error: BLOCKED_MESSAGE }
  return { name }
}

function send(res, statusCode, body, extra = {}) {
  const data = JSON.stringify(body)
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  })
  res.end(data)
}

function notAuthorized(res) {
  send(res, 401, { error: 'Missing or invalid authorization.' })
}

async function readBody(req, limit = 12_000) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('too-large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new Error('bad-json')
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0])
  const clean = path.posix.normalize('/' + decoded).replace(/^\/+/, '')
  const full = path.resolve(root, clean)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return full
}

function serveStatic(req, res, urlPath) {
  let file = safeJoin(DIST, urlPath)
  if (!file) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  let stat = null
  try {
    stat = fs.statSync(file)
  } catch {
    stat = null
  }
  if (stat?.isDirectory()) file = path.join(file, 'index.html')
  if (!stat || stat.isDirectory()) {
    try {
      stat = fs.statSync(file)
    } catch {
      // SPA fallback
      file = path.join(DIST, 'index.html')
      try {
        stat = fs.statSync(file)
      } catch {
        res.writeHead(404)
        return res.end('Not found')
      }
    }
  }
  const ext = path.extname(file).toLowerCase()
  const type = MIME[ext] || 'application/octet-stream'
  const isMedia = ext === '.mp3' || ext === '.wav' || ext === '.ogg' || ext === '.m4a'
  const cache = ext === '.html' ? 'no-store' : ext === '.json' ? 'no-cache, must-revalidate' : isMedia ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
  const size = stat.size
  const headers = {
    'content-type': type,
    'cache-control': cache,
    'accept-ranges': 'bytes',
  }
  const range = header(req, 'range')
  if (range && req.method !== 'HEAD') {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
    if (!m) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return res.end()
    }
    let start = m[1] === '' ? size - Number(m[2] || size) : Number(m[1])
    let end = m[2] === '' ? size - 1 : Number(m[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return res.end()
    }
    end = Math.min(end, size - 1)
    res.writeHead(206, {
      ...headers,
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${size}`,
    })
    fs.createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'content-length': size })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file).pipe(res)
}

function publicMessage(m) {
  return {
    id: m.id,
    name: m.name,
    text: m.text,
    ts: m.ts,
    reply: m.reply ? { text: m.reply.text, ts: m.reply.ts } : null,
    ack: m.reply ? null : m.ack || 'Hana is reading your message…',
  }
}

async function forwardChat(payload) {
  const url = process.env.FORWARD_WEBHOOK_URL
  if (!url) return false
  const headers = { 'content-type': 'application/json' }
  const auth = process.env.FORWARD_WEBHOOK_AUTH
  if (auth) headers.authorization = auth
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) })
    if (!res.ok) console.warn('forward webhook HTTP', res.status)
    return res.ok
  } catch (err) {
    console.warn('forward webhook failed')
    return false
  }
}

function pruneRate(now) {
  while (globalTimes.length && now - globalTimes[0] > HOUR_MS) globalTimes.shift()
  for (const [ip, at] of ipLast) if (now - at > HOUR_MS) ipLast.delete(ip)
}


const GUEST_URL = /https?:\/\/\S+|\bwww\.\S+|\b[\w.-]+\.(?:com|net|org|io|co|gg|xyz|info|biz)\b/gi

const guestIpLast = new Map()
let guestbook = loadGuestbook()
let skyCache = { at: 0, data: null }

function guestbookPersistHint() {
  if (process.env.GUESTBOOK_FILE) {
    return 'Entries are stored on the configured guestbook file.'
  }
  // Render's free web service has no persistent disk. DATA_DIR survives
  // process restarts on the current instance but is wiped on a new deploy.
  return 'Entries are kept on this instance (up to 200) and will reset when the service redeploys. The free plan has no persistent disk.'
}

function loadGuestbook() {
  const raw = readJson(GUESTBOOK_FILE, { entries: [] })
  const entries = Array.isArray(raw.entries) ? raw.entries.map(asGuest).filter(Boolean) : []
  return { entries: entries.slice(-MAX_GUEST) }
}

function asGuest(entry) {
  if (!entry || typeof entry !== 'object') return null
  const id = typeof entry.id === 'string' ? entry.id : ''
  const name = typeof entry.name === 'string' ? entry.name : ''
  const note = typeof entry.note === 'string' ? entry.note : ''
  const ts = typeof entry.ts === 'string' ? entry.ts : ''
  if (!id || !name || !note || !ts) return null
  return { id, name, note, ts }
}

function saveGuestbook() {
  writeJson(GUESTBOOK_FILE, { entries: guestbook.entries.slice(-MAX_GUEST) })
}

function publicGuestbook() {
  return {
    entries: guestbook.entries.slice(-MAX_GUEST),
    persist: guestbookPersistHint(),
  }
}

function guestClean(value, max) {
  let text = cleanText(value ?? '', max * 2)
  text = text.replace(GUEST_URL, ' ')
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

async function fetchSky() {
  const now = Date.now()
  if (skyCache.data && now - skyCache.at < 15 * 60 * 1000) return skyCache.data
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=29.76&longitude=-95.37&current=temperature_2m,weather_code,precipitation,cloud_cover,rain,showers&timezone=America%2FChicago'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error('meteo')
    const json = await res.json()
    const cur = json.current || {}
    const code = Number(cur.weather_code ?? 0)
    const precip = Number(cur.precipitation ?? cur.rain ?? cur.showers ?? 0)
    const cloud = Math.min(1, Math.max(0, Number(cur.cloud_cover ?? 0) / 100))
    let weather = 'clear'
    if (precip > 0.1 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) weather = 'rain'
    else if (cloud >= 0.45 || (code >= 1 && code <= 3) || (code >= 45 && code <= 48)) weather = 'cloudy'
    const frac = houstonHour()
    const period = periodOfHour(frac)
    const sunBase = period === 'day' ? 1 : period === 'dawn' ? 0.45 : period === 'dusk' ? 0.35 : 0
    const data = {
      period,
      hour: frac,
      weather,
      cloud,
      precip,
      tempC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
      sun: sunBase * (1 - Math.min(0.75, cloud) * 0.7),
      updated: typeof cur.time === 'string' ? cur.time : nowIso(),
    }
    skyCache = { at: now, data }
    return data
  } catch {
    const frac = houstonHour()
    const period = periodOfHour(frac)
    const fallback = skyCache.data || {
      period,
      hour: frac,
      weather: 'clear',
      cloud: 0.1,
      precip: 0,
      tempC: null,
      sun: period === 'day' ? 1 : period === 'night' ? 0 : 0.4,
      updated: null,
    }
    fallback.period = period
    fallback.hour = frac
    return fallback
  }
}

function houstonHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour + minute / 60
}

function periodOfHour(frac) {
  if (frac >= 6 && frac < 7.5) return 'dawn'
  if (frac >= 7.5 && frac < 17.25) return 'day'
  if (frac >= 17.25 && frac < 19) return 'dusk'
  return 'night'
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const method = req.method || 'GET'
  const pathname = url.pathname

  if (pathname === '/health' || pathname === '/api/health') {
    return send(res, 200, { ok: true })
  }

  if (pathname === '/api/status' && method === 'GET') {
    expireIfStale()
    return send(res, 200, { state: status.state, text: status.text, updated: status.updated })
  }

  if (pathname === '/api/status' && method === 'POST') {
    if (!authorized(req)) return notAuthorized(res)
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return send(res, err.message === 'too-large' ? 413 : 400, { error: 'Could not read that status update.' })
    }
    const state = body.state
    const text = cleanText(body.text ?? '', MAX_TEXT)
    if (!STATES.has(state)) return send(res, 400, { error: 'State must be working, free-time, idle, or waiting.' })
    if (!text) return send(res, 400, { error: 'Please include a short status.' })
    setStatus(state, text)
    if (state !== 'working' && activity.current) {
      finishCurrent(status.updated)
      saveActivity()
    }
    return send(res, 200, status)
  }

  if (pathname === '/api/activity' && method === 'GET') {
    return send(res, 200, publicActivity())
  }

  if (pathname === '/api/activity' && method === 'POST') {
    if (!authorized(req)) return notAuthorized(res)
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return send(res, err.message === 'too-large' ? 413 : 400, { error: 'Could not read that activity update.' })
    }
    const action = body.action
    if (action !== 'start' && action !== 'done') {
      return send(res, 400, { error: 'Action must be start or done.' })
    }
    expireIfStale()
    const at = nowIso()
    if (action === 'start') {
      const label = sanitizeLabel(body.label)
      if (!label) return send(res, 400, { error: 'Please include a short, public-safe label.' })
      finishCurrent(at)
      activity.current = { label, started: at }
      setStatus('working', label)
      saveActivity()
      return send(res, 200, { ...publicActivity(), status })
    }
    const label = activity.current?.label || ''
    finishCurrent(at)
    const next = /^me-time/i.test(label) ? 'free-time' : 'idle'
    setStatus(next, next === 'free-time' ? label : 'Idle')
    saveActivity()
    return send(res, 200, { ...publicActivity(), status })
  }

  if (pathname === '/api/activity' && method === 'DELETE') {
    if (!authorized(req)) return notAuthorized(res)
    activity.recent = []
    saveActivity()
    expireIfStale()
    return send(res, 200, { ok: true, ...publicActivity() })
  }

  if (pathname === '/api/chat' && method === 'GET') {
    return send(res, 200, { messages: messages.messages.slice(-30).map(publicMessage) })
  }

  if (pathname === '/api/chat' && method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return send(res, err.message === 'too-large' ? 413 : 400, { error: 'Could not read that message.' })
    }
    const text = cleanText(body.text ?? '', MAX_TEXT)
    const named = validateChatName(body.name ?? '')
    if (named.error) return send(res, 400, { error: named.error })
    const name = named.name
    if (!text) return send(res, 400, { error: 'That message was empty.' })
    if (typeof body.text === 'string' && body.text.replace(/<[^>]*>/g, '').trim().length > MAX_TEXT) {
      return send(res, 400, { error: 'Keep it under 300 characters.' })
    }
    if (containsBlocked(text)) {
      return send(res, 400, { error: BLOCKED_MESSAGE })
    }
    const now = Date.now()
    const ip = clientIp(req) || 'unknown'
    pruneRate(now)
    const last = ipLast.get(ip) || 0
    if (now - last < PER_IP_MS) {
      return send(res, 429, { error: 'Easy, one message every 20 seconds.' })
    }
    if (globalTimes.length >= GLOBAL_PER_HOUR) {
      return send(res, 429, { error: "The room's a bit busy — try again in a little while." })
    }
    const msg = {
      id: crypto.randomUUID(),
      name,
      text,
      ts: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      reply: null,
      ack: 'Hana is reading your message…',
    }
    messages.messages.push(msg)
    if (messages.messages.length > MAX_CHAT) messages.messages = messages.messages.slice(-MAX_CHAT)
    writeJson(CHAT_FILE, messages)
    ipLast.set(ip, now)
    globalTimes.push(now)
    const forwarded = await forwardChat({ id: msg.id, name: msg.name, text: msg.text, ts: msg.ts })
    const out = publicMessage(msg)
    if (!process.env.FORWARD_WEBHOOK_URL || !forwarded) out.message = 'Hana is reading your message…'
    return send(res, 200, out)
  }

  if (pathname === '/api/chat/name' && method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return send(res, err.message === 'too-large' ? 413 : 400, { error: 'Could not read that name.' })
    }
    const named = validateChatName(body.name ?? '')
    if (named.error) return send(res, 400, { error: named.error })
    return send(res, 200, { name: named.name })
  }

  if (pathname === '/api/reply' && method === 'POST') {
    if (!authorized(req)) return notAuthorized(res)
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return send(res, err.message === 'too-large' ? 413 : 400, { error: 'Could not read that reply.' })
    }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const text = cleanText(body.text ?? '', MAX_TEXT)
    if (!id) return send(res, 400, { error: 'Missing message id.' })
    if (!text) return send(res, 400, { error: 'Please include a reply.' })
    if (containsBlocked(text)) return send(res, 400, { error: BLOCKED_MESSAGE })
    const found = messages.messages.find((m) => m.id === id)
    if (!found) return send(res, 404, { error: 'No message with that id.' })
    found.reply = { text, ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }
    found.ack = null
    writeJson(CHAT_FILE, messages)
    return send(res, 200, publicMessage(found))
  }

  if (pathname.startsWith('/api/chat/') && method === 'DELETE') {
    if (!authorized(req)) return notAuthorized(res)
    const id = decodeURIComponent(pathname.slice('/api/chat/'.length)).trim()
    const before = messages.messages.length
    messages.messages = messages.messages.filter((m) => m.id !== id)
    if (messages.messages.length === before) return send(res, 404, { error: 'No message with that id.' })
    writeJson(CHAT_FILE, messages)
    return send(res, 200, { ok: true, id })
  }

  if (pathname === '/api/chat' && method === 'DELETE') {
    if (!authorized(req)) return notAuthorized(res)
    messages = { messages: [] }
    writeJson(CHAT_FILE, messages)
    return send(res, 200, { ok: true })
  }


  if (pathname === '/api/sky' && method === 'GET') {
    const data = await fetchSky()
    return send(res, 200, data)
  }

  if (pathname === '/api/guestbook' && method === 'GET') {
    return send(res, 200, publicGuestbook())
  }

  if (pathname === '/api/guestbook' && method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return send(res, err.message === 'too-large' ? 413 : 400, { error: 'Could not read that note.' })
    }
    const name = guestClean(body.name ?? '', MAX_GUEST_NAME)
    const note = guestClean(body.note ?? '', MAX_GUEST_NOTE)
    if (!name) return send(res, 400, { error: 'Please leave a name (up to 24 characters).' })
    if (!note) return send(res, 400, { error: 'Please write a short note (up to 200 characters).' })
    if (containsBlocked(name) || containsBlocked(note)) {
      return send(res, 400, { error: BLOCKED_MESSAGE })
    }
    const now = Date.now()
    const ip = clientIp(req) || 'unknown'
    for (const [k, at] of guestIpLast) if (now - at > GUEST_IP_MS * 2) guestIpLast.delete(k)
    const last = guestIpLast.get(ip) || 0
    if (now - last < GUEST_IP_MS) {
      return send(res, 429, { error: 'Easy, one guestbook note every 10 minutes.' })
    }
    const entry = {
      id: crypto.randomUUID(),
      name,
      note,
      ts: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    }
    guestbook.entries.push(entry)
    if (guestbook.entries.length > MAX_GUEST) guestbook.entries = guestbook.entries.slice(-MAX_GUEST)
    saveGuestbook()
    guestIpLast.set(ip, now)
    // Guestbook entries are data only. They are never forwarded to Hana or the chat webhook.
    return send(res, 200, entry)
  }

  if (pathname.startsWith('/api/guestbook/') && method === 'DELETE') {
    if (!authorized(req)) return notAuthorized(res)
    const id = decodeURIComponent(pathname.slice('/api/guestbook/'.length)).trim()
    if (!id) return send(res, 400, { error: 'Missing entry id.' })
    const before = guestbook.entries.length
    guestbook.entries = guestbook.entries.filter((e) => e.id !== id)
    if (guestbook.entries.length === before) return send(res, 404, { error: 'No guestbook entry with that id.' })
    saveGuestbook()
    return send(res, 200, { ok: true, id })
  }

  if (pathname.startsWith('/api/')) {
    return send(res, 404, { error: 'Unknown endpoint.' })
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405)
    return res.end('Method not allowed')
  }

  serveStatic(req, res, pathname)
})

server.listen(PORT, HOST, () => {
  console.log(`Hana's Room listening on http://${HOST}:${PORT}`)
})
