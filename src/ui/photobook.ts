// Hana's photo album, opened by clicking the album on the dresser.
// Photos come from public/photobook/photos.json, newest first. Text is set with
// textContent only, and image paths must be plain filenames inside /photobook/.

export type Photo = { date: string; file: string; caption: string }

const SAFE_FILE = /^[a-z0-9][a-z0-9._-]{0,120}\.jpe?g$/i
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Array<Node | string | null | false | undefined>) {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) if (child) node.append(child)
  return node
}

export function photoSrc(file: string): string | null {
  const name = String(file || '').trim()
  if (!SAFE_FILE.test(name) || name.includes('..')) return null
  return `/photobook/${encodeURIComponent(name)}`
}

// Keep only well-formed entries, newest first (stable for same-day photos).
export function cleanPhotos(raw: unknown): Photo[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { photos?: unknown }).photos) ? ((raw as { photos: unknown[] }).photos) : []
  const out: Photo[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const { date, file, caption } = p as Record<string, unknown>
    const d = String(date ?? '').trim()
    const f = String(file ?? '').trim()
    if (!SAFE_DATE.test(d) || !photoSrc(f)) continue
    out.push({ date: d, file: f, caption: String(caption ?? '').trim().slice(0, 280) })
  }
  return out
    .map((p, n) => ({ p, n }))
    .sort((a, b) => (a.p.date === b.p.date ? a.n - b.n : a.p.date < b.p.date ? 1 : -1))
    .map(({ p }) => p)
}

function formatDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return value
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 18, 0, 0))
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(dt)
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export async function loadPhotos(): Promise<Photo[] | Error> {
  try {
    const response = await fetch('/photobook/photos.json', { credentials: 'same-origin', cache: 'no-cache', signal: AbortSignal.timeout(8000) })
    if (!response.ok) return new Error('No photos in the album yet. Check back soon.')
    return cleanPhotos(await response.json())
  } catch {
    return new Error('The album is closed for now. Check back soon.')
  }
}

export function createPhotobook({ host, load = loadPhotos, onFlip }: { host: HTMLElement; load?: () => Promise<Photo[] | Error>; onFlip?: () => void }) {
  const close = el('button', { class: 'term-close photo-close', type: 'button', title: 'Close', ariaLabel: 'Close photo album', textContent: '×' })
  const prev = el('button', { class: 'btn rec-btn photo-nav', type: 'button', ariaLabel: 'Newer photo', textContent: '‹ Newer' })
  const next = el('button', { class: 'btn rec-btn photo-nav', type: 'button', ariaLabel: 'Older photo', textContent: 'Older ›' })
  const count = el('span', { class: 'photo-count', ariaLive: 'polite' })
  const page = el('div', { class: 'photo-page' })
  const stage = el(
    'div',
    { class: 'photo-stage', hidden: true, role: 'dialog', ariaLabel: "Hana's Photo Album", ariaModal: 'true', tabIndex: -1 },
    el(
      'div',
      { class: 'photo-book' },
      el('header', { class: 'photo-bar' }, el('span', { class: 'term-title', textContent: "Hana's Photo Album" }), close),
      el('div', { class: 'photo-spread' }, page),
      el('footer', { class: 'photo-foot' }, prev, count, next),
    ),
  )
  host.append(stage)

  let open = false
  let photos: Photo[] = []
  let index = 0
  let loaded = false
  let loading = false
  let message = ''
  const preloaded = new Set<string>()

  function preload(n: number) {
    const p = photos[n]
    const src = p ? photoSrc(p.file) : null
    if (!src || preloaded.has(src)) return
    preloaded.add(src)
    const img = new Image()
    img.decoding = 'async'
    img.src = src
  }

  function paint(dir: 0 | 1 | -1 = 0) {
    page.replaceChildren()
    const p = photos[index]
    if (!p) {
      page.append(el('p', { class: 'board-empty photo-empty', textContent: loading ? 'Opening the album…' : message || 'No photos yet. Check back soon.' }))
      count.textContent = ''
      prev.disabled = true
      next.disabled = true
      return
    }
    const src = photoSrc(p.file)
    const frame = el('div', { class: 'photo-frame' })
    if (src) {
      const img = el('img', { alt: p.caption ? `Hana: ${p.caption}` : `Hana on ${formatDate(p.date)}`, decoding: 'async', loading: 'lazy' })
      img.addEventListener('error', () => {
        frame.replaceChildren(el('p', { class: 'photo-missing', textContent: 'This photo went missing.' }))
      })
      img.src = src
      frame.append(img)
    }
    page.append(
      el('figure', { class: 'photo-card' }, frame, el('figcaption', {}, el('time', { class: 'photo-date', dateTime: p.date, textContent: formatDate(p.date) }), el('p', { class: 'photo-caption', textContent: p.caption }))),
    )
    count.textContent = `${index + 1} / ${photos.length}`
    prev.disabled = index <= 0
    next.disabled = index >= photos.length - 1
    page.classList.remove('turn-next', 'turn-prev')
    if (dir && !reducedMotion()) {
      void page.offsetWidth
      page.classList.add(dir > 0 ? 'turn-next' : 'turn-prev')
    }
    preload(index + 1)
  }

  function go(step: 1 | -1) {
    const to = index + step
    if (to < 0 || to >= photos.length) return
    index = to
    onFlip?.()
    paint(step)
  }

  async function refresh() {
    if (loading) return
    loading = true
    if (!loaded) paint()
    const result = await load()
    loading = false
    if (result instanceof Error) {
      message = result.message
      if (!loaded) photos = []
    } else {
      message = ''
      const firstFile = photos[0]?.file
      photos = result
      loaded = true
      if (photos[0]?.file !== firstFile) index = 0
      index = Math.min(index, Math.max(0, photos.length - 1))
    }
    if (open) paint()
  }

  function setOpen(nextOpen: boolean) {
    open = nextOpen
    stage.hidden = !open
    if (open) {
      stage.classList.remove('is-opening')
      void stage.offsetWidth
      stage.classList.add('is-opening')
      paint()
      void refresh()
      stage.focus({ preventScroll: true })
    }
  }

  prev.addEventListener('click', () => go(-1))
  next.addEventListener('click', () => go(1))
  close.addEventListener('click', () => setOpen(false))

  document.addEventListener(
    'keydown',
    (e) => {
      if (!open) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setOpen(false)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      }
    },
    true,
  )

  // Swipe on phones: left for older, right for newer.
  let touch: { x: number; y: number } | null = null
  page.addEventListener('pointerdown', (e) => {
    touch = { x: e.clientX, y: e.clientY }
  })
  page.addEventListener('pointerup', (e) => {
    if (!touch) return
    const dx = e.clientX - touch.x
    const dy = e.clientY - touch.y
    touch = null
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1)
  })
  page.addEventListener('pointercancel', () => {
    touch = null
  })

  return {
    toggle() {
      setOpen(!open)
    },
    open() {
      setOpen(true)
    },
    close() {
      setOpen(false)
    },
    isOpen: () => open,
  }
}
