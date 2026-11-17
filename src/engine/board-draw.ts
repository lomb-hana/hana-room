// Live pins on the corkboard: a short hot-take slip, a couple of notes,
// and an optional photo, so the board is readable even before you click it.

import type { Hand, Vec } from './press.ts'
import { placer, sizeOf, type Kind } from './kinds.ts'
import type { Item } from '../types.ts'

export type BoardPin = {
  src: string
  alt?: string
  caption?: string
}

export type BoardData = {
  hotTake: string
  date: string
  notes: string[]
  pin?: BoardPin
}

const pins: Map<string, HTMLImageElement | 'bad'> = new Map()

export function safeBoardSrc(src: string): string | null {
  const s = String(src || '').trim()
  if (!/^\/(board|life\/files)\/[A-Za-z0-9._-]+$/.test(s)) return null
  return s
}

export function boardPinImage(src: string): HTMLImageElement | null {
  const safe = safeBoardSrc(src)
  if (!safe || typeof Image === 'undefined') return null
  const have = pins.get(safe)
  if (have === 'bad') return null
  if (have && have.complete && have.naturalWidth > 0) return have
  if (!have) {
    const im = new Image()
    im.decoding = 'async'
    im.onload = () => {
      pins.set(safe, im)
    }
    im.onerror = () => {
      pins.set(safe, 'bad')
    }
    im.src = safe
    pins.set(safe, im)
  }
  const cur = pins.get(safe)
  if (cur && cur !== 'bad' && cur.complete && cur.naturalWidth > 0) return cur
  return null
}

function drawImageOnQuad(H: Hand, img: CanvasImageSource, quad: Vec[]) {
  const tl = quad[3]!
  const tr = quad[2]!
  const bl = quad[0]!
  const src = img as HTMLImageElement | HTMLCanvasElement
  const w = Number((src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width || 0)
  const h = Number((src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height || 0)
  if (w <= 0 || h <= 0) return
  const cx = H.ctx()
  cx.save()
  cx.imageSmoothingEnabled = true
  cx.imageSmoothingQuality = 'high'
  cx.transform((tr[0] - tl[0]) / w, (tr[1] - tl[1]) / w, (bl[0] - tl[0]) / h, (bl[1] - tl[1]) / h, tl[0], tl[1])
  cx.drawImage(img, 0, 0, w, h)
  cx.restore()
}

export function drawBoardPins(H: Hand, item: Item, kind: Kind, board: BoardData) {
  const pl = placer(item.at, sizeOf(kind, item))
  const at = (u: number, z: number) => H.p(...pl.W(u, 0.045, z))
  const rect = (u: number, z: number, w: number, h: number) => [at(u, z), at(u + w, z), at(u + w, z + h), at(u, z + h)]

  const pin = board.pin
  const photo = pin?.src ? boardPinImage(pin.src) : null

  if (photo) {
    const paper = rect(0.14, 0.36, 0.78, 0.54)
    const inner = rect(0.19, 0.46, 0.68, 0.4)
    H.fill(paper, 'paper', 1)
    H.tint(paper, 'sun', 0.1)
    H.clip(inner, () => drawImageOnQuad(H, photo, inner))
    const pal: Array<['sun' | 'teal', number]> = [
      ['sun', 0.55],
      ['teal', 0.28],
    ]
    board.notes.slice(0, 2).forEach((_, n) => {
      H.fill(rect(0.96, 0.62 - n * 0.3, 0.6, 0.24), pal[n]![0], pal[n]![1])
    })
    H.fill(rect(0.14, 0.1, 1.42, 0.22), 'paper', 1)
    H.tint(rect(0.14, 0.1, 1.42, 0.22), 'sun', 0.12)
    for (const [u, z] of [
      [0.22, 0.86],
      [0.84, 0.86],
      [1.02, 0.82],
      [1.48, 0.82],
      [1.02, 0.52],
      [1.48, 0.52],
      [0.22, 0.3],
      [1.46, 0.3],
    ] as const) {
      const p = at(u, z)
      H.dot(p[0], p[1], 1.2, 'coral', 0.85, { knock: true })
    }
    return
  }

  H.fill(rect(0.16, 0.42, 1.38, 0.28), 'paper', 1)
  H.tint(rect(0.16, 0.42, 1.38, 0.28), 'sun', 0.12)
  H.fill(rect(0.2, 0.74, 0.42, 0.12), 'coral', 0.35)

  const pal: Array<['sun' | 'teal' | 'coral', number]> = [
    ['sun', 0.55],
    ['teal', 0.28],
  ]
  board.notes.slice(0, 2).forEach((_, n) => {
    H.fill(rect(0.18 + n * 0.78, 0.16, 0.7, 0.22), pal[n]![0], pal[n]![1])
  })
  if (board.notes.length < 2 && board.hotTake) {
    // still show a second slip so the board never looks empty
    H.fill(rect(0.96, 0.16, 0.7, 0.22), 'coral', 0.22)
  }

  for (const [u, z] of [
    [0.22, 0.68],
    [1.42, 0.68],
    [0.28, 0.36],
    [1.0, 0.36],
  ] as const) {
    const p = at(u, z)
    H.dot(p[0], p[1], 1.2, 'coral', 0.85, { knock: true })
  }
}
