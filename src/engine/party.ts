// Dance-party overlays while a record is playing. The original disco show is
// unchanged; a new show is picked at random each time a song starts.
// A hidden `?show=` (or `?party=`) query can force one for testing; it is not
// shown in the UI.
// Drawn in room iso space after the furniture (window treatments are drawn
// earlier, over the pane).

import { TAU, type Hand } from './press.ts'
import { WALL_H } from './world.ts'
import { crtScreenQuad } from './crt.ts'
import type { Kind } from './kinds.ts'
import type { Item } from '../types.ts'

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const PARTY_SHOWS = ['disco', 'neon', 'starry', 'rave', 'blossom'] as const
export type PartyShow = (typeof PARTY_SHOWS)[number]

const SHOW_ALIAS: Record<string, PartyShow> = {
  disco: 'disco',
  neon: 'neon',
  'neon-arcade': 'neon',
  arcade: 'neon',
  starry: 'starry',
  'starry-night': 'starry',
  night: 'starry',
  rave: 'rave',
  blossom: 'blossom',
  cherry: 'blossom',
  'cherry-blossom': 'blossom',
  petals: 'blossom',
}

export function partyShowFromQuery(search = typeof location !== 'undefined' ? location.search : ''): PartyShow | null {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const raw = (q.get('show') || q.get('party') || '').toLowerCase().trim()
  return SHOW_ALIAS[raw] ?? null
}

export function pickPartyShow(rand = Math.random): PartyShow {
  return PARTY_SHOWS[Math.floor(rand() * PARTY_SHOWS.length)]!
}

export function partyChangesWindow(show: PartyShow | null) {
  return show === 'starry' || show === 'blossom'
}

export function partyFlashesCrt(show: PartyShow | null) {
  return show === 'neon'
}

const HOOK_Z = WALL_H + 1.38
const BALL_Z = 2.18
const BALL_RX = 17.5
const BALL_RY = 15

type Pt = [number, number]

function roomPolys(H: Hand) {
  const floor: Pt[] = [H.p(0, 0, 0), H.p(9, 0, 0), H.p(9, 9, 0), H.p(0, 9, 0)]
  const nw: Pt[] = [H.p(0, 0, 0), H.p(0, 9, 0), H.p(0, 9, WALL_H), H.p(0, 0, WALL_H)]
  const ne: Pt[] = [H.p(0, 0, 0), H.p(9, 0, 0), H.p(9, 0, WALL_H), H.p(0, 0, WALL_H)]
  return { floor, nw, ne, walls: [nw, ne] as Pt[][] }
}

function path(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  pts.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string) {
  path(ctx, pts)
  ctx.fillStyle = fill
  ctx.fill()
}

function clipMany(ctx: CanvasRenderingContext2D, list: Pt[][], fn: () => void) {
  ctx.save()
  ctx.beginPath()
  for (const pts of list) {
    pts.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
    ctx.closePath()
  }
  ctx.clip()
  fn()
  ctx.restore()
}

export function drawParty(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean, show: PartyShow = 'disco') {
  if (alpha <= 0.01) return
  if (show === 'neon') return drawNeon(H, t, alpha, rug, reduced)
  if (show === 'starry') return drawStarry(H, t, alpha, rug, reduced)
  if (show === 'rave') return drawRave(H, t, alpha, rug, reduced)
  if (show === 'blossom') return drawBlossom(H, t, alpha, rug, reduced)
  drawDisco(H, t, alpha, rug, reduced)
}

export function drawPartyWindow(H: Hand, pane: Pt[], t: number, alpha: number, show: PartyShow, reduced: boolean) {
  if (alpha <= 0.01) return
  if (show === 'starry') drawStarryWindow(H, pane, t, alpha, reduced)
  else if (show === 'blossom') drawBlossomWindow(H, pane, t, alpha)
}

export function drawPartyCrt(H: Hand, item: Item, kind: Kind, t: number, alpha: number, reduced: boolean) {
  if (alpha <= 0.01) return
  const quad = crtScreenQuad(H, item, kind)
  const ctx = H.ctx()
  const beat = reduced ? 0.7 : 0.55 + 0.45 * Math.max(0, Math.sin(t * 4.6))
  const pink = Math.sin(t * 2.4) > 0
  const rgb = pink ? '255,70,180' : '40,230,255'
  ctx.save()
  ctx.globalAlpha = alpha
  path(ctx, quad)
  ctx.fillStyle = `rgba(${rgb},${0.55 + beat * 0.4})`
  ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = `rgba(255,255,255,${0.2 * beat})`
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Disco (original show, kept as-is)
// ---------------------------------------------------------------------------

function drawDisco(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  const ctx = H.ctx()
  const floor = [H.p(0, 0, 0), H.p(9, 0, 0), H.p(9, 9, 0), H.p(0, 9, 0)]
  // Hang over the back-left of the rug so the chain rises through the
  // open wall between the bookshelf and the desk, not in front of the CRT.
  const hi = rug.i - 1.10
  const hj = rug.j - 0.05
  const mid = H.p(rug.i, rug.j, 0)
  const hook = H.p(hi, hj, HOOK_Z)
  const ball = H.p(hi, hj, BALL_Z)
  const colors = ['255,70,150', '40,220,255', '255,210,70', '190,130,255']
  const spots: Array<[number, number, string, number]> = []
  const nSpots = 7
  for (let k = 0; k < nSpots; k++) {
    const ang = reduced ? k * (TAU / nSpots) + 0.35 : t * (0.38 + (k % 3) * 0.07) + k * 0.9
    const reach = 1.15 + (k % 3) * 0.85
    const land = H.p(rug.i + Math.cos(ang) * reach, rug.j + Math.sin(ang) * reach, 0)
    spots.push([land[0], land[1], colors[k % colors.length], reach])
  }

  // Dim the floor and paint the moving spots, clipped to the room.
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  floor.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
  ctx.fillStyle = 'rgba(16, 6, 28, 0.28)'
  ctx.fill()
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter'
  for (const [x, y, rgb] of spots) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, 70)
    g.addColorStop(0, `rgba(${rgb},${reduced ? 0.32 : 0.46})`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, 66, 32, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()

  // Rays and the hanging ball sit above the floor clip so they can reach the ceiling.
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'lighter'
  for (const [x, y, rgb] of spots) {
    const beam = ctx.createLinearGradient(ball[0], ball[1], x, y)
    beam.addColorStop(0, `rgba(${rgb},${reduced ? 0.16 : 0.3})`)
    beam.addColorStop(0.65, `rgba(${rgb},0.06)`)
    beam.addColorStop(1, `rgba(${rgb},0)`)
    ctx.strokeStyle = beam
    ctx.lineWidth = reduced ? 3.5 : 6
    ctx.beginPath()
    ctx.moveTo(ball[0], ball[1])
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
  drawChain(ctx, hook, ball, BALL_RY)
  drawDiscoBall(ctx, ball[0], ball[1], BALL_RX, BALL_RY, t, reduced)

  const count = reduced ? 7 : 16
  for (let n = 0; n < count; n++) {
    const u = reduced ? (n / count) * 0.7 + 0.15 : (t * 0.28 + n * 0.19) % 1
    const ang = n * 2.399 + (reduced ? 0.4 : t * 0.28)
    // Keep sparkles around the room and up near the ball, not piled on Hana.
    const r = 28 + (n % 5) * 16
    const x = mid[0] + Math.cos(ang) * r
    const y = mid[1] - 36 - u * 52 + Math.sin(ang) * r * 0.4
    const tw = reduced ? 0.4 : 0.3 + 0.7 * Math.abs(Math.sin(t * 6.5 + n * 1.7))
    if (tw < 0.08) continue
    drawSpark(ctx, x, y, 2.1 * tw, n % 2 ? '#fff6c4' : '#ffd6ff', tw)
  }
  ctx.restore()
}

function drawChain(ctx: CanvasRenderingContext2D, hook: [number, number], ball: [number, number], ballRy: number) {
  const top: [number, number] = [hook[0], hook[1]]
  const bot: [number, number] = [ball[0], ball[1] - ballRy + 1]
  const len = Math.hypot(bot[0] - top[0], bot[1] - top[1])
  // Small ceiling plate so the chain reads as hanging from above.
  ctx.fillStyle = 'rgba(90, 86, 82, 0.35)'
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.8)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.ellipse(top[0], top[1] - 1.2, 5.2, 2.15, 0, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.7)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(top[0], top[1])
  ctx.lineTo(bot[0], bot[1])
  ctx.stroke()
  ctx.strokeStyle = 'rgba(180, 186, 196, 0.8)'
  ctx.lineWidth = 0.55
  ctx.beginPath()
  ctx.moveTo(top[0] + 0.8, top[1])
  ctx.lineTo(bot[0] + 0.8, bot[1])
  ctx.stroke()
  const links = Math.max(4, Math.round(len / 5.2))
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.75)'
  ctx.lineWidth = 0.85
  for (let i = 0; i < links; i++) {
    const u = (i + 0.5) / links
    const x = top[0] + (bot[0] - top[0]) * u
    const y = top[1] + (bot[1] - top[1]) * u
    ctx.beginPath()
    ctx.ellipse(x, y, 1.35, 2.15, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.ellipse(top[0], top[1] + 1.1, 2.2, 2.2, 0, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(top[0], top[1] + 1.1, 1.05, 1.05, 0, 0, TAU)
  ctx.stroke()
}

function drawDiscoBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, t: number, reduced: boolean) {
  const spin = reduced ? 0.35 : t * 0.48
  const shade = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.42, 2, cx, cy + ry * 0.1, rx * 1.05)
  shade.addColorStop(0, '#f4f6fa')
  shade.addColorStop(0.4, '#c5ccd6')
  shade.addColorStop(1, '#5c6470')
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU)
  ctx.fillStyle = shade
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU)
  ctx.clip()
  const cols = 12
  const rows = 7
  for (let row = 0; row < rows; row++) {
    const v0 = (row / rows) * Math.PI
    const v1 = ((row + 1) / rows) * Math.PI
    const odd = row % 2 ? 0.5 : 0
    for (let col = 0; col < cols; col++) {
      const u0 = ((col + odd) / cols) * TAU + spin
      const u1 = ((col + 1 + odd) / cols) * TAU + spin
      const um = (u0 + u1) / 2
      const vm = (v0 + v1) / 2
      // Front of the sphere (toward the camera).
      if (Math.sin(vm) * Math.sin(um) < -0.05) continue
      const pts = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ].map(([u, v]) => [cx + Math.sin(v) * Math.cos(u) * rx, cy - Math.cos(v) * ry] as [number, number])
      // Light comes from up-left, same as the room.
      const lit = 0.28 + 0.72 * Math.max(0, Math.sin(vm) * Math.cos(um - 0.7) * 0.55 + Math.cos(vm) * 0.5)
      const twinkle = reduced ? 0 : Math.max(0, Math.sin(t * 5.4 + col * 1.8 + row * 0.9))
      const flash = twinkle * twinkle
      const c = 90 + lit * 130 + flash * 70
      const cool = flash > 0.75 ? 20 : 0
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      ctx.lineTo(pts[1][0], pts[1][1])
      ctx.lineTo(pts[2][0], pts[2][1])
      ctx.lineTo(pts[3][0], pts[3][1])
      ctx.closePath()
      ctx.fillStyle = `rgb(${Math.min(255, c + cool)}, ${Math.min(255, c + cool * 0.6)}, ${Math.min(255, c - 8 + flash * 40)})`
      ctx.fill()
      ctx.strokeStyle = 'rgba(43, 38, 34, 0.28)'
      ctx.lineWidth = 0.55
      ctx.stroke()
      if (flash > 0.82) {
        const [gx, gy] = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0] as [number, number])
        drawSpark(ctx, gx, gy, 2.8, '#fffef6', 0.9)
      }
    }
  }
  ctx.restore()

  // Ink outline and a small cap where the chain meets the ball.
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.9)'
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU)
  ctx.stroke()
  ctx.fillStyle = 'rgba(90, 96, 104, 0.95)'
  ctx.beginPath()
  ctx.ellipse(cx, cy - ry + 1.2, 3.2, 2.1, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.85)'
  ctx.lineWidth = 0.8
  ctx.stroke()
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.28, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.28, y)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - r, y)
  ctx.lineTo(x, y + r * 0.28)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y - r * 0.28)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Neon arcade
// ---------------------------------------------------------------------------

function drawNeon(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  const ctx = H.ctx()
  const { floor, walls } = roomPolys(H)
  ctx.save()
  ctx.globalAlpha = alpha
  fillPoly(ctx, floor, 'rgba(18, 4, 28, 0.22)')
  for (const w of walls) fillPoly(ctx, w, 'rgba(12, 2, 24, 0.16)')

  const sweep = reduced ? 0 : (t * 26) % 14
  clipMany(ctx, walls, () => {
    let y = -80 + sweep
    let n = 0
    while (y < 420) {
      ctx.fillStyle = n % 2 ? 'rgba(255, 50, 190, 0.32)' : 'rgba(30, 230, 255, 0.3)'
      ctx.fillRect(-80, y, 900, 2.8)
      y += 8
      n++
    }
  })

  const pixels = reduced ? 12 : 28
  ctx.globalCompositeOperation = 'lighter'
  for (let n = 0; n < pixels; n++) {
    const side = n % 2
    const u = ((n * 1.73) % 1) * 8.4 + 0.3
    const z = 0.55 + ((n * 0.37) % 1) * 1.85
    const p = side ? H.p(u, 0.08, z) : H.p(0.08, u, z)
    const blink = reduced ? 0.7 : 0.35 + 0.65 * Math.max(0, Math.sin(t * (2.2 + (n % 4) * 0.4) + n * 1.9))
    if (blink < 0.28) continue
    const rgb = n % 3 === 0 ? '255,80,200' : n % 3 === 1 ? '40,240,255' : '255,255,210'
    ctx.fillStyle = `rgba(${rgb},${0.75 * blink})`
    const s = 3.2 + (n % 3) * 0.8
    ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s)
  }
  // A couple of soft floor glows so the room still feels lit for the dance.
  const mid = H.p(rug.i, rug.j, 0)
  for (let k = 0; k < 3; k++) {
    const ang = t * 0.5 + k * 2.1
    const land = H.p(rug.i + Math.cos(ang) * 1.4, rug.j + Math.sin(ang) * 1.4, 0)
    const rgb = k % 2 ? '255,60,190' : '40,220,255'
    const g = ctx.createRadialGradient(land[0], land[1], 2, land[0], land[1], 54)
    g.addColorStop(0, `rgba(${rgb},${reduced ? 0.2 : 0.3})`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(land[0], land[1], 50, 24, 0, 0, TAU)
    ctx.fill()
  }
  void mid
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Starry night
// ---------------------------------------------------------------------------

function drawStarry(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  const ctx = H.ctx()
  const { floor, walls } = roomPolys(H)
  ctx.save()
  ctx.globalAlpha = alpha
  fillPoly(ctx, floor, 'rgba(10, 12, 36, 0.46)')
  for (const w of walls) fillPoly(ctx, w, 'rgba(8, 10, 32, 0.42)')

  // Slow aurora on the back walls.
  clipMany(ctx, walls, () => {
    ctx.globalCompositeOperation = 'lighter'
    const bands = [
      { rgb: '70,200,190', y: 0.12, w: 70 },
      { rgb: '150,90,210', y: 0.38, w: 80 },
      { rgb: '255,140,190', y: 0.62, w: 64 },
    ]
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]
      const wave = reduced ? 0 : Math.sin(t * 0.35 + i * 1.1) * 16
      const left = H.p(0, 0, WALL_H * (1 - b.y))
      const right = H.p(9, 0, WALL_H * (1 - b.y))
      const y = (left[1] + right[1]) / 2 + wave
      const g = ctx.createLinearGradient(-40, y, 520, y + 10)
      g.addColorStop(0, `rgba(${b.rgb},0)`)
      g.addColorStop(0.3, `rgba(${b.rgb},0.22)`)
      g.addColorStop(0.55, `rgba(${b.rgb},0.12)`)
      g.addColorStop(1, `rgba(${b.rgb},0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(240, y, 280, b.w / 2, -0.18, 0, TAU)
      ctx.fill()
    }
  })

  const stars = reduced ? 14 : 36
  ctx.globalCompositeOperation = 'lighter'
  for (let n = 0; n < stars; n++) {
    const side = n % 3
    const u = 0.25 + ((n * 2.127) % 1) * 8.5
    const z = 1.15 + ((n * 0.61) % 1) * 1.4
    const p = side === 0 ? H.p(u, 0.12, z) : side === 1 ? H.p(0.12, u, z) : H.p(1.2 + ((n * 0.41) % 1) * 6.4, 1.2 + ((n * 0.73) % 1) * 6.4, WALL_H + 0.15)
    const tw = reduced ? 0.55 : 0.25 + 0.75 * Math.abs(Math.sin(t * (0.8 + (n % 5) * 0.15) + n))
    if (tw < 0.18) continue
    const r = 1.1 + (n % 4) * 0.35
    drawSpark(ctx, p[0], p[1], r * tw, n % 4 === 0 ? '#ffd6ff' : '#fff8dc', 0.55 * tw)
  }
  // Soft pool of light on the rug so Hana stays readable.
  const mid = H.p(rug.i, rug.j, 0)
  const g = ctx.createRadialGradient(mid[0], mid[1], 4, mid[0], mid[1], 70)
  g.addColorStop(0, 'rgba(170, 140, 220, 0.16)')
  g.addColorStop(1, 'rgba(170, 140, 220, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(mid[0], mid[1], 66, 32, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function drawStarryWindow(H: Hand, pane: Pt[], t: number, alpha: number, reduced: boolean) {
  const ctx = H.ctx()
  const c = pane.reduce((a, p) => [a[0] + p[0] / pane.length, a[1] + p[1] / pane.length] as Pt, [0, 0])
  ctx.save()
  ctx.globalAlpha = alpha
  path(ctx, pane)
  ctx.clip()
  const wash = ctx.createLinearGradient(c[0], c[1] - 28, c[0], c[1] + 24)
  wash.addColorStop(0, '#14162e')
  wash.addColorStop(1, '#2a2450')
  ctx.fillStyle = wash
  ctx.fill()
  ctx.fillStyle = '#f4efe3'
  ctx.beginPath()
  ctx.arc(c[0] + 10, c[1] - 8, 5.2, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#1c1a38'
  ctx.beginPath()
  ctx.arc(c[0] + 12.4, c[1] - 8.4, 4.2, 0, TAU)
  ctx.fill()
  const n = reduced ? 6 : 11
  for (let i = 0; i < n; i++) {
    const x = c[0] + ((i * 17.13) % 40) - 20
    const y = c[1] + ((i * 11.7) % 28) - 16
    const tw = reduced ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i * 1.3))
    ctx.globalAlpha = alpha * tw
    ctx.fillStyle = '#f7f1d8'
    ctx.beginPath()
    ctx.arc(x, y, 0.7 + (i % 3) * 0.25, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Rave
// ---------------------------------------------------------------------------

function strobePulse(t: number, reduced: boolean) {
  // Cap at ~3 flashes per second, short and fairly soft. No flashes when
  // the visitor asked for less motion.
  if (reduced) return 0
  const rate = 2.8
  const phase = (t * rate) % 1
  return phase < 0.14 ? 1 - phase / 0.14 : 0
}

function drawRave(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  const ctx = H.ctx()
  const { floor, walls } = roomPolys(H)
  const colors = ['255,70,150', '70,230,255', '255,220,70', '180,90,255', '80,255,140']
  const pulse = strobePulse(t, reduced)
  const flashColor = colors[Math.floor(t * 2.8) % colors.length]

  ctx.save()
  ctx.globalAlpha = alpha
  fillPoly(ctx, floor, 'rgba(10, 4, 20, 0.3)')
  for (const w of walls) fillPoly(ctx, w, 'rgba(8, 2, 16, 0.18)')

  if (pulse > 0.02) {
    const a = 0.16 * pulse
    fillPoly(ctx, floor, `rgba(${flashColor},${a})`)
    for (const w of walls) fillPoly(ctx, w, `rgba(${flashColor},${a * 0.7})`)
  }

  ctx.globalCompositeOperation = 'lighter'
  const corners: Array<[number, number, number]> = [
    [0.15, 0.15, WALL_H - 0.15],
    [8.85, 0.15, WALL_H - 0.2],
    [0.15, 8.6, 1.6],
    [8.85, 8.6, 1.5],
  ]
  const beams = reduced ? 4 : 8
  for (let k = 0; k < beams; k++) {
    const [i0, j0, z0] = corners[k % corners.length]
    const ang = (reduced ? k * 0.7 : t * (0.55 + (k % 3) * 0.08)) + k * 1.15
    const reach = 5 + (k % 3) * 1.4
    const dest = H.p(4.5 + Math.cos(ang) * reach * 0.35, 4.5 + Math.sin(ang) * reach * 0.35, 0)
    const origin = H.p(i0, j0, z0)
    const rgb = colors[k % colors.length]
    const beam = ctx.createLinearGradient(origin[0], origin[1], dest[0], dest[1])
    beam.addColorStop(0, `rgba(${rgb},${reduced ? 0.18 : 0.36})`)
    beam.addColorStop(0.7, `rgba(${rgb},0.08)`)
    beam.addColorStop(1, `rgba(${rgb},0)`)
    ctx.strokeStyle = beam
    ctx.lineWidth = reduced ? 2.2 : 3.6
    ctx.beginPath()
    ctx.moveTo(origin[0], origin[1])
    ctx.lineTo(dest[0], dest[1])
    ctx.stroke()
  }

  const mid = H.p(rug.i, rug.j, 0)
  const g = ctx.createRadialGradient(mid[0], mid[1], 4, mid[0], mid[1], 62)
  g.addColorStop(0, `rgba(${colors[Math.floor(t) % colors.length]},${reduced ? 0.18 : 0.28})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(mid[0], mid[1], 58, 28, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Cherry blossom
// ---------------------------------------------------------------------------

function drawBlossom(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  const ctx = H.ctx()
  const { floor, walls } = roomPolys(H)
  ctx.save()
  ctx.globalAlpha = alpha
  fillPoly(ctx, floor, 'rgba(255, 186, 196, 0.18)')
  for (const w of walls) fillPoly(ctx, w, 'rgba(255, 170, 170, 0.1)')

  const mid = H.p(rug.i, rug.j, 0)
  const glow = ctx.createRadialGradient(mid[0], mid[1], 6, mid[0], mid[1], 90)
  glow.addColorStop(0, 'rgba(255, 200, 170, 0.22)')
  glow.addColorStop(1, 'rgba(255, 200, 170, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.ellipse(mid[0], mid[1], 86, 42, 0, 0, TAU)
  ctx.fill()

  const petals = reduced ? 10 : 22
  for (let n = 0; n < petals; n++) {
    const cycle = 5.5 + (n % 5) * 0.7
    const u = (t / cycle + n * 0.137) % 1
    const fall = 0.72
    const startI = 0.8 + ((n * 1.91) % 1) * 7.4
    const startJ = 0.6 + ((n * 1.27) % 1) * 7.6
    const landI = rug.i + Math.cos(n * 1.7) * (0.35 + (n % 5) * 0.22)
    const landJ = rug.j + Math.sin(n * 1.3) * (0.3 + (n % 4) * 0.2)
    const drift = reduced ? 0 : Math.sin(t * 0.9 + n) * 0.35
    let i: number
    let j: number
    let z: number
    if (u < fall) {
      const p = u / fall
      const ease = p * p * (3 - 2 * p)
      i = startI + (landI - startI) * ease + drift * (1 - p)
      j = startJ + (landJ - startJ) * ease
      z = WALL_H * (1 - p) + 0.02
    } else {
      i = landI + (reduced ? 0 : Math.sin(t * 0.5 + n) * 0.03)
      j = landJ
      z = 0.02
    }
    const pt = H.p(i, j, z)
    const rot = n * 0.7 + t * (reduced ? 0.15 : 0.6)
    const col = n % 3 === 0 ? 'rgba(255, 214, 220, 0.9)' : n % 3 === 1 ? 'rgba(247, 176, 186, 0.9)' : 'rgba(255, 236, 232, 0.92)'
    drawPetal(ctx, pt[0], pt[1], 4.2 + (n % 3), rot, col)
  }
  ctx.restore()
}

function drawPetal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, fill: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.55, r, 0, 0, TAU)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = 'rgba(43, 38, 34, 0.28)'
  ctx.lineWidth = 0.6
  ctx.stroke()
  ctx.restore()
}

function drawBlossomWindow(H: Hand, pane: Pt[], t: number, alpha: number) {
  const ctx = H.ctx()
  const c = pane.reduce((a, p) => [a[0] + p[0] / pane.length, a[1] + p[1] / pane.length] as Pt, [0, 0])
  ctx.save()
  ctx.globalAlpha = alpha
  path(ctx, pane)
  ctx.clip()
  const wash = ctx.createLinearGradient(c[0], c[1] - 26, c[0], c[1] + 22)
  wash.addColorStop(0, '#f3b07a')
  wash.addColorStop(0.45, '#e8896a')
  wash.addColorStop(1, '#c45e62')
  ctx.fillStyle = wash
  ctx.fill()
  const sunY = c[1] + 8
  const sunX = c[0] + 12
  const glow = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 22)
  glow.addColorStop(0, 'rgba(255, 220, 140, 0.95)')
  glow.addColorStop(0.45, 'rgba(255, 170, 90, 0.55)')
  glow.addColorStop(1, 'rgba(255, 140, 80, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(sunX, sunY, 22, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#f3c56a'
  ctx.beginPath()
  ctx.arc(sunX, sunY, 6.5, 0, TAU)
  ctx.fill()
  void t
  ctx.restore()
}
