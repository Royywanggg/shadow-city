import { describe, expect, it } from 'vitest'
import { WorldBuilder } from '../generation/WorldBuilder'
import type { WorldPointMm } from '../model'
import { createWalkwayDeckGeometry, overpassDeckPath, overpassEndCapPaths,
  overpassGuardPaths } from '../../scene/WalkwayStructures'
import { buildOverpass } from './buildOverpass'

const at = (x: number, y: number, z: number): WorldPointMm => ({ x, y, z })

function twoRoadWorld() {
  const builder = new WorldBuilder()
  builder.surface({ id: 'ground', levelId: 'L0', placeId: null,
    interactionZoneId: 'ground', elevationMm: 250,
    polygonXZ: [{ x: -20_000, z: -20_000 }, { x: 80_000, z: -20_000 },
      { x: 80_000, z: 80_000 }, { x: -20_000, z: 80_000 }],
    blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false })
  for (const [id, position] of [
    ['first-near', at(0, 250, -9_700)], ['first-far', at(12_000, 250, -9_700)],
    ['second-near', at(30_300, 250, 0)], ['second-far', at(30_300, 250, 12_000)],
  ] as const) builder.node(id, position, 'ground')
  const first = buildOverpass(builder, { id: 'first-road',
    start: at(0, 5_500, 0), end: at(12_000, 5_500, 0), widthMm: 2_500,
    groundElevationMm: 250, stairRunMm: 8_200, stairSide: -1,
    groundApproachNodeIds: ['first-near', 'first-far'],
    districtIds: ['west', 'east'] })
  const second = buildOverpass(builder, { id: 'second-road',
    start: at(40_000, 5_500, 0), end: at(40_000, 5_500, 12_000), widthMm: 2_500,
    groundElevationMm: 250, stairRunMm: 8_200, stairSide: 1,
    groundApproachNodeIds: ['second-near', 'second-far'],
    districtIds: ['south', 'north'] })
  builder.buildValidation()
  return { builder, first, second }
}

describe('reusable overpass', () => {
  it('builds independent connected stairs and decks for both road orientations', () => {
    const { builder, first, second } = twoRoadWorld()
    expect(first.stairSide).toBe(-1)
    expect(second.stairSide).toBe(1)
    expect(new Set(builder.nodes.map((node) => node.id)).size).toBe(builder.nodes.length)
    expect(new Set(builder.edges.map((edge) => edge.id)).size).toBe(builder.edges.length)
    for (const bridge of [first, second]) {
      const walk = new Map<string, string[]>()
      for (const edge of builder.edges) {
        walk.set(edge.fromNodeId, [...walk.get(edge.fromNodeId) ?? [], edge.toNodeId])
        walk.set(edge.toNodeId, [...walk.get(edge.toNodeId) ?? [], edge.fromNodeId])
      }
      const near = builder.edges.find((edge) => edge.id === bridge.stairEdgeIds[0])!
      const far = builder.edges.find((edge) => edge.id === bridge.stairEdgeIds[1])!
      const visited = new Set([near.fromNodeId])
      const pending = [near.fromNodeId]
      for (let index = 0; index < pending.length; index += 1) {
        for (const next of walk.get(pending[index]) ?? []) if (!visited.has(next)) {
          visited.add(next); pending.push(next)
        }
      }
      expect(visited.has(far.fromNodeId)).toBe(true)
      expect(near.path.at(-1)!.y).toBe(5_500)
      expect(far.path.at(-1)!.y).toBe(5_500)
    }
    const firstDeck = builder.edges.find((edge) => edge.id === first.deckEdgeIds[0])!
    const secondDeck = builder.edges.find((edge) => edge.id === second.deckEdgeIds[0])!
    expect(new Set(firstDeck.path.map((point) => point.z)).size).toBe(1)
    expect(new Set(secondDeck.path.map((point) => point.x)).size).toBe(1)
    const edgeMap = new Map(builder.edges.map((item) => [item.id, item]))
    const rotatedPath = overpassDeckPath(second, edgeMap)
    expect(rotatedPath[0]).toEqual(at(40_000, 5_500, -1_250))
    expect(rotatedPath.at(-1)).toEqual(at(40_000, 5_500, 12_000))
    expect(overpassGuardPaths(second, edgeMap).stairSide).toHaveLength(1)
    expect(overpassEndCapPaths(second, edgeMap)).toHaveLength(2)
    const rotatedDeck = createWalkwayDeckGeometry(rotatedPath, second.widthMm / 1000)
    rotatedDeck.computeBoundingBox()
    expect(rotatedDeck.boundingBox!.min.x).toBeCloseTo(38.75, 2)
    expect(rotatedDeck.boundingBox!.max.x).toBeCloseTo(41.25, 2)
    rotatedDeck.dispose()
  })

  it('produces the same geometry and IDs when the same specifications are rebuilt', () => {
    expect(twoRoadWorld()).toEqual(twoRoadWorld())
  })
})
