import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { createDevTerrainV1, DEV_ESCARPMENT_BLOCK_IDS,
  DEV_OPEN_CHANNEL_BLOCK_IDS } from '../terrain/devTerrain'
import { createDevOrganicLayout } from './devOrganicLayout'
import { deriveDevRoadCorridor } from './devRoadCorridor'
import { expandOriginalCity } from './expandOriginalCity'
import { generateIntegratedWorld } from './generateIntegratedWorld'

function sourceCity(seed = HERO_SEED) {
  return createDevOrganicLayout(expandOriginalCity(generateCity(seed)))
}

const CORRIDOR_PAIRS = [
  ['edge-z-3-4', 'edge-z-3-5'],
  ['edge-z-7-1', 'edge-z-7-2'],
  ['edge-z-7-4', 'edge-z-7-5'],
] as const

describe('dev road corridor foundation', () => {
  it('moves three shared junctions by eight metres without changing legacy output', () => {
    const source = sourceCity()
    const before = JSON.stringify(source)
    const after = deriveDevRoadCorridor(source)
    for (const nodeId of ['node-3-5', 'node-7-2', 'node-7-5']) {
      const sourceMiddle = source.roads.nodes.find((node) => node.id === nodeId)!
      const nextMiddle = after.roads.nodes.find((node) => node.id === nodeId)!
      expect(nextMiddle.x - sourceMiddle.x).toBe(8)
      expect(nextMiddle.z).toBe(sourceMiddle.z)
    }
    expect(JSON.stringify(source)).toBe(before)
    expect(after.buildings).toBe(source.buildings)
    expect(after.blocks).toBe(source.blocks)
    expect(after.parcels).toBe(source.parcels)
    expect(deriveDevRoadCorridor(after)).toBe(after)
    expect(deriveDevRoadCorridor(source)).toEqual(after)
    expect(generateCity(HERO_SEED).roads.edges.every((edge) =>
      edge.centerlineXZ === undefined)).toBe(true)
  })

  it('joins both sampled centreline edges at the graph node with a shared tangent', () => {
    for (const seed of [HERO_SEED, 'twilight-layout-02', 'twilight-layout-03']) {
      const city = deriveDevRoadCorridor(sourceCity(seed))
      const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
      for (const [northId, southId] of CORRIDOR_PAIRS) {
        const north = city.roads.edges.find((edge) => edge.id === northId)!
        const south = city.roads.edges.find((edge) => edge.id === southId)!
        const a = north.centerlineXZ!
        const b = south.centerlineXZ!
        const coordinates = (nodeId: string) => {
          const node = nodes.get(nodeId)!
          return { x: node.x, z: node.z }
        }
        expect(a[0]).toEqual(coordinates(north.from))
        expect(a.at(-1)).toEqual(coordinates(north.to))
        expect(b[0]).toEqual(coordinates(south.from))
        expect(b.at(-1)).toEqual(coordinates(south.to))
        expect(a.at(-1)).toEqual(b[0])
        expect(Math.abs(a.at(-1)!.x - a.at(-2)!.x)).toBeLessThan(0.2)
        expect(Math.abs(b[1].x - b[0].x)).toBeLessThan(0.2)
        expect(a.length).toBeGreaterThan(10)
        expect(b.length).toBeGreaterThan(10)
      }
    }
  })

  it('samples the authoritative centreline in the terrain road profiles', () => {
    const integrated = generateIntegratedWorld(HERO_SEED, { baseCity: sourceCity(),
      openChannelBlockIds: [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS] })
    const city = deriveDevRoadCorridor(integrated.baseCity!)
    const terrain = createDevTerrainV1(city, HERO_SEED)
    for (const edgeId of CORRIDOR_PAIRS.flat()) {
      const edge = city.roads.edges.find((item) => item.id === edgeId)!
      const profile = terrain.roadProfiles.find((item) => item.edgeId === edgeId)!
      expect(profile.path.map((point) => ({ x: point.x, z: point.z })))
        .toEqual(edge.centerlineXZ!.map((point) => ({
          x: Math.round(point.x * 1000), z: Math.round(point.z * 1000),
        })))
      expect(profile.path.every((point) => Number.isFinite(point.y))).toBe(true)
    }
  })

  it('keeps edge furniture beside the curved road and leaves unrelated features untouched', () => {
    const base = sourceCity()
    const nodes = new Map(base.roads.nodes.map((node) => [node.id, node]))
    const fixture = (edgeId: string, id: string, t: number, lateral: number) => {
      const edge = base.roads.edges.find((item) => item.id === edgeId)!
      const from = nodes.get(edge.from)!
      const to = nodes.get(edge.to)!
      const dx = to.x - from.x
      const dz = to.z - from.z
      const length = Math.hypot(dx, dz)
      return { id, kind: 'lamp' as const,
        x: from.x + dx * t - dz / length * lateral,
        z: from.z + dz * t + dx / length * lateral,
        rotationY: Math.atan2(dx, dz), scale: 1 }
    }
    const added = [
      fixture('edge-z-3-4', 'lamp-edge-z-3-4-99', 0.51, 5.2),
      fixture('edge-z-7-1', 'lamp-edge-z-7-1-0', 0.39, 3.6),
      fixture('edge-z-7-4', 'lamp-edge-z-7-4-0', 0.43, 3.6),
      fixture('edge-z-7-5', 'bus-stop-edge-z-7-5', 0.57, -3.9),
    ]
    const source = { ...base, streetFeatures: [...base.streetFeatures, ...added] }
    const result = deriveDevRoadCorridor(source)
    expect(deriveDevRoadCorridor(source)).toEqual(result)
    expect(result.streetFeatures.slice(0, base.streetFeatures.length))
      .toEqual(base.streetFeatures)
    const distanceToPath = (x: number, z: number,
      path: readonly { x: number; z: number }[]) => Math.min(...path.slice(1)
        .map((to, index) => {
          const from = path[index]
          const dx = to.x - from.x
          const dz = to.z - from.z
          const t = Math.max(0, Math.min(1,
            ((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz)))
          return Math.hypot(x - from.x - dx * t, z - from.z - dz * t)
        }))
    for (const [index, edgeId, offset] of [
      [0, 'edge-z-3-4', 5.2], [1, 'edge-z-7-1', 3.6],
      [2, 'edge-z-7-4', 3.6], [3, 'edge-z-7-5', 3.9],
    ] as const) {
      const feature = result.streetFeatures.at(-4 + index)!
      const edge = result.roads.edges.find((item) => item.id === edgeId)!
      const path = edge.centerlineXZ!
      expect(feature.id).toBe(added[index].id)
      expect(Math.hypot(feature.x - added[index].x,
        feature.z - added[index].z)).toBeGreaterThan(1)
      expect(distanceToPath(feature.x, feature.z, path)).toBeCloseTo(offset, 1)
      expect(distanceToPath(feature.x, feature.z, path))
        .toBeGreaterThan(edge.width / 2 + 0.5)
      expect(Number.isFinite(feature.rotationY)).toBe(true)
    }
  })
})
