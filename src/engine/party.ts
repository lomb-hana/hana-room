// A lightweight dance-party overlay while a record is playing: a dim floor,
// a few sweeping colored lights (or a still glow if motion is reduced), a
// little disco ball, and sparkles. Drawn in room iso space after the furniture.

import { TAU, type Hand } from './press.ts'

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function drawParty(H: Hand, t: number, alpha: number, rug: { i: number; j: number }, reduced: boolean) {
  if (alpha <= 0.01) return
  const ctx = H.ctx()
  const floor = [H.p(0, 0, 0), H.p(9, 0, 0), H.p(9, 9, 0), H.p(0, 9, 0)]
  const mid = H.p(rug.i, rug.j, 0)
  const ball = H.p(rug.i, rug.j, 1.55)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  floor.forEach((p, n) => (n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
  ctx.fillStyle = 'rgba(16, 6, 28, 0.32)'
  ctx.fill()
  ctx.clip()

  const colors = ['255,70,150', '40,220,255', '255,210,70']
  ctx.globalCompositeOperation = 'lighter'
  for (let k = 0; k < 3; k++) {
    const ang = reduced ? k * (TAU / 3) + 0.4 : t * (0.65 + k * 0.12) + k * 2.15
    const land = H.p(rug.i + Math.cos(ang) * 1.25, rug.j + Math.sin(ang) * 1.25, 0)
    const rgb = colors[k]
    const g = ctx.createRadialGradient(land[0], land[1], 2, land[0], land[1], 64)
    g.addColorStop(0, `rgba(${rgb},${reduced ? 0.34 : 0.48})`)
    g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(land[0], land[1], 62, 30, 0, 0, TAU)
    ctx.fill()
    if (!reduced) {
      const beam = ctx.createLinearGradient(ball[0], ball[1], land[0], land[1])
      beam.addColorStop(0, `rgba(${rgb},0.28)`)
      beam.addColorStop(1, `rgba(${rgb},0)`)
      ctx.strokeStyle = beam
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.moveTo(ball[0], ball[1])
      ctx.lineTo(land[0], land[1])
      ctx.stroke()
    }
  }

  ctx.globalCompositeOperation = 'source-over'
  // A tiny disco ball hanging over the rug.
  ctx.fillStyle = 'rgba(210, 216, 224, 0.95)'
  ctx.beginPath()
  ctx.ellipse(ball[0], ball[1], 6.5, 5.5, 0, 0, TAU)
  ctx.fill()
  ctx.strokeStyle = 'rgba(40, 36, 32, 0.45)'
  ctx.lineWidth = 0.8
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.beginPath()
  ctx.moveTo(ball[0], ball[1] - 14)
  ctx.lineTo(ball[0], ball[1] - 5)
  ctx.stroke()
  if (!reduced) {
    const flash = 0.35 + 0.65 * Math.abs(Math.sin(t * 10))
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * flash})`
    ctx.beginPath()
    ctx.ellipse(ball[0] - 2, ball[1] - 1.5, 2.2, 1.6, 0, 0, TAU)
    ctx.fill()
  }

  const count = reduced ? 6 : 18
  for (let n = 0; n < count; n++) {
    const u = reduced ? (n / count) : ((t * 0.32 + n * 0.17) % 1)
    const ang = n * 2.399 + (reduced ? 0 : t * 0.35)
    const r = 12 + (n % 5) * 13
    const x = mid[0] + Math.cos(ang) * r
    const y = mid[1] - 8 - u * 36 + Math.sin(ang) * r * 0.48
    const tw = reduced ? 0.45 : 0.3 + 0.7 * Math.abs(Math.sin(t * 7 + n * 1.7))
    if (tw < 0.08) continue
    drawSpark(ctx, x, y, 2.2 * tw, n % 2 ? '#fff6c4' : '#ffd6ff', tw)
  }
  ctx.restore()
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
