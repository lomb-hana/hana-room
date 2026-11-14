// Live pins on the corkboard: a short hot-take slip and a couple of notes,
// so the board is readable even before you click it.

import type { Hand } from './press.ts'
import { placer, sizeOf, type Kind } from './kinds.ts'
import type { Item } from '../types.ts'

export type BoardData = {
  hotTake: string
  date: string
  notes: string[]
}

export function drawBoardPins(H: Hand, item: Item, kind: Kind, board: BoardData) {
  const pl = placer(item.at, sizeOf(kind, item))
  const at = (u: number, z: number) => H.p(...pl.W(u, 0.045, z))
  const rect = (u: number, z: number, w: number, h: number) => [at(u, z), at(u + w, z), at(u + w, z + h), at(u, z + h)]

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
