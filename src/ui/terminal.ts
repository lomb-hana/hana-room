// A retro terminal window over the room, opened by clicking the 80s PC.
// Cream paper chrome, a dark CRT panel, and green monospace text. Public
// activity only: the current task and a short recent list, polled from
// /api/activity.

import { ago } from './hud.ts'
import type { ActivityFeed } from '../api.ts'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Array<Node | string | null | false | undefined>) {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) if (child) node.append(child)
  return node
}

export function createTerminal({ host }: { host: HTMLElement }) {
  const close = el('button', { class: 'term-close', type: 'button', title: 'Close', ariaLabel: 'Close activity window', textContent: '×' })
  const crt = el('div', { class: 'term-crt' })
  crt.setAttribute('aria-live', 'polite')
  const win = el('div', { class: 'term-win', hidden: true, role: 'dialog', ariaLabel: "Hana's activity" },
    el('header', { class: 'term-bar' }, el('span', { class: 'term-title', textContent: 'C:\\HANA\\ACTIVITY.SYS' }), close),
    crt,
  )
  host.append(win)

  let feed: ActivityFeed = { current: null, recent: [] }
  let open = false

  function line(text: string, cls = '') {
    return el('div', { class: cls ? `term-line ${cls}` : 'term-line', textContent: text })
  }

  function render() {
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
  }
  function hide() {
    open = false
    win.hidden = true
  }

  render()
  return {
    update(next: ActivityFeed) {
      feed = { current: next.current, recent: Array.isArray(next.recent) ? next.recent : [] }
      render()
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
