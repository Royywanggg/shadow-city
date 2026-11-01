import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { derivePedestrianNetwork } from '../../city/pedestrian/derivePedestrianNetwork'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { DEV_ESCARPMENT_BLOCK_IDS } from '../terrain/devTerrain'
import { applyDevNorthAnnex, DEV_NORTH_ANNEX_BLOCK_PREFIX,
  DEV_NORTH_ANNEX_MIN_Z_M } from './devNorthAnnex'
import { expandOriginalCity } from './expandOriginalCity'
import { generateDevWorld } from './generateDevWorld'

function createAnnex(seed = HERO_SEED) {
  const base = expandOriginalCity(generateCity(seed))
  return { base, city: applyDevNorthAnnex(base) }
}

function reachable(start: string, target: string,
  edges: readonly { from: string; to: string }[]): boolean {
  const neighbours = new Map<string, string[]>()
  for (const edge of edges) {
    neighbours.set(edge.from, [...neighbours.get(edge.from) ?? [], edge.to])
    neighbours.set(edge.to, [...neighbours.get(edge.to) ?? [], edge.from])
  }
  const visited = new Set([start])
  const queue = [start]
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of neighbours.get(queue[index]) ?? []) {
      if (next === target) return true
      if (!visited.has(next)) { visited.add(next); queue.push(next) }
    }
  }
  return start === target
}

describe('dev north annex', () => {
  it('appends deterministic independent blocks without changing the old city', () => {
    for (const seed of [HERO_SEED, 'twilight-north-alt-01']) {
      const { base, city } = createAnnex(seed)
      expect(applyDevNorthAnnex(base)).toEqual(city)
      expect(city.size).toBe(base.size)
      expect(city.roads.nodes.slice(0, base.roads.nodes.length)).toEqual(base.roads.nodes)
      expect(city.roads.edges.slice(0, base.roads.edges.length)).toEqual(base.roads.edges)
      expect(city.blocks.slice(0, base.blocks.length)).toEqual(base.blocks)
      expect(city.parcels.slice(0, base.parcels.length)).toEqual(base.parcels)
      expect(city.buildings.slice(0, base.buildings.length)).toEqual(base.buildings)
      expect(city.streetFeatures.slice(0, base.streetFeatures.length))
        .toEqual(base.streetFeatures)
      const annexBlocks = city.blocks.filter((block) =>
        block.id.startsWith(DEV_NORTH_ANNEX_BLOCK_PREFIX))
      expect(annexBlocks).toHaveLength(5)
      expect(annexBlocks.filter((block) => block.isPark)).toHaveLength(1)
      expect(city.buildings.filter((building) =>
        building.parcelId.startsWith('parcel-dev-north-'))).toHaveLength(10)
      expect(annexBlocks.every((block) => block.z - block.depth / 2 >
        DEV_NORTH_ANNEX_MIN_Z_M + 2)).toBe(true)
      expect(() => applyDevNorthAnnex(city)).toThrow(/Duplicate north annex node/)
    }
  })

  it('uses the same sampled north road path for graph geometry and clear building frontage', () => {
    const { city } = createAnnex()
    const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
    const northEdges = city.roads.edges.filter((edge) =>
      /^edge-x--?\d+--2$/.test(edge.id))
    expect(northEdges).toHaveLength(9)
    for (const edge of northEdges) {
      const path = edge.centerlineXZ!
      expect(path.length).toBeGreaterThan(2)
      expect(path[0]).toEqual({ x: nodes.get(edge.from)!.x,
        z: nodes.get(edge.from)!.z })
      expect(path.at(-1)).toEqual({ x: nodes.get(edge.to)!.x,
        z: nodes.get(edge.to)!.z })
      expect(path.every((point) => point.z > DEV_NORTH_ANNEX_MIN_Z_M + 4))
        .toBe(true)
    }
    const northRoadZ = northEdges.flatMap((edge) => edge.centerlineXZ!)
    const buildings = city.buildings.filter((building) =>
      building.parcelId.startsWith('parcel-dev-north-'))
    for (const building of buildings) {
      const groundMasses = building.masses.filter((mass) => mass.baseY < 2)
      for (const mass of groundMasses) for (const point of northRoadZ) {
        const halfX = mass.width / 2 + 2.55
        const halfZ = mass.depth / 2 + 2.55
        expect(Math.abs(point.x - building.x - mass.offsetX) < halfX &&
          Math.abs(point.z - building.z - mass.offsetZ) < halfZ).toBe(false)
      }
    }
  })

  it('connects every annex building to the existing plaza through real crossings', () => {
    const { city } = createAnnex()
    const open = new Set<string>(DEV_ESCARPMENT_BLOCK_IDS)
    const pedestrians = derivePedestrianNetwork({ ...city,
      blocks: city.blocks.filter((block) => !open.has(block.id)),
      parcels: city.parcels.filter((parcel) => !open.has(parcel.blockId)),
      buildings: city.buildings.filter((building) => {
        const parcel = city.parcels.find((candidate) =>
          candidate.id === building.parcelId)!
        return !open.has(parcel.blockId)
      }),
    }, { curbPlacement: 'endpointVector' })
    const plaza = 'ped-place-block-3-3'
    expect(pedestrians.nodes.some((node) => node.id === plaza)).toBe(true)
    expect(pedestrians.edges.some((edge) =>
      edge.id === 'ped-cross-boundary-edge-x-7--1')).toBe(true)
    for (const building of city.buildings.filter((item) =>
      item.parcelId.startsWith('parcel-dev-north-'))) {
      expect(reachable(`ped-entrance-${building.id}`, plaza,
        pedestrians.edges), building.id).toBe(true)
    }
  })

  it('keeps annex entrances reachable at the correct raised height in the integrated world', () => {
    const world = generateDevWorld(HERO_SEED)
    const index = createNavigationIndexV2(world)
    const plaza = 'ped-place-block-3-3'
    expect(world.bounds.minZ).toBe(DEV_NORTH_ANNEX_MIN_Z_M * 1000)
    for (const building of world.baseCity!.buildings.filter((item) =>
      item.parcelId.startsWith('parcel-dev-north-'))) {
      const entranceId = `ped-entrance-${building.id}`
      const entrance = index.nodeById.get(entranceId)
      expect(entrance, entranceId).toBeDefined()
      expect(entrance!.position.y).toBeGreaterThan(8_000)
      expect(entrance!.position.z).toBeGreaterThan(world.bounds.minZ)
      expect(findRouteV2(index, entranceId, plaza).status,
        entranceId).toBe('ok')
    }
  })
})
