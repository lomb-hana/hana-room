// A room as a scene: the base (floor, walls, rugs, things on the walls) printed once,
// then the things that stand, back to front, with the bots sorting in among them.

import { streamOf, type Hand, type Rng } from './press.ts'
import { EDGES, aoBox, drawBulb, drawShell, lampPool, type Edges } from './world.ts'
import { drawThing, sizeOf, type Kind } from './kinds.ts'
import { placer } from './kinds.ts'
import type { Item, Room } from '../types.ts'

export const kindOf = (kinds: Record<string, Kind>, item: Item): Kind | null => kinds[item.kind] || null
export const layerOf = (kind: Kind) => (kind.place === 'rug' ? 'rug' : kind.place === 'wall' ? 'wall' : 'stand')

// The base: the card, floor, walls, rugs (under the sun patch), and everything hung on the walls.
export function drawBase(
  H: Hand,
  rm: Room,
  items: Item[],
  kinds: Record<string, Kind>,
  images: Record<string, HTMLImageElement | null>,
  o: { edges?: Edges } = {},
) {
  const R: Rng = streamOf('room', rm.id)
  const E = o.edges ?? EDGES
  const flat = items.filter((it) => kindOf(kinds, it) && layerOf(kindOf(kinds, it)!) === 'rug')
  const hung = items.filter((it) => kindOf(kinds, it) && layerOf(kindOf(kinds, it)!) === 'wall')
  const future = rm.look === 'future'
  drawShell(H, R, rm, {
    edges: E,
    onFloor: () => {
      for (const it of flat) drawThing(H, streamOf('item', it.id), kindOf(kinds, it)!, it, images, future ? { crisp: true, fine: true, lw: 0.7 } : {})
      if (future) {
        for (const it of items) {
          const k = kindOf(kinds, it)
          if (!k || k.place !== 'floor') continue
          const [w, d] = placer(it.at, sizeOf(k, it)).size(...sizeOf(k, it))
          aoBox(H, it.at.i, it.at.j, w, d)
        }
        for (const it of items) {
          if (it.kind !== 'table-lamp') continue
          lampPool(H, it.at.i + 0.2, it.at.j + 0.2, 1.15)
        }
      }
    },
  })
  for (const it of hung) drawThing(H, streamOf('item', it.id), kindOf(kinds, it)!, it, images, future ? { crisp: true, fine: true, lw: 0.7 } : {})
  drawBulb(H, R, rm, true, E)
}
