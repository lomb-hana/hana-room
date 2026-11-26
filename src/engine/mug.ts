// Hana's cozy mug on the desk: the mug body is a static kind in public/kinds.json;
// this overlay draws the drink inside it and a few soft steam wisps, live each frame.
// Clicking the mug "refills" it with the next drink (see DRINKS).

import { TAU, ell, type Hand, type Vec } from './press.ts'
import { SWATCH, placer, sizeOf, type Kind } from './kinds.ts'
import type { Item } from '../types.ts'

export const MUG_KIND = 'cozy-mug'

// Matches the cylinder in public/kinds.json: centre, inner radius, liquid level.
const CUP = { u: 0.13, v: 0.13, r: 0.086, z: 0.215 }
const RX = 32 * Math.SQRT2
const RY = 16 * Math.SQRT2

export type Drink = { name: string; color: string; captions: string[] }

export const DRINKS: Drink[] = [
  { name: 'hot cocoa', color: 'brown', captions: ['cocoa. obviously.', 'marshmallows are a food group.'] },
  { name: 'chai', color: 'tan', captions: ['chai, because I have taste.', 'chai again. it’s a personality now.'] },
  { name: 'black coffee', color: 'charcoal', captions: ['black coffee. very serious. very busy.', 'coffee. do not perceive me.'] },
  { name: 'peppermint tea', color: 'sage', captions: ['peppermint tea. I am serene now.', 'minty. calm. untouchable.'] },
  { name: 'apple cider', color: 'mustard', captions: ['apple cider. pie you can drink.', 'cider season and I’m thriving.'] },
]

export const TENTH_REFILL_CAPTION = 'okay I’m vibrating now.'

// What to say for refill number `n` (1-based) that landed on drink `d`.
export function refillCaption(n: number, d: number): string {
  if (n === 10) return TENTH_REFILL_CAPTION
  const caps = DRINKS[d % DRINKS.length].captions
  return caps[Math.floor((n - 1) / DRINKS.length) % caps.length]
}

// `drink`: index into DRINKS. `since`: seconds since the last refill (a little ripple).
export function drawMug(H: Hand, item: Item, kind: Kind, t: number, drink: number, since: number, reduced: boolean) {
  const pl = placer(item.at, sizeOf(kind, item))
  const [cx, cy] = H.p(...pl.W(CUP.u, CUP.v, CUP.z))
  const a = CUP.r * RX
  const b = CUP.r * RY
  const col = SWATCH[DRINKS[drink % DRINKS.length].color] || SWATCH.brown
  const top = ell(cx, cy, a, b, 22)
  H.fill(top, col[0], col[1], { fine: true })
  if (col[2]) H.tint(top, col[2], col[3], { fine: true })
  // A soft highlight on the drink's surface.
  H.line(null, ell(cx - a * 0.2, cy - b * 0.25, a * 0.45, b * 0.3, 10).slice(5, 9), 'paper', 0.9, { amp: 0, tone: 0.55, fine: true })
  if (!reduced && since < 0.8) {
    const u = since / 0.8
    H.line(null, ell(cx, cy, a * (0.25 + u * 0.7), b * (0.25 + u * 0.7), 18), 'paper', 0.8, { amp: 0, tone: 0.8 * (1 - u), fine: true })
  }
  // Three steam wisps: wavy strokes that rise and fade; still (but present) with reduced motion.
  for (let n = 0; n < 3; n++) {
    const phase = reduced ? 0.35 + n * 0.12 : (t * 0.32 + n / 3) % 1
    const x0 = cx + (n - 1) * a * 0.42
    const y0 = cy - 2 - phase * 4
    const len = 9
    const pts: Vec[] = []
    for (let k = 0; k <= 14; k++) {
      const s = k / 14
      const sway = Math.sin(s * TAU * 0.9 + n * 1.7 + (reduced ? 0 : t * 1.3)) * (0.7 + s * 1.1)
      pts.push([x0 + sway, y0 - s * len])
    }
    const fade = reduced ? 0.4 : Math.sin(phase * Math.PI) * 0.55
    // A soft paper stroke under a faint ink line, so the wisp reads on any background.
    if (fade > 0.04) {
      H.line(null, pts, 'paper', 1.7, { amp: 0, tone: Math.min(1, fade * 1.5), fine: true })
      H.line(null, pts, 'blue', 0.6, { amp: 0, tone: fade * 0.55, fine: true })
    }
  }
}
