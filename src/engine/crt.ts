// Live drawing for the 80s CRT: a dim glass when Hana is off the clock, and a
// soft green terminal that scrolls while she is working. The beige box itself
// is a static kind; only the screen is redrawn each frame.

import { type Hand } from './press.ts'
import { placer, sizeOf, type Kind } from './kinds.ts'
import type { Item } from '../types.ts'

export const CRT_KIND = 'crt-pc'

// Must match the screen panel in public/kinds.json.
const PANEL = { u: 0.24, v: 0.605, z: 0.34, w: 0.7, h: 0.5, inset: 0.07 }

const COLS = 22
const ROWS = 11
const CELL_W = 6
const CELL_H = 8
const PAD = 3
const TERM_W = PAD * 2 + COLS * CELL_W
const TERM_H = PAD * 2 + ROWS * CELL_H

const LINES = [
  'C:\\HANA> DIR',
  '',
  'AUTOEXEC BAT',
  'COMMAND  COM',
  'CONFIG   SYS',
  'HANA     COM',
  'NOTES    TXT',
  'WORK     BAT',
  '',
  'C:\\HANA> TYPE NOTES',
  'working...',
  'ok.',
  '',
  'C:\\HANA> DIR /W',
  'HANA     SYS',
  'CLOUD    COM',
  'ROOM     TXT',
  '',
  'C:\\HANA>_',
]

let term: HTMLCanvasElement | null = null
let termCtx: CanvasRenderingContext2D | null = null

function terminal(t: number) {
  if (!term) {
    term = document.createElement('canvas')
    term.width = TERM_W
    term.height = TERM_H
    termCtx = term.getContext('2d')
  }
  const c = termCtx!
  c.fillStyle = '#07140a'
  c.fillRect(0, 0, TERM_W, TERM_H)
  c.font = '7px "Courier New", Courier, monospace'
  c.textBaseline = 'top'
  const lineH = CELL_H
  const scroll = t * 14
  const start = Math.floor(scroll / lineH)
  const frac = scroll % lineH
  for (let row = -1; row <= ROWS; row++) {
    const line = LINES[((start + row) % LINES.length + LINES.length) % LINES.length]
    const y = PAD + row * lineH - frac
    const blink = line.endsWith('_') && Math.floor(t * 2) % 2 === 0
    const text = blink ? line.slice(0, -1) + ' ' : line
    c.fillStyle = '#6fef6a'
    c.fillText(text, PAD, y)
  }
  // Scanlines, quietly, so it still reads as a small CRT.
  c.fillStyle = 'rgba(0, 0, 0, 0.22)'
  for (let y = 0; y < TERM_H; y += 2) c.fillRect(0, y, TERM_W, 1)
  // A soft inner vignette.
  const g = c.createRadialGradient(TERM_W / 2, TERM_H / 2, 8, TERM_W / 2, TERM_H / 2, TERM_W * 0.7)
  g.addColorStop(0, 'rgba(80, 255, 90, 0.07)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0.28)')
  c.fillStyle = g
  c.fillRect(0, 0, TERM_W, TERM_H)
  return term
}

export function crtScreenQuad(H: Hand, item: Item, kind: Kind, lift = 0.005) {
  const pl = placer(item.at, sizeOf(kind, item))
  const { u, v, z, w, h, inset } = PANEL
  const onPlane = (a: number, b: number, dv = 0) => H.p(...pl.W(a, v + dv, b))
  const a0 = u + inset
  const b0 = z + inset
  const a1 = u + w - inset
  const b1 = z + h - inset
  return [onPlane(a0, b0, lift), onPlane(a1, b0, lift), onPlane(a1, b1, lift), onPlane(a0, b1, lift)]
}

export function drawCrtScreen(H: Hand, item: Item, kind: Kind, t: number, on: boolean) {
  if (!on) return
  const pl = placer(item.at, sizeOf(kind, item))
  const { u, v, z, w, h, inset } = PANEL
  const onPlane = (a: number, b: number, dv = 0) => H.p(...pl.W(a, v + dv, b))
  const a0 = u + inset
  const b0 = z + inset
  const a1 = u + w - inset
  const b1 = z + h - inset
  const inner = [onPlane(a0, b0, 0.005), onPlane(a1, b0, 0.005), onPlane(a1, b1, 0.005), onPlane(a0, b1, 0.005)]
  const mid = onPlane((a0 + a1) / 2, (b0 + b1) / 2, 0.02)
  H.glow(mid[0], mid[1], 36, 28, 'teal', 0.42)

  const img = terminal(t)
  const cx = H.ctx()
  const tl = pl.nw ? onPlane(a1, b1, 0.008) : onPlane(a0, b1, 0.008)
  const ww = a1 - a0
  const hh = b1 - b0
  H.clip(inner, () => {
    cx.save()
    cx.imageSmoothingEnabled = false
    cx.transform((32 * ww) / img.width, ((pl.nw ? -16 : 16) * ww) / img.width, 0, (32 * hh) / img.height, tl[0], tl[1])
    cx.drawImage(img, 0, 0)
    cx.restore()
  })
}
