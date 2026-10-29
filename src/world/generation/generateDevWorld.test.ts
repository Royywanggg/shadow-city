import { describe, expect, it } from 'vitest'
import { HERO_SEED } from '../../city/generation/generateCity'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5,
  worldFingerprintV5 } from '../../simulation/engineV5'
import { hasClearSurfaceSegment } from '../../simulation/encounter/spatial'
import { DEFAULT_SIMULATION_CONFIG_V5, type CitizenStateV5 } from '../../simulation/v5Types'
import { moveCitizenOneTick } from '../../simulation/movementV5'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { blockPadElevationMm, DEV_ESCARPMENT_BLOCK_IDS, DEV_OPEN_CHANNEL_BLOCK_IDS,
  heightAtMm, roadBendMm } from '../terrain/devTerrain'
import { RIDGE_ROAD_ID } from './devRidgeRoad'
import { generateDevWorld } from './generateDevWorld'
import { generateIntegratedWorld } from './generateIntegratedWorld'

describe('isolated Twilight terrain world', () => {
  it('keeps the original city core and main generator unchanged', () => {
    const mainBefore = generateIntegratedWorld(HERO_SEED)
    const dev = generateDevWorld(HERO_SEED)
    const mainAfter = generateIntegratedWorld(HERO_SEED)
    const devSource = generateIntegratedWorld(HERO_SEED, { openChannelBlockIds:
      [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS] })
    expect(mainAfter).toEqual(mainBefore)
    expect(dev.baseCity?.roads).not.toEqual(mainBefore.baseCity?.roads)
    expect(dev.baseCity?.plaza).toEqual(mainBefore.baseCity?.plaza)
    const originalBuildings = new Map(devSource.baseCity!.buildings.map((building) =>
      [building.id, building]))
    expect(dev.baseCity?.buildings.map((building) => building.id)).toEqual(
      devSource.baseCity?.buildings.map((building) => building.id))
    for (const building of dev.baseCity!.buildings) {
      const original = originalBuildings.get(building.id)!
      expect(building.masses).toEqual(original.masses)
      expect(building.windows).toEqual(original.windows)
      expect(building.kind).toBe(original.kind)
      expect(building.entrance.x - building.x).toBeCloseTo(
        original.entrance.x - original.x, 6)
      expect(building.entrance.z - building.z).toBeCloseTo(
        original.entrance.z - original.z, 6)
    }
    expect(dev.baseCity?.buildings.length).toBeLessThan(mainBefore.baseCity!.buildings.length)
    expect(dev.config.generatorVersion).toBe('twilight-dev-v4')
    expect(mainAfter.config.generatorVersion).toBe('heritage-extension-v6')
    expect(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(mainAfter, DEFAULT_SIMULATION_CONFIG_V5))
    const changedPad = { ...dev, terrain: { ...dev.terrain!,
      buildingPads: [{ ...dev.terrain!.buildingPads[0],
        elevationMm: dev.terrain!.buildingPads[0].elevationMm + 1 },
      ...dev.terrain!.buildingPads.slice(1)] } }
    expect(worldFingerprintV5(changedPad, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
  })

  it('routes a real three-way road and both sidewalks around the escarpment', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const city = world.baseCity!
    const junction = city.roads.nodes.find((node) => node.id === 'dev-road:ridge-junction')!
    const touching = city.roads.edges.filter((edge) =>
      edge.from === junction.id || edge.to === junction.id)
    expect(touching).toHaveLength(3)
    expect(city.roads.edges.some((edge) => edge.id === 'edge-z-5--1')).toBe(false)
    expect(world.roadEdges.map((edge) => edge.id)).toEqual(city.roads.edges.map((edge) => edge.id))
    expect(world.roadNodes.map((node) => node.id)).toEqual(city.roads.nodes.map((node) => node.id))
    expect(terrain.roadProfiles.map((profile) => profile.edgeId)).toEqual(
      city.roads.edges.map((edge) => edge.id))
    const road = terrain.roadProfiles.find((profile) => profile.edgeId === RIDGE_ROAD_ID)!
    const north = city.roads.nodes.find((node) => node.id === 'node-5--1')!
    expect(road.path[0].x).toBe(Math.round(junction.x * 1000))
    expect(road.path.at(-1)!.x).toBe(Math.round(north.x * 1000))
    expect(Math.max(...road.path.map((point) => point.x)) - Math.round(north.x * 1000))
      .toBeGreaterThan(2_000)
    const roadGrade = Math.max(...road.path.slice(1).map((point, index) => {
      const previous = road.path[index]
      return Math.abs(point.y - previous.y) /
        Math.hypot(point.x - previous.x, point.z - previous.z)
    }))
    expect(roadGrade).toBeLessThan(0.1)
    const index = createNavigationIndexV2(world)
    const sidewalks = world.navEdges.filter((edge) =>
      edge.id === 'dev-ped:ridge-east' || edge.id === 'dev-ped:ridge-west')
    expect(sidewalks).toHaveLength(2)
    for (const sidewalk of sidewalks) {
      expect(findRouteV2(index, sidewalk.fromNodeId, sidewalk.toNodeId).status).toBe('ok')
      for (let step = 1; step < sidewalk.path.length; step += 1) {
        expect(hasClearSurfaceSegment(world, 'ground', sidewalk.path[step - 1],
          sidewalk.path[step])).toBe(true)
      }
      const maxGrade = Math.max(...sidewalk.path.slice(1).map((point, step) => {
        const previous = sidewalk.path[step]
        return Math.abs(point.y - previous.y) /
          Math.hypot(point.x - previous.x, point.z - previous.z)
      }))
      expect(maxGrade).toBeLessThan(0.12)
    }
    const northConnections = world.navEdges.filter((edge) =>
      edge.id === 'dev-ped:ridge-northwest-link' ||
      edge.id === 'dev-ped:ridge-north-crossing')
    expect(northConnections).toHaveLength(2)
    for (const connection of northConnections) {
      for (let step = 1; step < connection.path.length; step += 1) {
        expect(hasClearSurfaceSegment(world, 'ground', connection.path[step - 1],
          connection.path[step])).toBe(true)
      }
    }
    const route = findRouteV2(index, 'ped-entrance-building-block-4-0-0-0',
      'ped-block-3--1-3-0')
    expect(route.status).toBe('ok')
    if (route.status === 'ok') {
      expect(route.steps.map((step) => step.edgeId)).toContain('dev-ped:ridge-west')
      expect(route.steps.map((step) => step.edgeId))
        .toContain('dev-ped:ridge-northwest-link')
      const environment = createEnvironmentV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
        populationSize: 24 })
      const initial = createInitialStateV5(environment)
      const start = index.nodeById.get('ped-entrance-building-block-4-0-0-0')!
      const end = index.nodeById.get('ped-block-3--1-3-0')!
      let citizen: CitizenStateV5 = { ...initial.citizens[0], position: start.position,
        surfaceId: start.surfaceId, placeId: null, currentNodeId: start.id,
        destinationNodeId: end.id, activity: 'travelling' as const,
        route: route.steps, routeIndex: 0, distanceOnEdgeMm: 0 }
      const touched = new Set<string>()
      const elevations: number[] = [citizen.position.y]
      for (let tick = 0; tick < 80 && citizen.routeIndex < citizen.route.length; tick += 1) {
        const movement = moveCitizenOneTick(citizen, environment.profiles[0], index,
          new Map(), 6)
        citizen = movement.citizen
        for (const point of movement.trace) {
          if (point.edgeId) touched.add(point.edgeId)
          elevations.push(point.position.y)
        }
        expect(movement.blocked).toBeNull()
      }
      expect(citizen.position).toEqual(end.position)
      expect(citizen.routeIndex).toBe(route.steps.length)
      expect(touched.has('dev-ped:ridge-west')).toBe(true)
      expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(1_000)
    }
  })

  it('adapts the same diversion to other seeded road spacing', () => {
    for (const seed of ['twilight-alt-01', 'twilight-alt-02']) {
      const world = generateDevWorld(seed)
      const road = world.terrain!.roadProfiles.find((profile) =>
        profile.edgeId === RIDGE_ROAD_ID)!
      const north = world.roadNodes.find((node) => node.id === 'node-5--1')!
      expect(road.path.at(-1)!.x).toBe(north.position.x)
      for (const sidewalk of world.navEdges.filter((edge) =>
        edge.id.startsWith('dev-ped:ridge-'))) {
        for (let step = 1; step < sidewalk.path.length; step += 1) {
          expect(hasClearSurfaceSegment(world, 'ground', sidewalk.path[step - 1],
            sidewalk.path[step])).toBe(true)
        }
      }
    }
  })

  it('serializes a reproducible high terrace, protected core and lower channel', () => {
    const first = generateDevWorld(HERO_SEED)
    const second = generateDevWorld(HERO_SEED)
    expect(second).toEqual(first)
    const terrain = first.terrain!
    expect(terrain.grid.heightsMm).toHaveLength(terrain.grid.width * terrain.grid.depth)
    expect(heightAtMm(terrain, 0, -130_000)).toBeGreaterThan(6_000)
    expect(heightAtMm(terrain, 0, 0)).toBe(0)
    expect(heightAtMm(terrain, -87_000, 75_000)).toBeLessThan(-6_000)
    expect(blockPadElevationMm(terrain, 'block-3-3')).toBe(0)
    expect(blockPadElevationMm(terrain, 'block-4-3')).toBe(0)
    expect(terrain.nonWalkableEscarpment.patches).toHaveLength(3)
    for (const patch of terrain.nonWalkableEscarpment.patches) {
      const x = Math.round((patch.polygonXZ[0].x + patch.polygonXZ[1].x) / 2)
      const z = Math.round((patch.polygonXZ[0].z + patch.polygonXZ[2].z) / 2)
      expect(heightAtMm(terrain, x, z)).toBeGreaterThan(8_000)
    }
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
      profile.edgeId).sort()).toEqual(['edge-x-0-5', 'edge-x-0-6'])
    for (const profile of terrain.roadProfiles) {
      const road = edges.get(profile.edgeId)!
      expect(profile.path[0].x).toBe(nodes.get(road.from)!.x)
      expect(profile.path[0].z).toBe(nodes.get(road.from)!.z)
      expect(profile.path.at(-1)!.x).toBe(nodes.get(road.to)!.x)
      expect(profile.path.at(-1)!.z).toBe(nodes.get(road.to)!.z)
    }
    for (const profile of terrain.roadProfiles.filter((item) => item.bridge)) {
      const { startIndex, endIndex } = profile.bridgeSpan!
      expect(startIndex).toBe(0)
      expect(endIndex).toBe(profile.path.length - 1)
      const center = profile.path[Math.floor((startIndex + endIndex) / 2)]
      expect(center.y - heightAtMm(terrain, center.x, center.z)).toBeGreaterThan(4_000)
      const first = profile.path[startIndex]
      const last = profile.path[endIndex]
      expect(first.y - heightAtMm(terrain, first.x, first.z)).toBe(70)
      expect(last.y - heightAtMm(terrain, last.x, last.z)).toBe(70)
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
    const openNodes = world.navNodes.filter((node) => terrain.openChannelBlockIds.some((blockId) =>
      node.id.startsWith(`ped-${blockId}-`)))
    expect(openNodes.map((node) => node.id)).toEqual([])
    for (const building of world.baseCity!.buildings) {
      const pad = terrain.buildingPads.find((item) => item.buildingId === building.id)!
      for (const mass of building.masses.filter((item) => item.baseY < 2)) {
        for (const xRatio of [-0.5, 0, 0.5]) for (const zRatio of [-0.5, 0, 0.5]) {
          const x = Math.round((building.x + mass.offsetX + mass.width * xRatio) * 1000)
          const z = Math.round((building.z + mass.offsetZ + mass.depth * zRatio) * 1000)
          expect(pad.elevationMm).toBeGreaterThan(heightAtMm(terrain, x, z))
        }
      }
      const portal = world.navEdges.find((edge) => edge.id === `portal:${building.id}`)!
      expect(portal.kind).toBe(pad.entryKind === 'stair' ? 'stair' : 'portal')
    }
    const north = world.navNodes.find((node) => node.surfaceId === 'ground' &&
      node.position.z < -110_000)!
    expect(hasClearSurfaceSegment(world, 'ground', north.position, north.position)).toBe(true)
  })

  it('aligns stair portals with serialized treads and leaves a clear sidewalk landing', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const nodeById = new Map(world.navNodes.map((node) => [node.id, node]))
    const edgeById = new Map(world.navEdges.map((edge) => [edge.id, edge]))
    const index = createNavigationIndexV2(world)
    const stairs = terrain.buildingPads.filter((pad) => pad.entryStair)
    expect(stairs.length).toBeGreaterThan(20)
    for (const pad of stairs) {
      const building = world.baseCity!.buildings.find((item) => item.id === pad.buildingId)!
      const stair = pad.entryStair!
      const foot = nodeById.get(`ped-entrance-${building.id}`)!
      const access = edgeById.get(`ped-access-${building.id}`)!
      const lane = nodeById.get(access.toNodeId)!
      const portal = edgeById.get(`portal:${building.id}`)!
      const thresholdZ = Math.round(building.entrance.z * 1000)
      expect(stair.stepDepthMm).toBeGreaterThanOrEqual(220)
      expect(stair.stepDepthMm).toBeLessThanOrEqual(330)
      expect(stair.treads.length).toBeGreaterThanOrEqual(2)
      expect(stair.treads.length).toBeLessThanOrEqual(9)
      expect(stair.foot.z).toBeGreaterThan(thresholdZ)
      expect(stair.foot.z + 150).toBeLessThanOrEqual(lane.position.z)
      expect(foot.position).toEqual({ ...stair.foot,
        y: 250 + heightAtMm(terrain, stair.foot.x, stair.foot.z) })
      expect(hasClearSurfaceSegment(world, 'ground', foot.position, foot.position)).toBe(true)
      expect(access.path[0]).toEqual(foot.position)
      expect(access.path.at(-1)).toEqual(lane.position)
      expect(portal.kind).toBe('stair')
      expect(portal.surfaceId).toBeNull()
      expect(portal.path[0]).toEqual(foot.position)
      expect(portal.path.slice(1, 1 + stair.treads.length)).toEqual(
        stair.treads.map((tread) => ({ ...tread.center, y: 250 + tread.topMm })))
      expect(portal.path.at(-2)).toEqual({ x: Math.round(building.entrance.x * 1000),
        y: 250 + pad.elevationMm, z: thresholdZ })
      expect(portal.path.at(-1)).toEqual(nodeById.get(portal.toNodeId)!.position)
      expect(stair.treads.at(-1)!.topMm).toBe(pad.elevationMm)
      expect(stair.treads.every((tread, step) => step === 0 ||
        tread.topMm > stair.treads[step - 1].topMm &&
        tread.topMm - stair.treads[step - 1].topMm <= 175)).toBe(true)
      expect(findRouteV2(index, lane.id, portal.toNodeId).status).toBe('ok')
    }
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
        for (const point of sidewalk.path) {
          expect(hasClearSurfaceSegment(world, surfaceId, point, point)).toBe(true)
        }
      }
    }
    expect(world.navEdges.some((edge) => terrain.openChannelBlockIds.some((blockId) =>
      edge.id.startsWith(`ped-${blockId}-`) && edge.surfaceId === 'ground'))).toBe(false)
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
      const mid = profile.path[Math.floor(profile.path.length / 2)]
      const dx = end.x - start.x
      const dz = end.z - start.z
      const deviation = Math.abs((mid.x - start.x) * dz -
        (mid.z - start.z) * dx) / Math.hypot(dx, dz)
      expect(deviation).toBeGreaterThan(500)
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

  it('carries the channel to the west edge beneath two continuous road culverts', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const outlet = terrain.channel.centerline.at(-1)!
    expect(outlet.x).toBe(world.bounds.minX)
    expect(outlet.z).toBeLessThan(100_000)
    expect(heightAtMm(terrain, outlet.x, outlet.z)).toBeLessThan(-6_000)
    expect(terrain.roadProfiles.filter((profile) => profile.bridge)).toHaveLength(2)
    const culverts = terrain.roadProfiles.filter((profile) => profile.culvertSpan)
    expect(culverts.map((profile) => profile.edgeId).sort())
      .toEqual(['edge-z--1-6', 'edge-z-0-6'])
    const index = createNavigationIndexV2(world)
    for (const culvert of culverts) {
      expect(culvert.bridge).toBe(false)
      const { startIndex, endIndex } = culvert.culvertSpan!
      const center = culvert.path[Math.floor((startIndex + endIndex) / 2)]
      expect(center.y - heightAtMm(terrain, center.x, center.z)).toBeGreaterThan(250)
      for (const point of [culvert.path[startIndex], culvert.path[endIndex]]) {
        expect(Math.abs(point.y - 70 - heightAtMm(terrain, point.x, point.z)))
          .toBeLessThan(250)
      }
      const surfaceId = `terrain-culvert:${culvert.edgeId}`
      expect(index.surfaceById.has(surfaceId)).toBe(true)
      expect(hasClearSurfaceSegment(world, surfaceId, center, center)).toBe(true)
    }
  })

  it('keeps road and pedestrian grades within their declared limits', () => {
    const world = generateDevWorld(HERO_SEED)
    const grade = (a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number }) =>
      Math.abs(b.y - a.y) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z))
    const roadOffenders = world.terrain!.roadProfiles
      .flatMap((profile) => profile.path.slice(1).map((point, index) => ({
        id: profile.edgeId, grade: grade(profile.path[index], point),
      })).filter((item) => item.grade > 0.1))
      .sort((a, b) => b.grade - a.grade)
    const walkOffenders = world.navEdges.filter((edge) => edge.surfaceId === 'ground' ||
      edge.surfaceId?.startsWith('terrain-bridge:'))
      .flatMap((edge) => edge.path.slice(1).map((point, index) => ({
        id: edge.id, grade: grade(edge.path[index], point),
      })).filter((item) => item.grade > 0.12))
      .sort((a, b) => b.grade - a.grade)
    expect(roadOffenders.slice(0, 8)).toEqual([])
    expect(walkOffenders.slice(0, 8)).toEqual([])
  })

  it('keeps ground navigation clear of the channel and north escarpment', () => {
    const world = generateDevWorld(HERO_SEED)
    const affected = world.navEdges.filter((edge) => edge.surfaceId === 'ground' &&
      edge.path.some((point) => point.x < -65_000 && point.z > 30_000 ||
        point.z < -75_000 && point.x > 25_000))
    const blocked = affected.flatMap((edge) => edge.path.slice(1).flatMap((point, index) =>
      hasClearSurfaceSegment(world, 'ground', edge.path[index], point)
        ? [] : [edge.id]))
    expect(blocked).toEqual([])
  })
})
