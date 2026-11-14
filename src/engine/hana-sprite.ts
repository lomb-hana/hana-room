// Hana's pixel-art sprites. Feet sit at the origin, the same space as drawMascot.

import type { Hand } from './press.ts'
import { drawMark, type Pose } from './mascot.ts'
import type { Mood } from '../scene/actors.ts'

// Sprite-local height in px, before the viewer's SCALE (1.3). 60 * 1.3 ≈ 78 world
// px, a bit taller than the desk (0.86 * 32 ≈ 27.5) so her head sits above the top.
export const HANA_H = 60

const talkUntil = new Map<string, number>()

export function pulseTalk(id: string, ms = 720) {
  talkUntil.set(id, performance.now() + ms)
}

export function talkLift(id: string, t: number) {
  const until = talkUntil.get(id) ?? 0
  if (performance.now() > until) return 0
  return Math.abs(Math.sin(t * 16)) * 5
}

export function isTalking(id: string) {
  return performance.now() < (talkUntil.get(id) ?? 0)
}

function load(src: string) {
  const im = new Image()
  im.src = src
  return im
}

const front = load('/sprites/hana-front-512.png')
const back = load('/sprites/hana-back-512.png')
const sleep = load('/sprites/hana-sleep-512.png')
function ready(im: HTMLImageElement) {
  return im.complete && im.naturalWidth > 0
}

function isFront(face: Pose['face'], talking: boolean) {
  if (talking) return true
  return face === 'se' || face === 'sw'
}

function flipOf(face: Pose['face']) {
  return face === 'sw' || face === 'nw'
}

function drawSprite(c: CanvasRenderingContext2D, im: HTMLImageElement, flip: boolean, sx: number, sy: number, smooth = false) {
  if (!ready(im)) return
  const h = HANA_H
  const w = (im.naturalWidth / im.naturalHeight) * h
  c.save()
  c.imageSmoothingEnabled = smooth
  c.scale(flip ? -sx : sx, sy)
  c.drawImage(im, -w / 2, -h, w, h)
  c.restore()
}

function drawSleep(c: CanvasRenderingContext2D, flip: boolean, sx: number, sy: number) {
  const im = ready(sleep) ? sleep : front
  if (!ready(im)) return
  // Match standing height; the sleep art is nearly square, so this keeps her
  // the same size in bed instead of shrinking her.
  const h = HANA_H
  const w = (im.naturalWidth / im.naturalHeight) * h
  c.save()
  c.imageSmoothingEnabled = false
  c.scale(flip ? -sx : sx, sy)
  c.drawImage(im, -w / 2, -h / 2, w, h)
  c.restore()
}

export function drawHana(H: Hand, pose: Pose, _mood?: Mood, id?: string) {
  const c = H.ctx()
  const talking = Boolean(id && isTalking(id))
  const frontFacing = isFront(pose.face, talking)
  const im = frontFacing ? front : back
  const flip = flipOf(pose.face)
  const lean = pose.lean + (pose.lying ? (pose.face === 'sw' || pose.face === 'nw' ? 0.2 : -0.2) : 0)

  if (!pose.lying) {
    const k = Math.max(0.45, 1 - pose.lift / 40)
    c.save()
    c.fillStyle = `rgba(0, 0, 0, ${0.32 * k + 0.06})`
    c.beginPath()
    c.ellipse(1, 1.2, 9 * pose.sx * k, 3.4 * k, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
  }

  c.save()
  c.translate(0, -pose.lift)
  if (pose.lying) {
    // The sleep art is already lying, head to the left. Rotate so her head
    // faces the headboard (up-left) and keep the same scale as standing.
    c.translate(2, 2)
    c.rotate(-0.72 + lean * 0.25)
    drawSleep(c, flip, pose.sx, pose.sy)
  } else {
    c.rotate(lean)
    drawSprite(c, im, flip, pose.sx, pose.sy)
  }
  c.restore()

  if (pose.lying) {
    // Room Zzz only; the sleep art's drawn Zzz were cut out so they do not stack.
    const x0 = -22 * (flip ? -1 : 1)
    const y0 = -28 - pose.lift
    for (let n = 0; n < 3; n++) {
      const u = (pose.t * 0.35 + n / 3) % 1
      const zx = x0 + 3 + u * 11
      const zy = y0 - u * 22
      const s = 2.2 + u * 2.4
      H.line(null, [[zx - s, zy - s], [zx + s, zy - s], [zx - s, zy + s], [zx + s, zy + s]], 'paper', 1.4, { tone: 0.85 - u * 0.45, amp: 0, fine: true })
    }
  }
  else {
    const top = -HANA_H * pose.sy
    drawMark(H, pose, Math.sin(lean) * (-top + pose.lift) + (flip ? -8 : 8), top - pose.lift - 3)
  }
}

export function portraitHana(_size = 68) {
  return '/sprites/hana-portrait-128.png'
}
