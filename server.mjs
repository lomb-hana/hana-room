// Tiny Node server for Hana's Room: static files from dist/ plus status and chat APIs.
// No Grok Bot / Cursor credentials are used or requested.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(ROOT, 'dist')
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data')
const STATUS_FILE = path.join(DATA, 'status.json')
const CHAT_FILE = path.join(DATA, 'chat.json')
const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const STATES = new Set(['working', 'free-time', 'idle', 'waiting'])
const MAX_TEXT = 300
const MAX_NAME = 40
const MAX_CHAT = 200
const PER_IP_MS = 20_000
const GLOBAL_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000

fs.mkdirSync(DATA, { recursive: true })

const defaultStatus = () => ({
  state: 'free-time',
  text: 'Testing my new room',
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
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600' })
  fs.createReadStream(file).pipe(res)
}

function publicMessage(m) {
  return {
    id: m.id,
    name: m.name,
    text: m.text,
    ts: m.ts,
    reply: m.reply ? { text: m.reply.text, ts: m.reply.ts } : null,
    ack: m.reply ? null : m.ack || 'Hana will read this later',
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const method = req.method || 'GET'
  const pathname = url.pathname

  if (pathname === '/health' || pathname === '/api/health') {
    return send(res, 200, { ok: true })
  }

  if (pathname === '/api/status' && method === 'GET') {
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
    status = { state, text, updated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }
    writeJson(STATUS_FILE, status)
    return send(res, 200, status)
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
    const name = cleanText(body.name ?? '', MAX_NAME) || null
    if (!text) return send(res, 400, { error: 'That message was empty.' })
    if (typeof body.text === 'string' && body.text.replace(/<[^>]*>/g, '').trim().length > MAX_TEXT) {
      return send(res, 400, { error: 'Keep it under 300 characters.' })
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
      ack: 'Hana will read this later',
    }
    messages.messages.push(msg)
    if (messages.messages.length > MAX_CHAT) messages.messages = messages.messages.slice(-MAX_CHAT)
    writeJson(CHAT_FILE, messages)
    ipLast.set(ip, now)
    globalTimes.push(now)
    const forwarded = await forwardChat({ id: msg.id, name: msg.name, text: msg.text, ts: msg.ts })
    const out = publicMessage(msg)
    if (!process.env.FORWARD_WEBHOOK_URL || !forwarded) out.message = 'Hana will read this later'
    return send(res, 200, out)
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
