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

describe('dev road corridor foundation', () => {
  it('moves one shared junction by eight metres without changing legacy output', () => {
    const source = sourceCity()
    const before = JSON.stringify(source)
    const after = deriveDevRoadCorridor(source)
    const sourceMiddle = source.roads.nodes.find((node) => node.id === 'node-7-5')!
    const nextMiddle = after.roads.nodes.find((node) => node.id === 'node-7-5')!
    expect(nextMiddle.x - sourceMiddle.x).toBe(8)
    expect(nextMiddle.z).toBe(sourceMiddle.z)
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
      const north = city.roads.edges.find((edge) => edge.id === 'edge-z-7-4')!
      const south = city.roads.edges.find((edge) => edge.id === 'edge-z-7-5')!
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
  })

  it('samples the authoritative centreline in the terrain road profiles', () => {
    const integrated = generateIntegratedWorld(HERO_SEED, { baseCity: sourceCity(),
      openChannelBlockIds: [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS] })
    const city = deriveDevRoadCorridor(integrated.baseCity!)
    const terrain = createDevTerrainV1(city, HERO_SEED)
    for (const edgeId of ['edge-z-7-4', 'edge-z-7-5']) {
      const edge = city.roads.edges.find((item) => item.id === edgeId)!
      const profile = terrain.roadProfiles.find((item) => item.edgeId === edgeId)!
      expect(profile.path.map((point) => ({ x: point.x, z: point.z })))
        .toEqual(edge.centerlineXZ!.map((point) => ({
          x: Math.round(point.x * 1000), z: Math.round(point.z * 1000),
        })))
      expect(profile.path.every((point) => Number.isFinite(point.y))).toBe(true)
    }
  })
})
