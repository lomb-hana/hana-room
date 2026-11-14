// A lightweight dance-party overlay while a record is playing: a dim floor,
// sweeping colored lights, a hanging faceted disco ball, and sparkles.
// Drawn in room iso space after the furniture.

import { TAU, type Hand } from './press.ts'
import { WALL_H } from './world.ts'

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

const HOOK_Z = WALL_H + 1.38
const BALL_Z = 2.18
const BALL_RX = 17.5
const BALL_RY = 15

export function drawParty(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  if (alpha <= 0.01) return
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
