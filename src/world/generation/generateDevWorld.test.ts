import { describe, expect, it } from 'vitest'
import { HERO_SEED } from '../../city/generation/generateCity'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5,
  worldFingerprintV5 } from '../../simulation/engineV5'
import { hasClearSurfaceSegment } from '../../simulation/encounter/spatial'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../../simulation/v5Types'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { blockPadElevationMm, heightAtMm, roadBendMm } from '../terrain/devTerrain'
import { generateDevWorld } from './generateDevWorld'
import { generateIntegratedWorld } from './generateIntegratedWorld'

describe('isolated Twilight terrain world', () => {
  it('keeps the original city core and main generator unchanged', () => {
    const mainBefore = generateIntegratedWorld(HERO_SEED)
    const dev = generateDevWorld(HERO_SEED)
    const mainAfter = generateIntegratedWorld(HERO_SEED)
    expect(mainAfter).toEqual(mainBefore)
    expect(dev.baseCity?.roads).toEqual(mainBefore.baseCity?.roads)
    expect(dev.baseCity?.plaza).toEqual(mainBefore.baseCity?.plaza)
    expect(dev.roadNodes).toEqual(mainBefore.roadNodes)
    expect(dev.roadEdges).toEqual(mainBefore.roadEdges)
    expect(dev.baseCity?.buildings.every((building) =>
      mainBefore.baseCity?.buildings.some((original) => original.id === building.id))).toBe(true)
    expect(dev.baseCity?.buildings.length).toBeLessThan(mainBefore.baseCity!.buildings.length)
    expect(dev.config.generatorVersion).toBe('twilight-dev-v1')
    expect(mainAfter.config.generatorVersion).toBe('heritage-extension-v6')
    expect(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(mainAfter, DEFAULT_SIMULATION_CONFIG_V5))
  })

  it('serializes a reproducible high terrace, protected core and lower channel', () => {
    const first = generateDevWorld(HERO_SEED)
    const second = generateDevWorld(HERO_SEED)
    expect(second).toEqual(first)
    const terrain = first.terrain!
    expect(terrain.grid.heightsMm).toHaveLength(terrain.grid.width * terrain.grid.depth)
    expect(heightAtMm(terrain, 0, -130_000)).toBeGreaterThan(8_000)
    expect(heightAtMm(terrain, 0, 0)).toBe(0)
    expect(heightAtMm(terrain, -119_000, 75_000)).toBeLessThan(-4_000)
    expect(blockPadElevationMm(terrain, 'block-3-3')).toBe(0)
    expect(blockPadElevationMm(terrain, 'block-4-3')).toBe(0)
    for (const blockId of terrain.openChannelBlockIds) {
      expect(first.baseCity!.buildings.some((building) =>
        first.baseCity!.parcels.some((parcel) => parcel.id === building.parcelId &&
          parcel.blockId === blockId))).toBe(false)
    }
  })

  it('keeps road bridge decks continuous with their approaches over real voids', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const nodes = new Map(world.roadNodes.map((node) => [node.id, node.position]))
    const edges = new Map(world.roadEdges.map((edge) => [edge.id, edge]))
    expect(terrain.roadProfiles.filter((profile) => profile.bridge).map((profile) =>
      profile.edgeId).sort()).toEqual(['edge-x--1-5', 'edge-x--1-6'])
    for (const profile of terrain.roadProfiles) {
      const road = edges.get(profile.edgeId)!
      expect(profile.path[0].x).toBe(nodes.get(road.from)!.x)
      expect(profile.path[0].z).toBe(nodes.get(road.from)!.z)
      expect(profile.path.at(-1)!.x).toBe(nodes.get(road.to)!.x)
      expect(profile.path.at(-1)!.z).toBe(nodes.get(road.to)!.z)
    }
    for (const profile of terrain.roadProfiles.filter((item) => item.bridge)) {
      const { startIndex, endIndex } = profile.bridgeSpan!
      expect(startIndex).toBeGreaterThan(0)
      expect(endIndex).toBeLessThan(profile.path.length - 1)
      const center = profile.path[Math.floor((startIndex + endIndex) / 2)]
      expect(center.y - heightAtMm(terrain, center.x, center.z)).toBeGreaterThan(4_000)
      const first = profile.path[startIndex]
      const last = profile.path[endIndex]
      expect(first.y - heightAtMm(terrain, first.x, first.z)).toBeLessThan(250)
      expect(last.y - heightAtMm(terrain, last.x, last.z)).toBeLessThan(250)
    }
  })

  it('places all outdoor nodes and building interiors on their legal terrain heights', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const surfaces = new Map(world.surfaces.map((surface) => [surface.id, surface]))
    const nodes = new Map(world.navNodes.map((node) => [node.id, node]))
    expect(surfaces.get('ground')?.elevationMode).toBe('terrain')
    for (const node of world.navNodes) {
      if (node.surfaceId === 'ground') {
        expect(node.position.y).toBe(250 + heightAtMm(terrain,
          node.position.x, node.position.z))
      } else if (node.surfaceId.startsWith('interior:')) {
        expect(node.position.y).toBe(surfaces.get(node.surfaceId)!.elevationMm)
      }
    }
    for (const edge of world.navEdges) {
      expect(edge.path[0]).toEqual(nodes.get(edge.fromNodeId)!.position)
      expect(edge.path.at(-1)).toEqual(nodes.get(edge.toNodeId)!.position)
      expect(edge.lengthMm).toBeGreaterThan(0)
    }
    const north = world.navNodes.find((node) => node.surfaceId === 'ground' &&
      node.position.z < -110_000)!
    expect(hasClearSurfaceSegment(world, 'ground', north.position, north.position)).toBe(true)
  })

  it('routes pedestrians across both bridges at deck height and closes the unbridged channel rings', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const index = createNavigationIndexV2(world)
    for (const road of terrain.roadProfiles.filter((profile) => profile.bridge)) {
      const surfaceId = `terrain-bridge:${road.edgeId}`
      expect(index.surfaceById.has(surfaceId)).toBe(true)
      const sidewalks = world.navEdges.filter((edge) => edge.surfaceId === surfaceId)
      expect(sidewalks.length).toBeGreaterThanOrEqual(2)
      for (const sidewalk of sidewalks) {
        const route = findRouteV2(index, sidewalk.fromNodeId, sidewalk.toNodeId)
        expect(route.status).toBe('ok')
        const center = sidewalk.path[Math.floor(sidewalk.path.length / 2)]
        const roadPoint = road.path.reduce((nearest, point) =>
          Math.abs(point.x - center.x) < Math.abs(nearest.x - center.x) ? point : nearest)
        expect(Math.abs(center.y - roadPoint.y - 180)).toBeLessThan(100)
        expect(center.y - heightAtMm(terrain, center.x, center.z)).toBeGreaterThan(4_000)
      }
    }
    expect(world.navEdges.some((edge) => terrain.openChannelBlockIds.some((blockId) =>
      edge.id.startsWith(`ped-${blockId}-h-`) && edge.surfaceId === 'ground'))).toBe(false)
  })

  it('advances a fixed population on the derived three-dimensional network', () => {
    const world = generateDevWorld(HERO_SEED)
    const environment = createEnvironmentV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 24 })
    const index = createNavigationIndexV2(world)
    let state = createInitialStateV5(environment)
    for (let tick = 0; tick < 25; tick += 1) state = advanceStateV5(state, environment, index)
    expect(state.tick).toBe(25)
    expect(state.citizens).toHaveLength(24)
    expect(state.citizens.every((citizen) => Number.isSafeInteger(citizen.position.y) &&
      world.surfaces.some((surface) => surface.id === citizen.surfaceId))).toBe(true)
  })

  it('bends only selected outer roads within the available building clearance', () => {
    const world = generateDevWorld(HERO_SEED)
    const city = world.baseCity!
    const roadById = new Map(city.roads.edges.map((road) => [road.id, road]))
    const footprints = city.buildings.flatMap((building) => building.masses
      .filter((mass) => mass.baseY < 2).map((mass) => ({
        x: Math.round((building.x + mass.offsetX) * 1000),
        z: Math.round((building.z + mass.offsetZ) * 1000),
        halfWidth: Math.round(mass.width * 500),
        halfDepth: Math.round(mass.depth * 500),
      })))
    const bent = world.terrain!.roadProfiles.filter((profile) => roadBendMm(profile.edgeId) !== 0)
    expect(bent.length).toBeGreaterThanOrEqual(5)
    for (const profile of bent) {
      const road = roadById.get(profile.edgeId)!
      const start = profile.path[0]
      const end = profile.path.at(-1)!
      expect(start.z).toBe(end.z)
      expect(Math.abs(profile.path[Math.floor(profile.path.length / 2)].z - start.z))
        .toBeGreaterThan(700)
      for (const point of profile.path) {
        const clearance = Math.min(...footprints.map((footprint) => Math.hypot(
          Math.max(0, Math.abs(point.x - footprint.x) - footprint.halfWidth),
          Math.max(0, Math.abs(point.z - footprint.z) - footprint.halfDepth))))
        expect(clearance).toBeGreaterThan(Math.round((road.width / 2 + 0.3) * 1000))
      }
    }
    expect(world.navEdges.some((edge) => edge.surfaceId === 'ground' &&
      edge.path.length > 4 && Math.abs(edge.path[0].z - edge.path.at(-1)!.z) < 100 &&
      Math.abs(edge.path[Math.floor(edge.path.length / 2)].z - edge.path[0].z) > 300))
      .toBe(true)
  })

  it('carries the channel to the west edge through a covered, navigable culvert', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const outlet = terrain.channel.centerline.at(-1)!
    expect(outlet.x).toBe(world.bounds.minX)
    expect(outlet.z).toBeLessThan(100_000)
    expect(heightAtMm(terrain, outlet.x, outlet.z)).toBeLessThan(-6_000)
    expect(terrain.roadProfiles.filter((profile) => profile.bridge)).toHaveLength(2)
    const culvert = terrain.roadProfiles.find((profile) => profile.culvertSpan)!
    expect(culvert.edgeId).toBe('edge-z--1-6')
    expect(culvert.bridge).toBe(false)
    const { startIndex, endIndex } = culvert.culvertSpan!
    const center = culvert.path[Math.floor((startIndex + endIndex) / 2)]
    expect(center.y - heightAtMm(terrain, center.x, center.z)).toBeGreaterThan(5_000)
    for (const point of [culvert.path[startIndex], culvert.path[endIndex]]) {
      expect(Math.abs(point.y - 70 - heightAtMm(terrain, point.x, point.z)))
        .toBeLessThan(250)
    }
    const index = createNavigationIndexV2(world)
    const surfaceId = `terrain-culvert:${culvert.edgeId}`
    expect(index.surfaceById.has(surfaceId)).toBe(true)
    const sidewalk = world.navEdges.find((edge) => edge.surfaceId === surfaceId)!
    expect(sidewalk).toBeDefined()
    expect(findRouteV2(index, sidewalk.fromNodeId, sidewalk.toNodeId).status).toBe('ok')
    const sidewalkCenter = sidewalk.path[Math.floor(sidewalk.path.length / 2)]
    expect(sidewalkCenter.y - heightAtMm(terrain, sidewalkCenter.x,
      sidewalkCenter.z)).toBeGreaterThan(5_000)
    expect(hasClearSurfaceSegment(world, surfaceId, sidewalkCenter, sidewalkCenter)).toBe(true)
  })
})
