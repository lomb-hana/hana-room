// Hana's chibi sprite, drawn in the same foot-at-origin space as drawMascot.
// Modest adult proportions, futuristic clothes, a visor that flips down at work.

import { ell, mkHand, type Hand } from './press.ts'
import { drawMark, type Pose } from './mascot.ts'
import type { Mood } from '../scene/actors.ts'

const SKIN = '#e4c3a4'
const SKIN_SH = '#c99b7a'
const HAIR = '#14161c'
const HAIR_HI = '#2a2e38'
const STREAK_CYAN = '#7ef0ea'
const STREAK_PINK = '#ff5ea8'
const JACKET = '#12151c'
const JACKET_HI = '#242833'
const COLLAR = '#d7b57a'
const TOP = '#2a3140'
const PANTS = '#0e1016'
const SHOE = '#08090c'
const VISOR_RIM = '#c9f6f4'
const VISOR_GLASS = 'rgba(10, 18, 26, 0.82)'
const talkUntil = new Map<string, number>()

export function pulseTalk(id: string, ms = 720) {
  talkUntil.set(id, performance.now() + ms)
}

export function talkLift(id: string, t: number) {
  const until = talkUntil.get(id) ?? 0
  if (performance.now() > until) return 0
  return Math.abs(Math.sin(t * 16)) * 6
}

function fillOval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  c.fillStyle = fill
  c.fill()
}

function strokeOval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, stroke: string, w = 1) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  c.strokeStyle = stroke
  c.lineWidth = w
  c.stroke()
}

function fillRound(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  const rr = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + rr, y)
  c.arcTo(x + w, y, x + w, y + h, rr)
  c.arcTo(x + w, y + h, x, y + h, rr)
  c.arcTo(x, y + h, x, y, rr)
  c.arcTo(x, y, x + w, y, rr)
  c.closePath()
  c.fillStyle = fill
  c.fill()
}

function strokeRound(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, lw = 1) {
  const rr = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + rr, y)
  c.arcTo(x + w, y, x + w, y + h, rr)
  c.arcTo(x + w, y + h, x, y + h, rr)
  c.arcTo(x, y + h, x, y, rr)
  c.arcTo(x, y, x + w, y, rr)
  c.closePath()
  c.strokeStyle = stroke
  c.lineWidth = lw
  c.stroke()
}

function limb(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, fill: string) {
  c.save()
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.strokeStyle = fill
  c.lineWidth = w
  c.beginPath()
  c.moveTo(x0, y0)
  c.lineTo(x1, y1)
  c.stroke()
  c.restore()
}

function isBack(face: Pose['face']) {
  return face === 'ne' || face === 'nw'
}

function flipOf(face: Pose['face']) {
  return face === 'sw' || face === 'nw' ? -1 : 1
}

function drawHair(c: CanvasRenderingContext2D, back: boolean) {
  // Dark bob: rounded cap, jaw-length sides, a short nape.
  c.fillStyle = HAIR
  c.beginPath()
  c.ellipse(0, -43.2, 12.4, 13.2, 0, 0, Math.PI * 2)
  c.fill()
  c.beginPath()
  c.moveTo(-12.2, -44)
  c.quadraticCurveTo(-14.6, -28, -8.5, -26.5)
  c.quadraticCurveTo(-4.5, -30, -2, -29)
  c.lineTo(2, -29)
  c.quadraticCurveTo(4.5, -30, 8.5, -26.5)
  c.quadraticCurveTo(14.6, -28, 12.2, -44)
  c.closePath()
  c.fill()
  // Soft highlight on the crown.
  fillOval(c, -3.2, -50.4, 5.4, 2.4, HAIR_HI)
  // Neon streak: cyan root fading to pink at the tip, always on her left (screen right after flip? drawn in body space, on the +x side so it stays consistent after flip).
  c.save()
  c.beginPath()
  c.moveTo(5.2, -53)
  c.quadraticCurveTo(11.5, -48, 10.8, -34)
  c.quadraticCurveTo(9.2, -29.5, 7.4, -30.5)
  c.quadraticCurveTo(8.6, -40, 4.4, -50)
  c.closePath()
  const g = c.createLinearGradient(6, -54, 10, -30)
  g.addColorStop(0, STREAK_CYAN)
  g.addColorStop(0.55, STREAK_CYAN)
  g.addColorStop(1, STREAK_PINK)
  c.fillStyle = g
  c.fill()
  c.restore()
  if (!back) {
    // Soft bangs over the forehead, leaving the eyes clear.
    c.fillStyle = HAIR
    c.beginPath()
    c.moveTo(-9.5, -50)
    c.quadraticCurveTo(-6, -42.5, -3.2, -39.8)
    c.quadraticCurveTo(-1, -44, 1.5, -41)
    c.quadraticCurveTo(4.5, -38.5, 8.6, -42)
    c.quadraticCurveTo(7, -51, 0, -55)
    c.closePath()
    c.fill()
  }
}

function drawVisor(c: CanvasRenderingContext2D, down: boolean, back: boolean) {
  const y = down ? -41.2 : -49.4
  const tilt = down ? 0.04 : -0.18
  c.save()
  c.translate(0, y)
  c.rotate(tilt)
  c.shadowColor = 'rgba(143, 224, 221, 0.7)'
  c.shadowBlur = down ? 4 : 2.5
  // Arms that rest over the ears / hair.
  c.strokeStyle = VISOR_RIM
  c.lineWidth = 0.95
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(-11.2, 1.1)
  c.lineTo(-8.4, 0.15)
  c.moveTo(11.2, 1.1)
  c.lineTo(8.4, 0.15)
  c.stroke()
  // Thin bar across the eyes or brow, not a halo around the whole head.
  fillRound(c, -8.5, -1.05, 17, 2.0, 1, down ? VISOR_GLASS : 'rgba(12, 18, 24, 0.5)')
  strokeRound(c, -8.5, -1.05, 17, 2.0, 1, VISOR_RIM, 0.95)
  if (down && !back) {
    c.shadowBlur = 0
    c.fillStyle = 'rgba(126, 240, 234, 0.35)'
    fillRound(c, -7.4, -0.7, 6.2, 1.2, 0.6, 'rgba(126, 240, 234, 0.4)')
    fillRound(c, 1.4, -0.7, 4.4, 1.2, 0.6, 'rgba(255, 94, 168, 0.28)')
  }
  c.restore()
}

function drawFace(c: CanvasRenderingContext2D, pose: Pose, visorDown: boolean) {
  const t = pose.t
  const blink = pose.eyes === 'open' && (t % 4.1 > 3.96 || t % 9.7 > 9.58)
  const shut = pose.eyes === 'shut' || blink
  const happy = pose.eyes === 'happy'
  const wide = pose.eyes === 'wide'
  const focus = pose.eyes === 'focus' || visorDown
  const eyeY = -41.4
  const gap = wide ? 5.1 : 4.6
  const eyeH = shut ? 0 : wide ? 2.1 : focus ? 1.35 : 1.7
  const eyeW = wide ? 2.05 : 1.8
  if (shut) {
    c.strokeStyle = '#3a2a22'
    c.lineWidth = 1.05
    c.lineCap = 'round'
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(s * gap - 1.7, eyeY)
      c.quadraticCurveTo(s * gap, eyeY + 1.1, s * gap + 1.7, eyeY)
      c.stroke()
    }
  } else {
    for (const s of [-1, 1]) {
      fillOval(c, s * gap, eyeY, eyeW, eyeH, '#1a1210')
      if (!focus) fillOval(c, s * gap - 0.45, eyeY - 0.5, 0.55, 0.5, '#f7f3ee')
    }
    if (happy) {
      c.strokeStyle = '#1a1210'
      c.lineWidth = 0.9
      for (const s of [-1, 1]) {
        c.beginPath()
        c.arc(s * gap, eyeY + 0.15, 1.7, Math.PI * 1.05, Math.PI * 1.95)
        c.stroke()
      }
    }
  }
  // Small nose and a modest closed-smile mouth.
  c.fillStyle = SKIN_SH
  fillOval(c, 0.15, -38.4, 0.7, 0.55, SKIN_SH)
  if (pose.eyes !== 'shut') {
    c.strokeStyle = '#b57b6a'
    c.lineWidth = 0.9
    c.lineCap = 'round'
    c.beginPath()
    c.moveTo(-1.5, -35.6)
    c.quadraticCurveTo(0, -34.4, 1.6, -35.6)
    c.stroke()
  }
}

function drawBody(c: CanvasRenderingContext2D, pose: Pose, mood: Mood | undefined) {
  const back = isBack(pose.face)
  const working = mood === 'work' || mood === 'think' || pose.eyes === 'focus'
  const waiting = mood === 'wait'
  const visorDown = working && !pose.lying
  const walk = pose.lean !== 0 && !pose.lying
  const swing = walk ? Math.sin(pose.t * 7) * 5.5 : Math.sin(pose.t * 1.6) * 1.4
  const lounge = mood === 'idle' && !walk && !pose.lying

  // Legs / full-length pants.
  const hipY = -16
  const footY = -1.2
  const legSpread = lounge ? 7.4 : 5.2
  for (const s of [-1, 1]) {
    const kick = walk ? s * swing * 0.35 : 0
    limb(c, s * 3.2, hipY, s * legSpread + kick, footY, 6.2, PANTS)
    fillOval(c, s * legSpread + kick, footY + 0.6, 3.3, 1.45, SHOE)
  }

  // Torso: fitted top, then a cropped-collar jacket over it.
  fillRound(c, -6.2, -29.5, 12.4, 14.2, 3.4, TOP)
  // Jacket panels, open just enough to show the top, closed modestly.
  c.fillStyle = JACKET
  c.beginPath()
  c.moveTo(-7.2, -29.8)
  c.quadraticCurveTo(-8.4, -22, -7.6, -16.2)
  c.lineTo(-1.6, -16.2)
  c.quadraticCurveTo(-2.4, -23, -1.8, -29.2)
  c.closePath()
  c.fill()
  c.beginPath()
  c.moveTo(7.2, -29.8)
  c.quadraticCurveTo(8.4, -22, 7.6, -16.2)
  c.lineTo(1.6, -16.2)
  c.quadraticCurveTo(2.4, -23, 1.8, -29.2)
  c.closePath()
  c.fill()
  // Cropped hem.
  fillRound(c, -7.8, -17.4, 15.6, 2.2, 1, JACKET_HI)
  // Collar, slightly cropped / standing, with a thin gold edge.
  c.fillStyle = JACKET
  c.beginPath()
  c.moveTo(-4.8, -30.2)
  c.lineTo(-6.4, -34.2)
  c.lineTo(-1.2, -30.6)
  c.closePath()
  c.fill()
  c.beginPath()
  c.moveTo(4.8, -30.2)
  c.lineTo(6.4, -34.2)
  c.lineTo(1.2, -30.6)
  c.closePath()
  c.fill()
  c.strokeStyle = COLLAR
  c.lineWidth = 1
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(-6.2, -33.6)
  c.lineTo(-1.4, -30.4)
  c.moveTo(6.2, -33.6)
  c.lineTo(1.4, -30.4)
  c.stroke()

  // Arms.
  const shoulderY = -27.6
  if (waiting && !pose.lying) {
    limb(c, -5.8, shoulderY, -9.2, -18.5, 4.4, JACKET)
    fillOval(c, -9.4, -16.6, 1.8, 1.8, SKIN)
    // Waving arm.
    const wave = Math.sin(pose.t * 8) * 10
    c.save()
    c.translate(5.8, shoulderY)
    c.rotate((-42 + wave) * (Math.PI / 180))
    limb(c, 0, 0, 0, -13.5, 4.4, JACKET)
    fillOval(c, 0, -15.4, 1.9, 1.9, SKIN)
    c.restore()
  } else if (working && !pose.lying) {
    limb(c, -5.8, shoulderY, -8.8 + swing * 0.1, -17.2, 4.4, JACKET)
    fillOval(c, -9.0, -15.4, 1.8, 1.8, SKIN)
    limb(c, 5.8, shoulderY, 7.4, -20.2, 4.4, JACKET)
    fillOval(c, 7.8, -18.6, 1.8, 1.8, SKIN)
  } else {
    limb(c, -5.8, shoulderY, -8.6 - swing * 0.25, -16.8, 4.4, JACKET)
    fillOval(c, -8.8 - swing * 0.25, -15, 1.8, 1.8, SKIN)
    limb(c, 5.8, shoulderY, 8.6 + swing * 0.25, -16.8, 4.4, JACKET)
    fillOval(c, 8.8 + swing * 0.25, -15, 1.8, 1.8, SKIN)
  }

  // Neck and head.
  fillRound(c, -2.1, -33.6, 4.2, 4.2, 1.4, SKIN)
  fillOval(c, 0, -42.2, 11.2, 12.2, SKIN)
  // Ears, tucked under the bob.
  if (!back) {
    fillOval(c, -11.2, -41.2, 1.7, 2.3, SKIN)
    fillOval(c, 11.2, -41.2, 1.7, 2.3, SKIN)
  }
  if (back) {
    drawHair(c, true)
    drawVisor(c, visorDown, true)
  } else {
    drawHair(c, false)
    drawFace(c, pose, visorDown)
    drawVisor(c, visorDown, false)
  }

  // Quiet outline around the head so she reads at small scale.
  strokeOval(c, 0, -42.2, 12.5, 13.4, 'rgba(8,10,14,0.22)', 0.8)
}

export function drawHana(H: Hand, pose: Pose, mood?: Mood) {
  const c = H.ctx()
  const lean = pose.lean + (pose.lying ? (pose.face === 'sw' || pose.face === 'nw' ? 0.55 : -0.55) : 0)

  if (pose.dust !== undefined && pose.dust !== null) {
    const u = pose.dust
    for (const side of [-1, 1]) {
      const P = ell(side * (14 + u * 10), -2 - u * 3, 2.5 + u * 3, 2)
      H.tint(P, 'paper', 0.55 * (1 - u), { fine: true })
    }
  }
  const k = Math.max(0.45, 1 - pose.lift / 40)
  H.tint(ell(1, 0.5, 11 * pose.sx * k, 4.4 * k, 24), 'black', 0.35 * k + 0.06, { fine: true })

  c.save()
  c.translate(0, -pose.lift)
  if (pose.lying) {
    // A tall chibi cannot lie flat without leaving the pod, so she tucks in with a small recline.
    c.translate(0, 8)
    c.rotate(lean)
    c.scale(pose.sx * flipOf(pose.face) * 0.88, pose.sy * 0.72)
  } else {
    c.rotate(lean)
    c.scale(pose.sx * flipOf(pose.face), pose.sy)
  }
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  c.lineJoin = 'round'
  c.lineCap = 'round'
  drawBody(c, pose, mood)
  c.restore()

  if (pose.lying) {
    drawMark(H, pose, 10 * flipOf(pose.face), -36 - pose.lift)
  } else {
    const top = -56 * pose.sy
    drawMark(H, pose, Math.sin(lean) * (-top + pose.lift) + (pose.face === 'sw' || pose.face === 'nw' ? -8 : 8), top - pose.lift - 4)
  }
}

export function portraitHana(size = 68) {
  const cv = document.createElement('canvas')
  cv.width = size * 2
  cv.height = size * 2
  const c = cv.getContext('2d')!
  const k = (size * 2) / 68
  c.setTransform(k, 0, 0, k, size, size * 2 - 3 * k)
  // A quiet glow so the dark jacket still reads on a dark HUD chip.
  const g = c.createRadialGradient(0, -28, 4, 0, -28, 28)
  g.addColorStop(0, 'rgba(143, 224, 221, 0.22)')
  g.addColorStop(1, 'rgba(143, 224, 221, 0)')
  c.fillStyle = g
  c.beginPath()
  c.ellipse(0, -28, 22, 26, 0, 0, Math.PI * 2)
  c.fill()
  const pose: Pose = { t: 1, face: 'se', sx: 1, sy: 1, lean: 0, lift: 0, eyes: 'open', mark: null }
  const H = mkHand(c, { seed: 3, fine: true })
  drawHana(H, pose, 'idle')
  return cv.toDataURL()
}
