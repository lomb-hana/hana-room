// Safe, small markdown for the FILES tab. Headings, bold, italics, lists,
// paragraphs, and links to allowed domains only. Everything else is plain
// escaped text. No raw HTML, ever.

const ALLOWED_HOSTS = new Set([
  'suno.com',
  'www.suno.com',
  'instagram.com',
  'www.instagram.com',
  'hana-room-web.onrender.com',
])

export function allowedHref(href: string): string | null {
  const raw = href.trim()
  if (!raw) return null
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) {
    if (raw.startsWith('/\\') || raw.includes('\\')) return null
    return raw
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (ALLOWED_HOSTS.has(host)) return url.href
    for (const allowed of ALLOWED_HOSTS) {
      if (host.endsWith('.' + allowed)) return url.href
    }
  } catch {
    return null
  }
  return null
}

function appendText(node: Node, text: string) {
  if (text) node.appendChild(document.createTextNode(text))
}

function appendInline(parent: Node, text: string) {
  let i = 0
  const n = text.length
  while (i < n) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      if (end > i + 2) {
        const strong = document.createElement('strong')
        appendInline(strong, text.slice(i + 2, end))
        parent.appendChild(strong)
        i = end + 2
        continue
      }
    }
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end > i + 1) {
        const em = document.createElement('em')
        appendInline(em, text.slice(i + 1, end))
        parent.appendChild(em)
        i = end + 1
        continue
      }
    }
    if (text[i] === '_' && (i === 0 || /\s/.test(text[i - 1] || ''))) {
      const end = text.indexOf('_', i + 1)
      if (end > i + 1 && (end === n - 1 || /[\s.,!?;:)]/.test(text[end + 1] || ''))) {
        const em = document.createElement('em')
        appendInline(em, text.slice(i + 1, end))
        parent.appendChild(em)
        i = end + 1
        continue
      }
    }
    if (text[i] === '[') {
      const mid = text.indexOf('](', i + 1)
      const end = mid >= 0 ? text.indexOf(')', mid + 2) : -1
      if (mid > i + 1 && end > mid + 2) {
        const label = text.slice(i + 1, mid)
        const href = allowedHref(text.slice(mid + 2, end))
        if (href) {
          const a = document.createElement('a')
          a.href = href
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          a.className = 'term-link'
          appendInline(a, label)
          parent.appendChild(a)
        } else {
          appendText(parent, text.slice(i, end + 1))
        }
        i = end + 1
        continue
      }
    }
    const next = text.slice(i + 1).search(/\*\*|[*_\[]/)
    const cut = next < 0 ? n : i + 1 + next
    appendText(parent, text.slice(i, cut))
    i = cut
  }
}

const UL = /^\s*[-*]\s+(.+)$/
const OL = /^\s*\d+\.\s+(.+)$/
const HEADING = /^(#{1,3})\s+(.+)$/

export function renderMarkdown(text: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'md'
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const raw = lines[i] ?? ''
    if (!raw.trim()) {
      i++
      continue
    }
    const head = raw.match(HEADING)
    if (head) {
      const tag = ('h' + Math.min(3, head[1].length)) as 'h1' | 'h2' | 'h3'
      const el = document.createElement(tag)
      appendInline(el, head[2].trim())
      root.appendChild(el)
      i++
      continue
    }
    const ul = raw.match(UL)
    const ol = raw.match(OL)
    if (ul || ol) {
      const list = document.createElement(ul ? 'ul' : 'ol')
      const rx = ul ? UL : OL
      while (i < lines.length) {
        const m = (lines[i] ?? '').match(rx)
        if (!m) break
        const li = document.createElement('li')
        appendInline(li, m[1])
        list.appendChild(li)
        i++
      }
      root.appendChild(list)
      continue
    }
    const para: string[] = [raw]
    i++
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (!next.trim() || HEADING.test(next) || UL.test(next) || OL.test(next)) break
      para.push(next)
      i++
    }
    const p = document.createElement('p')
    appendInline(p, para.join(' '))
    root.appendChild(p)
  }
  return root
}
