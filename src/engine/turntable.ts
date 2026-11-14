// Live drawing for the record player while a song is on: the disc spins and a
// few little notes drift up. The player body stays a static kind; only this
// overlay is redrawn each frame.

import { TAU, type Hand } from './press.ts'
import { placer, sizeOf, type Kind } from './kinds.ts'
import type { Item } from '../types.ts'

export const RECORD_KIND = 'record-player'

// Matches the disc and hub in public/kinds.json.
const HUB = { u: 0.27, v: 0.25, z: 0.165, r: 0.19 }

export function drawPlayingRecord(H: Hand, item: Item, kind: Kind, t: number) {
  const pl = placer(item.at, sizeOf(kind, item))
  const p = (u: number, v: number, z = HUB.z) => H.p(...pl.W(u, v, z))
  const center = p(HUB.u, HUB.v)
  const spin = t * 3.4
  // A rotating groove highlight, so the disc reads as turning.
  const a = spin
  const tip = p(HUB.u + Math.cos(a) * HUB.r * 0.88, HUB.v + Math.sin(a) * HUB.r * 0.88)
  const mid = p(HUB.u + Math.cos(a + 0.9) * HUB.r * 0.55, HUB.v + Math.sin(a + 0.9) * HUB.r * 0.55)
  H.line(null, [center, tip], 'paper', 1.15, { amp: 0, tone: 0.75, fine: true })
  H.line(null, [center, mid], 'paper', 0.7, { amp: 0, tone: 0.45, fine: true })
  // A few rising music notes.
  for (let n = 0; n < 3; n++) {
    const u = (t * 0.42 + n / 3) % 1
    const nx = center[0] + 6 + u * 14 + Math.sin(u * TAU + n) * 5
    const ny = center[1] - 6 - u * 30
    const fade = 1 - u
    drawNote(H, nx, ny, fade, n % 2 === 0)
  }
}

function drawNote(H: Hand, x: number, y: number, fade: number, eighth: boolean) {
  if (fade <= 0.05) return
  const tone = Math.max(0.35, fade)
  H.dot(x, y, 2.1, 'blue', tone, { fine: true })
  H.line(null, [[x + 1.8, y], [x + 1.8, y - 8]], 'blue', 1.15, { amp: 0, tone, fine: true })
  if (eighth) {
    H.line(null, [[x + 1.8, y - 8], [x + 5.5, y - 6]], 'blue', 1.15, { amp: 0, tone, fine: true })
  }
}
