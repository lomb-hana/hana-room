// Visitor guestbook window. Entries are plain text only; names and notes
// are always assigned via textContent, never innerHTML.
// The in-room book is closed; clicking it opens this spread with a short
// cover animation, then the existing sign + read UI.

export type GuestEntry = { id: string; name: string; note: string; ts: string }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Array<Node | string | null | false | undefined>) {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) if (child) node.append(child)
  return node
}

function when(ts: string) {
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t))
}

function motionMs() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560
  } catch {
    return 560
  }
}

export function createGuestbook({
  host,
  load,
  sign,
}: {
  host: HTMLElement
  load: () => Promise<{ entries: GuestEntry[]; persist?: string } | Error>
  sign: (input: { name: string; note: string }) => Promise<GuestEntry | Error>
}) {
  const close = el('button', { class: 'term-close guest-close', type: 'button', title: 'Close', ariaLabel: 'Close guestbook', textContent: '×' })
  const list = el('div', { class: 'guest-list' })
  const status = el('p', { class: 'guest-status' })
  const name = el('input', { class: 'guest-input', type: 'text', maxLength: 24, placeholder: 'Your name' }) as HTMLInputElement
  name.setAttribute('maxlength', '24')
  name.setAttribute('autocomplete', 'nickname')
  const note = el('textarea', { class: 'guest-note', maxLength: 200, rows: 3, placeholder: 'A short note for Hana' }) as HTMLTextAreaElement
  note.setAttribute('maxlength', '200')
  const submit = el('button', { class: 'rec-btn guest-submit', type: 'submit', textContent: 'Leave a note' })
  const form = el(
    'form',
    { class: 'guest-form' },
    el('label', { class: 'guest-label' }, el('span', { textContent: 'Name' }), name),
    el('label', { class: 'guest-label' }, el('span', { textContent: 'Note' }), note),
    submit,
  )
  const cover = el('div', { class: 'guest-cover', ariaHidden: 'true' }, el('span', { class: 'guest-cover-title', textContent: "Hana's Guestbook" }))
  const pages = el(
    'div',
    { class: 'guest-pages' },
    el('div', { class: 'guest-left' }, el('h2', { class: 'guest-page-title', textContent: 'Notes' }), list),
    el('div', { class: 'guest-spine', ariaHidden: 'true' }),
    el('div', { class: 'guest-right' }, el('h2', { class: 'guest-page-title', textContent: 'Sign' }), status, form),
  )
  const book = el('div', { class: 'guest-book' }, cover, pages)
  const stage = el(
    'div',
    { class: 'guest-stage', hidden: true, role: 'dialog', ariaLabel: "Hana's Guestbook", ariaModal: 'true' },
    close,
    book,
  )
  host.append(stage)

  let open = false
  let busy = false
  let timer = 0
  const NAME_KEY = 'hana-room-guest-name'

  try {
    const saved = localStorage.getItem(NAME_KEY)
    if (saved) name.value = saved.slice(0, 24)
  } catch {
    /* ignore */
  }

  function setStatus(text: string) {
    status.textContent = text
  }

  function paint(entries: GuestEntry[]) {
    list.replaceChildren()
    if (!entries.length) {
      list.append(el('p', { class: 'board-empty', textContent: 'No notes yet. Be the first to sign.' }))
      return
    }
    for (const entry of entries.slice().reverse()) {
      const row = el('article', { class: 'guest-entry' })
      const head = el('header', { class: 'guest-meta' })
      head.append(el('strong', { textContent: entry.name || 'Visitor' }), el('span', { class: 'guest-when', textContent: when(entry.ts) }))
      row.append(head, el('p', { class: 'guest-text', textContent: entry.note }))
      list.append(row)
    }
  }

  async function refresh() {
    const result = await load()
    if (result instanceof Error) {
      setStatus(result.message)
      return
    }
    paint(result.entries)
    setStatus('')
  }

  function setOpen(next: boolean) {
    if (timer) {
      window.clearTimeout(timer)
      timer = 0
    }
    if (next) {
      open = true
      stage.hidden = false
      stage.classList.remove('is-closing', 'is-open', 'is-opening')
      void stage.offsetWidth
      stage.classList.add('is-opening')
      timer = window.setTimeout(() => {
        if (!open) return
        stage.classList.add('is-open')
        stage.classList.remove('is-opening')
      }, motionMs())
      void refresh()
    } else {
      open = false
      stage.classList.remove('is-opening', 'is-open')
      stage.classList.add('is-closing')
      timer = window.setTimeout(() => {
        if (open) return
        stage.hidden = true
        stage.classList.remove('is-closing')
      }, motionMs())
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (busy) return
    const nm = name.value.trim()
    const text = note.value.trim()
    if (!nm) {
      setStatus('Please leave a name.')
      name.focus()
      return
    }
    if (!text) {
      setStatus('Please write a short note.')
      note.focus()
      return
    }
    busy = true
    submit.disabled = true
    setStatus('Saving…')
    const result = await sign({ name: nm, note: text })
    busy = false
    submit.disabled = false
    if (result instanceof Error) {
      setStatus(result.message)
      return
    }
    try {
      localStorage.setItem(NAME_KEY, nm.slice(0, 24))
    } catch {
      /* ignore */
    }
    note.value = ''
    setStatus('Saved. Thanks for signing.')
    void refresh()
  })

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
  }
}
