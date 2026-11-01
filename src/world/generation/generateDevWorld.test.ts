import { describe, expect, it } from 'vitest'
import { HERO_SEED } from '../../city/generation/generateCity'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5,
  worldFingerprintV5 } from '../../simulation/engineV5'
import { hasClearSurfaceSegment } from '../../simulation/encounter/spatial'
import { DEFAULT_SIMULATION_CONFIG_V5, type CitizenStateV5 } from '../../simulation/v5Types'
import { moveCitizenOneTick } from '../../simulation/movementV5'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { blockPadElevationMm, channelXAt,
  DEV_ESCARPMENT_BLOCK_IDS, DEV_OPEN_CHANNEL_BLOCK_IDS,
  heightAtMm, roadBendMm } from '../terrain/devTerrain'
import { FOREGROUND_RIVER_CLOSED_ROAD_ID } from './devForegroundValley'
import { HIGHLAND_CLOSED_ROAD_IDS } from './devHighlandPlan'
import { DEV_UPPER_CONTOUR_ROAD_EDGE_ID, DEV_UPPER_ROAD_EDGE_ID } from
  './devUpperRoadPlan'
import { DEV_TERRACE_BUILDING_PREFIX, DEV_TERRACE_SITES } from './devTerraceNeighborhood'
import { generateDevWorld } from './generateDevWorld'
import { generateIntegratedWorld } from './generateIntegratedWorld'

describe('isolated Twilight terrain world', () => {
  it('keeps the original city core and main generator unchanged', () => {
    const compactDevBuildings = new Set([
      'building-block-3-4-0-0', 'building-block-3-5-1-0',
      'building-block-1-7-0-0', 'building-block-1-4-0-0',
      'building-block--1-6-1-0',
    ])
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
    const originalDevBuildings = dev.baseCity!.buildings.filter((building) =>
      !building.id.startsWith(DEV_TERRACE_BUILDING_PREFIX))
    expect(originalDevBuildings.map((building) => building.id).sort()).toEqual(
      devSource.baseCity!.buildings.filter((building) =>
        building.id !== 'building-block-1-7-1-0')
        .map((building) => building.id).sort())
    expect(DEV_TERRACE_SITES).toHaveLength(11)
    expect(dev.baseCity!.buildings.filter((building) =>
      building.id.startsWith(DEV_TERRACE_BUILDING_PREFIX))).toHaveLength(11)
    for (const building of originalDevBuildings) {
      const original = originalBuildings.get(building.id)!
      if (compactDevBuildings.has(building.id)) {
        expect(building.width).toBeLessThan(original.width)
        expect(dev.places.find((place) => place.id === `building:${building.id}`)?.kind)
          .toBe(devSource.places.find((place) => place.id === `building:${building.id}`)?.kind)
      } else {
        expect(building.masses).toEqual(original.masses)
        expect(building.windows).toEqual(original.windows)
      }
      if (building.id === 'building-block-1-7-0-0') {
        expect(building.kind).toBe('residential')
      } else {
        expect(building.kind).toBe(original.kind)
      }
      if (!compactDevBuildings.has(building.id)) {
        expect(building.entrance.x - building.x).toBeCloseTo(
          original.entrance.x - original.x, 6)
        expect(building.entrance.z - building.z).toBeCloseTo(
          original.entrance.z - original.z, 6)
      }
    }
    expect(dev.baseCity?.buildings.length).toBeLessThan(mainBefore.baseCity!.buildings.length)
    expect(dev.config.generatorVersion).toBe('twilight-dev-v23')
    expect(mainAfter.config.generatorVersion).toBe('heritage-extension-v6')
    expect(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(mainAfter, DEFAULT_SIMULATION_CONFIG_V5))
    const changedPad = { ...dev, terrain: { ...dev.terrain!,
      buildingPads: [{ ...dev.terrain!.buildingPads[0],
        elevationMm: dev.terrain!.buildingPads[0].elevationMm + 1 },
      ...dev.terrain!.buildingPads.slice(1)] } }
    expect(worldFingerprintV5(changedPad, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
    const changedValley = { ...dev, terrain: { ...dev.terrain!,
      channel: { ...dev.terrain!.channel,
        widthProfile: dev.terrain!.channel.widthProfile.map((sample, index) =>
          index === 2 ? { ...sample, halfWidthMm: sample.halfWidthMm + 1 } : sample) } } }
    expect(worldFingerprintV5(changedValley, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
  })

  it('keeps both street and pedestrian routes around one unbroken rear terrace', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const city = world.baseCity!
    const patch = terrain.nonWalkableEscarpment.patches[0]
    expect(patch.frontLine.at(-1)!.x - patch.frontLine[0].x)
      .toBeGreaterThan(220_000)
    expect(terrain.terraceAccess!.trail.at(-1)!.x -
      terrain.terraceAccess!.trail[0].x).toBe(216_000)
    for (const id of HIGHLAND_CLOSED_ROAD_IDS) {
      expect(city.roads.edges.some((edge) => edge.id === id)).toBe(false)
      expect(terrain.roadProfiles.some((profile) => profile.edgeId === id)).toBe(false)
      expect(city.pedestrian.edges.some((edge) => edge.sourceRoadEdgeId === id)).toBe(false)
    }
    expect(city.pedestrian.edges.some((edge) =>
      edge.id.startsWith('ped-cross-east-block-4--1') ||
      edge.id.startsWith('ped-cross-east-block-5--1'))).toBe(false)
    expect(world.roadEdges.map((edge) => edge.id)).toEqual(city.roads.edges.map((edge) => edge.id))
    expect(world.roadNodes.map((node) => node.id)).toEqual(city.roads.nodes.map((node) => node.id))
    expect(terrain.roadProfiles.map((profile) => profile.edgeId)).toEqual(
      city.roads.edges.map((edge) => edge.id))
    const roadNeighbours = new Map<string, string[]>()
    for (const edge of city.roads.edges) {
      roadNeighbours.set(edge.from, [...roadNeighbours.get(edge.from) ?? [], edge.to])
      roadNeighbours.set(edge.to, [...roadNeighbours.get(edge.to) ?? [], edge.from])
    }
    const visited = new Set(['node-5-0'])
    const queue = ['node-5-0']
    while (queue.length) {
      for (const next of roadNeighbours.get(queue.shift()!) ?? []) {
        if (!visited.has(next)) { visited.add(next); queue.push(next) }
      }
    }
    expect(visited.has('node-5--1')).toBe(true)
    expect(visited.has('node-6--1')).toBe(true)
    expect(visited.size).toBe(city.roads.nodes.length)
    const index = createNavigationIndexV2(world)
    const route = findRouteV2(index, 'ped-entrance-building-block-4-0-0-0',
      'ped-block--1-0-2-0')
    expect(route.status).toBe('ok')
    if (route.status === 'ok') {
      for (const step of route.steps) {
        const edge = index.edgeById.get(step.edgeId)!
        if (edge.surfaceId !== 'ground') continue
        for (let segment = 1; segment < edge.path.length; segment += 1) {
          expect(hasClearSurfaceSegment(world, 'ground', edge.path[segment - 1],
            edge.path[segment])).toBe(true)
        }
      }
      const environment = createEnvironmentV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
        populationSize: 24 })
      const initial = createInitialStateV5(environment)
      const start = index.nodeById.get('ped-entrance-building-block-4-0-0-0')!
      const end = index.nodeById.get('ped-block--1-0-2-0')!
      let citizen: CitizenStateV5 = { ...initial.citizens[0], position: start.position,
        surfaceId: start.surfaceId, placeId: null, currentNodeId: start.id,
        destinationNodeId: end.id, activity: 'travelling' as const,
        route: route.steps, routeIndex: 0, distanceOnEdgeMm: 0 }
      const elevations: number[] = [citizen.position.y]
      for (let tick = 0; tick < 120 && citizen.routeIndex < citizen.route.length; tick += 1) {
        const movement = moveCitizenOneTick(citizen, environment.profiles[0], index,
          new Map(), 6)
        citizen = movement.citizen
        for (const point of movement.trace) elevations.push(point.position.y)
        expect(movement.blocked).toBeNull()
      }
      expect(citizen.position).toEqual(end.position)
      expect(citizen.routeIndex).toBe(route.steps.length)
      expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(1_000)
    }
  })

  it('preserves north-side access for alternate seeds', () => {
    for (const seed of ['twilight-alt-01', 'twilight-alt-02']) {
      const world = generateDevWorld(seed)
      const index = createNavigationIndexV2(world)
      expect(findRouteV2(index, 'ped-entrance-building-block-4-0-0-0',
        'ped-block--1-0-2-0').status).toBe('ok')
      expect(findRouteV2(index, 'ped-entrance-building-block-4-0-0-0',
        `interior:${DEV_TERRACE_BUILDING_PREFIX}0:slot:0`).status).toBe('ok')
      expect(world.terrain!.nonWalkableEscarpment.patches).toHaveLength(1)
    }
  })

  it('connects every upper-shelf home to real terrain paths and interior places', () => {
    const world = generateDevWorld(HERO_SEED)
    const index = createNavigationIndexV2(world)
    const homes = world.baseCity!.buildings.filter((building) =>
      building.id.startsWith(DEV_TERRACE_BUILDING_PREFIX))
    expect(homes).toHaveLength(DEV_TERRACE_SITES.length)
    expect(world.terrain!.terraceAccess!.walkways.length).toBeGreaterThan(DEV_TERRACE_SITES.length)
    for (const walkway of world.terrain!.terraceAccess!.walkways) {
      expect(index.edgeById.get(walkway.edgeId)?.path).toEqual(walkway.path)
    }
    const from = 'ped-entrance-building-block-4-0-0-0'
    for (const building of homes) {
      const entry = `ped-entrance-${building.id}`
      const place = world.places.find((item) => item.id === `building:${building.id}`)
      expect(place?.accessNodeIds).toContain(`interior:${building.id}:entry`)
      expect(place?.surfaceIds).toContain(`interior:${building.id}`)
      expect(index.nodeById.get(entry)?.surfaceId).toBe('terrain:terrace-top')
      const route = findRouteV2(index, from, place!.slotNodeIds[0])
      expect(route.status).toBe('ok')
      if (route.status !== 'ok') continue
      expect(route.steps.some((step) => step.edgeId === 'terrain:terrace-stair-edge' ||
        step.edgeId === 'terrain:upper-road-pedestrian-ramp')).toBe(true)
      for (const step of route.steps) {
        const edge = index.edgeById.get(step.edgeId)!
        if (edge.surfaceId !== 'terrain:terrace-top') continue
        for (let part = 1; part < edge.path.length; part += 1) {
          expect(hasClearSurfaceSegment(world, edge.surfaceId,
            edge.path[part - 1], edge.path[part]),
          `${building.id}: ${edge.id} segment ${part}`).toBe(true)
        }
      }
    }
    expect(worldFingerprintV5(generateDevWorld(HERO_SEED),
      DEFAULT_SIMULATION_CONFIG_V5)).toBe(worldFingerprintV5(world,
      DEFAULT_SIMULATION_CONFIG_V5))
  })

  it('keeps upper homes grounded and the stair clear beneath the graded road', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    for (const building of world.baseCity!.buildings.filter((item) =>
      item.id.startsWith(DEV_TERRACE_BUILDING_PREFIX))) {
      const pad = terrain.buildingPads.find((item) =>
        item.buildingId === building.id)!
      const footprints = building.masses.filter((mass) => mass.baseY < 2)
      const heights = footprints.flatMap((mass) => [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => heightAtMm(terrain,
          Math.round((building.x + mass.offsetX + sx * mass.width / 2) * 1_000),
          Math.round((building.z + mass.offsetZ + sz * mass.depth / 2) * 1_000)))))
      expect(pad.elevationMm - Math.min(...heights), building.id)
        .toBeLessThan(1_200)
    }
    const upper = terrain.roadProfiles.find((profile) =>
      profile.edgeId === DEV_UPPER_ROAD_EDGE_ID)!
    const upperWidthMm = world.roadEdges.find((edge) =>
      edge.id === DEV_UPPER_ROAD_EDGE_ID)!.widthMm
    for (const endpoint of [upper.path[0], upper.path.at(-1)!]) {
      expect(endpoint.y - heightAtMm(terrain, endpoint.x, endpoint.z))
        .toBeLessThanOrEqual(1_000)
    }
    const flankMm = upperWidthMm / 2 + 1_800
    for (let index = 0; index < upper.path.length; index += 1) {
      const point = upper.path[index]
      const before = upper.path[Math.max(0, index - 1)]
      const after = upper.path[Math.min(upper.path.length - 1, index + 1)]
      const dx = after.x - before.x
      const dz = after.z - before.z
      const length = Math.hypot(dx, dz)
      for (const side of [-1, 0, 1]) {
        const x = Math.round(point.x - dz / length * flankMm * side)
        const z = Math.round(point.z + dx / length * flankMm * side)
        expect(point.y - heightAtMm(terrain, x, z),
          `Upper road ${index} side ${side} is buried`).toBeGreaterThanOrEqual(70)
      }
    }
    for (const point of upper.path) for (const building of world.baseCity!.buildings) {
      for (const mass of building.masses.filter((item) => item.baseY < 2)) {
        const dx = Math.max(0, Math.abs(point.x -
          Math.round((building.x + mass.offsetX) * 1_000)) - mass.width * 500)
        const dz = Math.max(0, Math.abs(point.z -
          Math.round((building.z + mass.offsetZ) * 1_000)) - mass.depth * 500)
        expect(Math.hypot(dx, dz), building.id)
          .toBeGreaterThan(upperWidthMm / 2 + 1_950)
      }
    }
    const crossing = terrain.terraceAccess!.stair.flatMap((stair) => {
      const nearest = [...upper.path].sort((a, b) =>
        Math.hypot(a.x - stair.x, a.z - stair.z) -
        Math.hypot(b.x - stair.x, b.z - stair.z))[0]
      return Math.hypot(nearest.x - stair.x, nearest.z - stair.z) < 4_875
        ? [nearest.y - stair.y] : []
    })
    expect(crossing.length).toBeGreaterThan(0)
    expect(Math.min(...crossing)).toBeGreaterThan(2_600)
  })

  it('keeps the contour street clear of homes and its sidewalk connected', () => {
    for (const seed of [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']) {
      const world = generateDevWorld(seed)
      const city = world.baseCity!
      const road = city.roads.edges.find((edge) =>
        edge.id === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)!
      const profile = world.terrain!.roadProfiles.find((item) =>
        item.edgeId === road.id)!
      expect(profile.bridge).toBe(false)
      const houses = city.buildings.filter((building) =>
        building.id.startsWith(DEV_TERRACE_BUILDING_PREFIX))
      expect(houses).toHaveLength(DEV_TERRACE_SITES.length)
      for (const building of houses) for (const point of profile.path) {
        const dx = Math.max(0, Math.abs(point.x / 1000 - building.x) -
          building.width / 2)
        const dz = Math.max(0, Math.abs(point.z / 1000 - building.z) -
          building.depth / 2)
        expect(Math.hypot(dx, dz), building.id).toBeGreaterThan(
          road.width / 2 + 0.2)
      }
      const walk = world.navEdges.filter((edge) =>
        edge.id.startsWith('terrain:upper-contour-walk-edge:') ||
        edge.id === 'terrain:upper-contour-transfer' ||
        edge.id === 'terrain:upper-contour-stair-landing')
      expect(walk).toHaveLength(55)
      for (const edge of walk) for (let i = 1; i < edge.path.length; i += 1) {
        expect(hasClearSurfaceSegment(world, edge.surfaceId!,
          edge.path[i - 1], edge.path[i]), edge.id).toBe(true)
      }
      const route = findRouteV2(createNavigationIndexV2(world),
        'terrain:terrace-trail:27', 'terrain:upper-contour-walk:53')
      expect(route.status).toBe('ok')
    }
  })

  it('connects the street to distinct walkable terrace slots without a teleport', () => {
    const world = generateDevWorld(HERO_SEED)
    const access = world.terrain!.terraceAccess!
    const index = createNavigationIndexV2(world)
    const park = world.places.find((place) => place.id === 'public:dev-north-terrace')!
    expect(park.slotNodeIds).toHaveLength(6)
    expect(new Set(park.slotNodeIds).size).toBe(6)
    expect(world.connectors.find((connector) =>
      connector.id === 'terrain:terrace-stair')?.edgeIds)
      .toEqual(['terrain:terrace-stair-edge'])
    expect(index.nodeById.get(access.crossingNodeId)?.position).toEqual(
      access.crossingSouth)
    expect(Math.max(...access.stair.slice(1).map((point, index) =>
      point.y - access.stair[index].y))).toBeLessThanOrEqual(200)
    const route = findRouteV2(index, 'ped-entrance-building-block-4-0-0-0',
      park.slotNodeIds.at(-1)!)
    expect(route.status).toBe('ok')
    if (route.status !== 'ok') return
    expect(route.steps.map((step) => step.edgeId)).toContain(
      'terrain:terrace-stair-edge')
    for (const step of route.steps) {
      const edge = index.edgeById.get(step.edgeId)!
      if (edge.surfaceId !== 'ground' &&
        edge.surfaceId !== 'terrain:terrace-top' &&
        edge.connectorId !== 'terrain:terrace-stair') continue
      const surfaceId = edge.connectorId ? `connector:${edge.connectorId}` :
        edge.surfaceId!
      for (let i = 1; i < edge.path.length; i += 1) {
        expect(hasClearSurfaceSegment(world, surfaceId,
          edge.path[i - 1], edge.path[i])).toBe(true)
      }
    }
    const environment = createEnvironmentV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 24 })
    const initial = createInitialStateV5(environment)
    const start = index.nodeById.get('ped-entrance-building-block-4-0-0-0')!
    const end = index.nodeById.get(park.slotNodeIds.at(-1)!)!
    let citizen: CitizenStateV5 = { ...initial.citizens[0],
      position: start.position, surfaceId: start.surfaceId, placeId: null,
      currentNodeId: start.id, destinationNodeId: end.id,
      activity: 'travelling', route: route.steps, routeIndex: 0,
      distanceOnEdgeMm: 0 }
    const elevations: number[] = []
    for (let tick = 0; tick < 120 && citizen.routeIndex < citizen.route.length;
      tick += 1) {
      const movement = moveCitizenOneTick(citizen, environment.profiles[0], index,
        new Map(), 6)
      expect(movement.blocked).toBeNull()
      elevations.push(...movement.trace.map((point) => point.position.y))
      citizen = movement.citizen
    }
    expect(citizen.position).toEqual(end.position)
    expect(citizen.surfaceId).toBe('terrain:terrace-top')
    expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(8_000)
  })

  it('keeps the rear frontage road and its sidewalk parcels on one curve', () => {
    const world = generateDevWorld(HERO_SEED)
    const city = world.baseCity!
    const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
    const profiles = new Map(world.terrain!.roadProfiles.map((profile) =>
      [profile.edgeId, profile]))
    const west = nodes.get('node-1-0')!
    const east = nodes.get('node-7-0')!
    expect(nodes.get('node-3-0')!.z).toBeLessThan(west.z - 2)
    expect(nodes.get('node-4-0')!.z).toBeLessThan(west.z - 4)
    expect(nodes.get('node-5-0')!.z).toBeLessThan(west.z - 2.8)
    expect(east.z).toBe(west.z)
    for (const column of [1, 2, 3, 4, 5, 6]) {
      const id = `edge-x-${column}-0`
      const road = city.roads.edges.find((edge) => edge.id === id)!
      const path = road.centerlineXZ!
      const profile = profiles.get(id)!
      const block = city.blocks.find((item) => item.id === `block-${column}-0`)!
      expect(path.length).toBeGreaterThan(10)
      expect(path[0]).toEqual({ x: nodes.get(road.from)!.x,
        z: nodes.get(road.from)!.z })
      expect(path.at(-1)).toEqual({ x: nodes.get(road.to)!.x,
        z: nodes.get(road.to)!.z })
      expect(profile.path).toHaveLength(path.length)
      profile.path.forEach((point, index) => {
        expect(Math.abs(point.x - path[index].x * 1000)).toBeLessThanOrEqual(1)
        expect(Math.abs(point.z - path[index].z * 1000)).toBeLessThanOrEqual(1)
      })
      const northBoundary = block.footprintXZ!.slice(0, -2)
      expect(northBoundary.length).toBeGreaterThan(5)
      for (const point of northBoundary) {
        const right = path.findIndex((sample) => sample.x >= point.x)
        expect(right).toBeGreaterThan(0)
        const a = path[right - 1]
        const b = path[right]
        const roadZ = a.z + (b.z - a.z) * (point.x - a.x) / (b.x - a.x)
        expect(point.z - roadZ).toBeCloseTo(road.width / 2 + 1.25, 5)
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
    expect(heightAtMm(terrain,
      channelXAt(terrain.channel.centerline, 75_000), 75_000)).toBeLessThan(-5_500)
    expect(blockPadElevationMm(terrain, 'block-3-3')).toBe(0)
    expect(blockPadElevationMm(terrain, 'block-4-3')).toBe(0)
    expect(terrain.nonWalkableEscarpment.patches).toHaveLength(1)
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
    expect(terrain.roadProfiles.filter((profile) => profile.bridge &&
      profile.edgeId !== DEV_UPPER_ROAD_EDGE_ID).map((profile) =>
      profile.edgeId).sort()).toEqual(['edge-x-0-5', 'edge-x-0-6', 'edge-x-0-7'])
    for (const profile of terrain.roadProfiles) {
      const road = edges.get(profile.edgeId)!
      expect(profile.path[0].x).toBe(nodes.get(road.from)!.x)
      expect(profile.path[0].z).toBe(nodes.get(road.from)!.z)
      expect(profile.path.at(-1)!.x).toBe(nodes.get(road.to)!.x)
      expect(profile.path.at(-1)!.z).toBe(nodes.get(road.to)!.z)
    }
    for (const profile of terrain.roadProfiles.filter((item) => item.bridge &&
      item.edgeId !== DEV_UPPER_ROAD_EDGE_ID)) {
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
      expect(hasClearSurfaceSegment(world, foot.surfaceId,
        foot.position, foot.position), building.id).toBe(true)
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
    for (const road of terrain.roadProfiles.filter((profile) => profile.bridge &&
      profile.edgeId !== DEV_UPPER_ROAD_EDGE_ID)) {
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
  })

  it('carries the channel through a compact inhabited east bank to the south edge', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const outlet = terrain.channel.centerline.at(-1)!
    expect(outlet.x).toBeGreaterThan(world.bounds.minX)
    expect(outlet.z).toBe(world.bounds.maxZ)
    expect(heightAtMm(terrain, outlet.x, outlet.z)).toBeLessThan(-5_500)
    const bank = world.baseCity!.blocks.find((block) => block.id === 'block-1-7')!
    expect(bank.footprintXZ?.length).toBeGreaterThan(10)
    const bankHomes = world.baseCity!.buildings.filter((building) =>
      building.parcelId.startsWith('block-1-7-'))
    expect(bankHomes).toHaveLength(1)
    expect(bankHomes[0].kind).toBe('residential')
    for (const mass of bankHomes[0].masses.filter((item) => item.baseY < 2)) {
      for (const xSide of [-1, 1]) for (const zSide of [-1, 1]) {
        const x = Math.round((bankHomes[0].x + mass.offsetX +
          xSide * mass.width / 2) * 1000)
        const z = Math.round((bankHomes[0].z + mass.offsetZ +
          zSide * mass.depth / 2) * 1000)
        expect(x - channelXAt(terrain.channel.centerline, z)).toBeGreaterThan(9_000)
      }
    }
    expect(world.baseCity!.roads.edges.some((edge) =>
      edge.id === FOREGROUND_RIVER_CLOSED_ROAD_ID)).toBe(false)
    expect(world.roadEdges.some((edge) =>
      edge.id === FOREGROUND_RIVER_CLOSED_ROAD_ID)).toBe(false)
    const route = findRouteV2(createNavigationIndexV2(world),
      'ped-entrance-building-block-1-7-0-0',
      'ped-entrance-building-block--1-7-0-0')
    expect(route.status).toBe('ok')
    expect(terrain.roadProfiles.filter((profile) => profile.bridge &&
      profile.edgeId !== DEV_UPPER_ROAD_EDGE_ID)).toHaveLength(3)
    const culverts = terrain.roadProfiles.filter((profile) => profile.culvertSpan)
    expect(culverts.map((profile) => profile.edgeId).sort())
      .toEqual(['edge-x-1-8'])
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
        from: profile.path[index], to: point,
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
