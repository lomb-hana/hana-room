// Corkboard window: Hana's hot take of the day, a pinned photo, and a few notes.
// Cream paper chrome, text nodes only.

import { safeBoardSrc, type BoardData } from '../engine/board-draw.ts'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Array<Node | string | null | false | undefined>) {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) if (child) node.append(child)
  return node
}

function formatDate(value: string) {
  const raw = String(value || '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!m) return raw
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 18, 0, 0))
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(dt)
}

export function createBoard({ host }: { host: HTMLElement }) {
  const close = el('button', { class: 'term-close', type: 'button', title: 'Close', ariaLabel: 'Close corkboard', textContent: '×' })
  const body = el('div', { class: 'board-body' })
  const win = el(
    'div',
    { class: 'board-win term-win', hidden: true, role: 'dialog', ariaLabel: "Hana's Corkboard" },
    el('header', { class: 'term-bar' }, el('span', { class: 'term-title', textContent: "Hana's Corkboard" }), close),
    body,
  )
  host.append(win)

  let open = false
  let data: BoardData = { hotTake: '', date: '', notes: [] }

  function paint() {
    body.replaceChildren()
    const src = data.pin?.src ? safeBoardSrc(data.pin.src) : null
    if (!data.hotTake && !data.notes.length && !src) {
      body.append(el('p', { class: 'board-empty', textContent: 'Nothing pinned yet.' }))
      return
    }
    if (data.hotTake) {
      const take = el('section', { class: 'board-take' })
      take.append(
        el('div', { class: 'board-kicker', textContent: data.date ? `Hot take of the day · ${formatDate(data.date)}` : 'Hot take of the day' }),
        el('p', { class: 'board-quote', textContent: data.hotTake || '…' }),
      )
      body.append(take)
    }
    if (src) {
      const photo = el('figure', { class: 'board-photo' })
      const img = el('img', {
        src,
        alt: data.pin?.alt || 'Pinned photo',
        decoding: 'async',
      })
      photo.append(img)
      if (data.pin?.caption) photo.append(el('figcaption', { textContent: data.pin.caption }))
      body.append(photo)
    }
    if (data.notes.length) {
      const list = el('ul', { class: 'board-notes' })
      for (const note of data.notes) {
        const item = el('li', { class: 'board-note' })
        item.append(el('span', { class: 'board-pin', textContent: '●' }), el('span', { textContent: note }))
        list.append(item)
      }
      body.append(el('div', { class: 'board-kicker', textContent: 'Pinned' }), list)
    }
  }

  function setOpen(next: boolean) {
    open = next
    win.hidden = !open
  }

  close.addEventListener('click', () => setOpen(false))

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
    update(next: BoardData | null) {
      const notes = next && Array.isArray(next.notes) ? next.notes.map((n) => String(n || '')).filter(Boolean) : []
      const src = next?.pin?.src ? safeBoardSrc(next.pin.src) : null
      const pin = src
        ? {
            src,
            alt: String(next?.pin?.alt || '').trim() || undefined,
            caption: String(next?.pin?.caption || '').trim() || undefined,
          }
        : undefined
      data = next
        ? { hotTake: String(next.hotTake || ''), date: String(next.date || ''), notes, pin }
        : { hotTake: '', date: '', notes: [] }
      paint()
    },
  }
}
