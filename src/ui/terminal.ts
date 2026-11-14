// A paper window over the room, opened by clicking the 80s PC and docked
// under the top-left "Hana's Room" card. Two tabs: NOW (the public activity
// feed) and FILES (daily logs and creations from public/life).

import { ago } from './hud.ts'
import { renderMarkdown } from './markdown.ts'
import type { ActivityFeed } from '../api.ts'

export type LifeEntry = { time?: string; title: string; body: string }
export type LifeCreation = { type: string; title: string; file?: string; url?: string }
export type LifeDay = { date: string; entries?: LifeEntry[]; creations?: LifeCreation[] }
export type LifeIndex = { days?: string[] }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Array<Node | string | null | false | undefined>) {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) if (child) node.append(child)
  return node
}

type Tab = 'now' | 'files'

function hrefOf(c: LifeCreation) {
  const src = (c.file || c.url || '').trim()
  return src
}

function isImage(c: LifeCreation, src: string) {
  if (c.type === 'image' || c.type === 'picture' || c.type === 'photo') return true
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(src)
}

function isAudio(c: LifeCreation, src: string) {
  if (c.type === 'song' || c.type === 'audio' || c.type === 'music') return true
  return /\.(mp3|wav|ogg|m4a)$/i.test(src)
}

export function createTerminal({ host }: { host: HTMLElement }) {
  const close = el('button', { class: 'term-close', type: 'button', title: 'Close', ariaLabel: 'Close computer window', textContent: '×' })
  const tabNow = el('button', { class: 'term-tab is-on', type: 'button', textContent: 'NOW' })
  const tabFiles = el('button', { class: 'term-tab', type: 'button', textContent: 'FILES' })
  tabNow.setAttribute('aria-pressed', 'true')
  tabFiles.setAttribute('aria-pressed', 'false')
  const daysEl = el('div', { class: 'term-days', hidden: true })
  const crt = el('div', { class: 'term-crt' })
  crt.setAttribute('aria-live', 'polite')
  const win = el(
    'div',
    { class: 'term-win', hidden: true, role: 'dialog', ariaLabel: "Hana's computer" },
    el('header', { class: 'term-bar' },
      el('div', { class: 'term-tabs' }, tabNow, tabFiles),
      el('span', { class: 'term-title', textContent: 'C:\\HANA' }),
      close,
    ),
    daysEl,
    crt,
  )
  host.append(win)

  let feed: ActivityFeed = { current: null, recent: [] }
  let open = false
  let tab: Tab = 'now'
  let days: string[] = []
  let selected: string | null = null
  const cache = new Map<string, LifeDay>()

  function line(text: string, cls = '') {
    return el('div', { class: cls ? `term-line ${cls}` : 'term-line', textContent: text })
  }

  function setTab(next: Tab) {
    tab = next
    tabNow.classList.toggle('is-on', tab === 'now')
    tabFiles.classList.toggle('is-on', tab === 'files')
    tabNow.setAttribute('aria-pressed', tab === 'now' ? 'true' : 'false')
    tabFiles.setAttribute('aria-pressed', tab === 'files' ? 'true' : 'false')
    daysEl.hidden = tab !== 'files'
    const title = win.querySelector('.term-title')
    if (title) title.textContent = tab === 'files' ? 'C:\\HANA\\FILES' : 'C:\\HANA'
    render()
    if (tab === 'files') void loadIndex()
  }

  function renderDays() {
    daysEl.replaceChildren()
    if (!days.length) {
      daysEl.append(el('div', { class: 'term-days-empty', textContent: 'No files yet.' }))
      return
    }
    for (const day of days) {
      const btn = el('button', { class: `term-day${day === selected ? ' is-on' : ''}`, type: 'button', textContent: day })
      btn.addEventListener('click', () => {
        selected = day
        renderDays()
        void loadDay(day)
      })
      daysEl.append(btn)
    }
  }

  function renderNow() {
    const now = Date.now()
    const body = el('div', { class: 'term-body' })
    body.append(el('div', { class: 'term-line term-head', textContent: 'NOW:' }))
    if (feed.current) {
      body.append(line('  ' + feed.current.label, 'term-now'))
    } else {
      const idle = el('div', { class: 'term-line term-idle' })
      idle.append('  idle...', el('span', { class: 'term-cursor', textContent: '_' }))
      body.append(idle)
    }
    body.append(el('div', { class: 'term-line term-blank', textContent: ' ' }))
    body.append(el('div', { class: 'term-line term-head', textContent: 'RECENT:' }))
    const recent = [...feed.recent].reverse()
    if (!recent.length) body.append(line('  (none)', 'term-dim'))
    else for (const item of recent) {
      const at = Date.parse(item.ended || item.started) || now
      const row = el('div', { class: 'term-line term-recent' })
      row.append(
        el('span', { class: 'term-item', textContent: item.label }),
        el('span', { class: 'term-ago', textContent: ago(at, now) }),
      )
      body.append(row)
    }
    crt.replaceChildren(body)
  }

  function renderDay(day: LifeDay) {
    const body = el('div', { class: 'term-body' })
    body.append(el('div', { class: 'term-line term-head', textContent: (day.date || selected || '') + ':' }))
    const entries = Array.isArray(day.entries) ? day.entries : []
    if (!entries.length) body.append(line('  (no log today)', 'term-dim'))
    else for (const entry of entries) {
      const parts = [entry.time, entry.title].filter((s): s is string => Boolean(s))
      if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) parts.pop()
      const label = parts.join('  ')
      if (label) body.append(line(label, 'term-entry-title'))
      if (entry.body) body.append(renderMarkdown(entry.body))
      body.append(el('div', { class: 'term-line term-blank', textContent: ' ' }))
    }
    const creations = Array.isArray(day.creations) ? day.creations : []
    body.append(el('div', { class: 'term-line term-head', textContent: 'CREATIONS:' }))
    if (!creations.length) body.append(line('  (none)', 'term-dim'))
    else for (const c of creations) body.append(renderCreation(c))
    crt.replaceChildren(body)
  }

  function renderCreation(c: LifeCreation) {
    const wrap = el('div', { class: 'term-creation' })
    const src = hrefOf(c)
    wrap.append(el('div', { class: 'term-line term-entry-title', textContent: c.title || c.type || 'creation' }))
    if (src && isImage(c, src)) {
      const img = el('img', { class: 'term-pic', alt: c.title || 'picture' }) as HTMLImageElement
      img.src = src
      wrap.append(img)
    } else if (src && isAudio(c, src)) {
      const audio = el('audio', { class: 'term-audio', preload: 'none' }) as HTMLAudioElement
      audio.controls = true
      audio.setAttribute('playsinline', '')
      audio.src = src
      wrap.append(audio)
    } else if (src && /\.(md|txt)$/i.test(src)) {
      const pre = el('div', { class: 'term-file term-dim', textContent: 'loading...' })
      wrap.append(pre)
      void fetch(src, { cache: 'no-store' })
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((text) => {
          pre.replaceWith(renderMarkdown(text.trim()))
        })
        .catch(() => {
          pre.textContent = src
        })
    } else if (src) {
      const a = el('a', { class: 'term-link', href: src, target: '_blank', rel: 'noopener noreferrer', textContent: src }) as HTMLAnchorElement
      wrap.append(a)
    }
    return wrap
  }

  function render() {
    if (tab === 'now') renderNow()
    else if (selected && cache.has(selected)) renderDay(cache.get(selected)!)
    else if (tab === 'files' && !days.length) {
      crt.replaceChildren(el('div', { class: 'term-body' }, line('No files yet.', 'term-dim')))
    }
  }

  async function loadIndex() {
    const res = await fetch('/life/index.json', { cache: 'no-store' }).catch(() => null)
    const data = res?.ok ? ((await res.json().catch(() => null)) as LifeIndex | null) : null
    const list = Array.isArray(data?.days) ? data!.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
    list.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    days = list
    if (!selected || !days.includes(selected)) selected = days[0] || null
    renderDays()
    if (selected) await loadDay(selected, true)
    else render()
  }

  async function loadDay(day: string, fresh = false) {
    if (fresh || !cache.has(day)) {
      const res = await fetch(`/life/${day}.json`, { cache: 'no-store' }).catch(() => null)
      const data = res?.ok ? ((await res.json().catch(() => null)) as LifeDay | null) : null
      cache.set(day, data && typeof data === 'object' ? { date: data.date || day, entries: data.entries || [], creations: data.creations || [] } : { date: day, entries: [], creations: [] })
    }
    if (tab === 'files' && selected === day) renderDay(cache.get(day)!)
  }

  tabNow.addEventListener('click', () => setTab('now'))
  tabFiles.addEventListener('click', () => setTab('files'))
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    hide()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) hide()
  })

  function show() {
    open = true
    win.hidden = false
    render()
    if (tab === 'files') void loadIndex()
  }
  function hide() {
    open = false
    win.hidden = true
  }

  render()
  return {
    update(next: ActivityFeed) {
      feed = { current: next.current, recent: Array.isArray(next.recent) ? next.recent : [] }
      if (tab === 'now') renderNow()
    },
    toggle() {
      if (open) hide()
      else show()
      return open
    },
    open: show,
    close: hide,
    isOpen: () => open,
  }
}
