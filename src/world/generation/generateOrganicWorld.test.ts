import { describe, expect, it } from 'vitest'
import { HERO_SEED } from '../../city/generation/generateCity'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../../simulation/v5Types'
import { createEnvironmentV5, createInitialStateV5, worldFingerprintV5 } from '../../simulation/engineV5'
import { replayV5 } from '../../simulation/replayV5'
import { SimulationSessionV5 } from '../../simulation/sessionV5'
import { findRouteV2, createNavigationIndexV2 } from '../navigation/routeV2'
import { renderPlacedBuildings } from './placeExistingBuildings'
import { generateOrganicWorld } from './generateOrganicWorld'
import { generateIntegratedWorld } from './generateIntegratedWorld'
import { getTerrainGradient, getTerrainHeight } from '../terrain/terrainV1'
import { ORGANIC_ROAD_PLANNING } from './planOrganicRoad'
import { organicStreetFeatures } from './organicStreetFeatures'

describe('organic world v1', () => {
  const crossing = (a: { x: number; z: number }, b: { x: number; z: number },
    c: { x: number; z: number }, d: { x: number; z: number }) => {
    const orient = (p: typeof a, q: typeof a, r: typeof a) =>
      (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
    const first = orient(a, b, c); const second = orient(a, b, d)
    const third = orient(c, d, a); const fourth = orient(c, d, b)
    return first * second < 0 && third * fourth < 0
  }

  it('repeats terrain, placement and roads without mutating legacy building assets', () => {
    const first = generateOrganicWorld()
    const again = generateOrganicWorld()
    expect(again.terrain?.heightsMm).toEqual(first.terrain?.heightsMm)
    expect(again.buildingPlacements).toEqual(first.buildingPlacements)
    expect(again.roadEdges).toEqual(first.roadEdges)
    expect(first.config.generatorVersion).toBe('organic-city-v1')
    expect(first.baseCity?.buildings).toEqual(generateIntegratedWorld(HERO_SEED).baseCity?.buildings)
    expect(first.buildingPlacements?.length).toBeGreaterThan(40)
    const placed = renderPlacedBuildings(first.baseCity!, first.buildingPlacements!)
    const source = new Map(first.baseCity!.buildings.map((building) => [building.id, building]))
    const pinned = generateIntegratedWorld(HERO_SEED)
    for (const building of placed.buildings) {
      const asset = source.get(building.id)!
      expect(building.masses).toBe(asset.masses)
      expect(building.windows).toBe(asset.windows)
      expect(building.kind).toBe(asset.kind)
      expect(building.height).toBe(asset.height)
      const placeId = `building:${asset.id}`
      const originalPlace = pinned.places.find((item) =>
        item.id === placeId)!
      const relocatedPlace = first.places.find((item) => item.id === placeId)!
      expect(relocatedPlace.kind).toBe(originalPlace.kind)
      expect(relocatedPlace.activityTags).toEqual(originalPlace.activityTags)
      expect(relocatedPlace.openingHours).toEqual(originalPlace.openingHours)
      expect(relocatedPlace.surfaceIds).toEqual(originalPlace.surfaceIds)
      expect(relocatedPlace.slotNodeIds).toEqual(originalPlace.slotNodeIds)
    }
    expect(new Set(placed.buildings.map((building) => building.id)).size)
      .toBe(placed.buildings.length)
    expect(new Set(first.buildingPlacements?.map((item) => item.siteId)).size)
      .toBe(first.buildingPlacements?.length)
    const furniture = organicStreetFeatures(first)
    expect(furniture).toEqual(organicStreetFeatures(again))
    expect(furniture.length).toBeGreaterThan(10)
    for (const feature of furniture) {
      expect(Math.abs(feature.surfaceY! - getTerrainHeight(first.terrain!,
        feature.x * 1000, feature.z * 1000) / 1000 - 0.15)).toBeLessThan(0.001)
    }
    const preservedPlaces = pinned.places.filter((place) => place.id === 'central-galleria' ||
      place.surfaceIds.some((id) => id.startsWith('galleria')))
    for (const place of preservedPlaces) {
      expect(first.places.find((item) => item.id === place.id)).toEqual(place)
    }
    expect(first.overpasses).toEqual(pinned.overpasses)
    expect(worldFingerprintV5(first, DEFAULT_SIMULATION_CONFIG_V5)).toBe(
      worldFingerprintV5(again, DEFAULT_SIMULATION_CONFIG_V5))
    expect(worldFingerprintV5({ ...first, buildingPlacements: first.buildingPlacements!.map(
      (item, index) => index === 0 ? { ...item, x: item.x + 1 } : item) },
    DEFAULT_SIMULATION_CONFIG_V5)).not.toBe(
      worldFingerprintV5(first, DEFAULT_SIMULATION_CONFIG_V5))
    expect(worldFingerprintV5(generateOrganicWorld('another-seed'), DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(first, DEFAULT_SIMULATION_CONFIG_V5))
  })

  it('connects curved road geometry and keeps buildings outside road surfaces', () => {
    const world = generateOrganicWorld()
    const adjacent = new Map(world.roadNodes.map((node) => [node.id, new Set<string>()]))
    for (const road of world.roadEdges) {
      adjacent.get(road.from)!.add(road.to)
      adjacent.get(road.to)!.add(road.from)
    }
    const reached = new Set<string>([world.roadNodes[0].id])
    for (const node of reached) for (const next of adjacent.get(node)!) reached.add(next)
    expect(reached.size).toBe(world.roadNodes.length)
    expect(world.roadEdges.some((road) => road.path && road.path.length > 10 &&
      road.path.some((point, index) => index > 0 && index < road.path!.length - 1 &&
        Math.abs((point.x - road.path![0].x) *
          (road.path!.at(-1)!.z - road.path![0].z) -
          (point.z - road.path![0].z) *
          (road.path!.at(-1)!.x - road.path![0].x)) > 300_000_000))).toBe(true)
    for (let left = 0; left < world.roadEdges.length; left += 1) {
      const a = world.roadEdges[left]
      for (let right = left + 1; right < world.roadEdges.length; right += 1) {
        const b = world.roadEdges[right]
        if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue
        for (let i = 1; i < a.path!.length; i += 1) for (let j = 1; j < b.path!.length; j += 1) {
          expect(crossing(a.path![i - 1], a.path![i], b.path![j - 1], b.path![j]),
            `${a.id} crosses ${b.id} without a junction`).toBe(false)
        }
      }
    }
    const assets = new Map(world.baseCity!.buildings.map((item) => [item.id, item]))
    const groundGrades = world.roadEdges.filter((road) => road.structure !== 'viaduct')
      .flatMap((road) => road.path!.slice(1).map((point, index) => {
        const before = road.path![index]
        return Math.abs(point.y - before.y) /
          Math.hypot(point.x - before.x, point.z - before.z)
      }))
    const steepestRoad = world.roadEdges.filter((road) => road.structure !== 'viaduct')
      .map((road) => ({ id: road.id, grade: Math.max(...road.path!.slice(1).map((point, index) => {
        const before = road.path![index]
        return Math.abs(point.y - before.y) /
          Math.hypot(point.x - before.x, point.z - before.z)
      })) })).sort((a, b) => b.grade - a.grade)[0]
    expect(Math.max(...groundGrades), steepestRoad.id)
      .toBeLessThanOrEqual(ORGANIC_ROAD_PLANNING.maxGrade)
    for (const building of world.buildingPlacements!) {
      const asset = assets.get(building.buildingId)!
      for (const road of world.roadEdges) for (const point of road.path!) {
        expect(Math.abs(point.x - building.x) < asset.width * 500 + road.widthMm / 2 + 200 &&
          Math.abs(point.z - building.z) < asset.depth * 500 + road.widthMm / 2 + 200,
        `${road.id} overlaps ${building.buildingId}`).toBe(false)
      }
    }
    for (const road of world.roadEdges) {
      const walks = world.navEdges.filter((edge) => edge.id === `walk:${road.id}` ||
        edge.id.startsWith(`walk:${road.id}:`))
      expect(walks.length, `${road.id} has no navigation`).toBeGreaterThan(0)
      expect(walks.flatMap((edge) => edge.path).length).toBeGreaterThan(road.path!.length - 2)
    }
  })

  it('provides a graded viaduct, legal routes and 200 unique citizens', () => {
    const world = generateOrganicWorld()
    const terrain = world.terrain!
    expect(getTerrainHeight(terrain, -90_000, -70_000)).toBeGreaterThan(
      getTerrainHeight(terrain, 65_000, 65_000) + 2_000)
    expect(Math.hypot(...Object.values(getTerrainGradient(terrain, -80_000, -60_000))))
      .toBeLessThan(0.2)
    const bridge = world.roadEdges.find((road) => road.structure === 'viaduct')!
    expect(bridge).toBeDefined()
    expect(world.surfaces.some((surface) => surface.id === 'organic:viaduct')).toBe(true)
    expect(bridge.path!.some((point) => point.y -
      getTerrainHeight(terrain, point.x, point.z) > 2_000)).toBe(true)
    const nodes = new Map(world.navNodes.map((node) => [node.id, node]))
    for (const edge of world.navEdges) {
      const from = nodes.get(edge.fromNodeId)!
      const to = nodes.get(edge.toNodeId)!
      if ((from.surfaceId === 'organic:viaduct') !==
        (to.surfaceId === 'organic:viaduct')) {
        expect(edge.connectorId, `${edge.id} must use an explicit ramp`).toBeTruthy()
      }
    }
    const navigation = createNavigationIndexV2(world)
    const costs = { speedMmPerSecond: 1_250, stairMultiplier: 1.2,
      rampMultiplier: 1.1, escalatorMultiplier: 0.8, bridgeMultiplier: 0.9,
      allowStairs: true, allowRamps: true }
    const route = findRouteV2(navigation, 'road:east', 'road:southeast', costs, new Map())
    expect(route.status).toBe('ok')
    if (route.status === 'ok') {
      expect(route.steps.some((step) => step.edgeId === 'walk:organic:road:04:deck')).toBe(true)
    }
    const viaductRampGrade = Math.max(...world.navEdges.filter((edge) =>
      edge.id.startsWith('walk:organic:road:04:') && edge.kind === 'ramp')
      .flatMap((edge) => edge.path.slice(1).map((point, index) => {
        const before = edge.path[index]
        return Math.abs(point.y - before.y) /
          Math.hypot(point.x - before.x, point.z - before.z)
      })))
    expect(viaductRampGrade).toBeLessThanOrEqual(ORGANIC_ROAD_PLANNING.maxGrade)
    const home = world.places.find((place) => place.kind === 'home')!
    const destination = world.places.find((place) => place.kind === 'mall')!
    expect(findRouteV2(navigation, home.slotNodeIds[0], destination.slotNodeIds[0],
      costs, new Map()).status).toBe('ok')
    const environment = createEnvironmentV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 200, placeInteraction: { version: 'place-v1' } })
    expect(new Set(createInitialStateV5(environment).citizens.map((item) => item.id)).size)
      .toBe(200)
  })

  it('replays organic movement with the original Galleria and no world mutation', () => {
    const world = generateOrganicWorld()
    const session = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 20, placeInteraction: { version: 'place-v1' } })
    const originalWorld = worldFingerprintV5(world, session.getConfig())
    for (let tick = 0; tick < 100; tick += 1) session.advanceOneTick()
    const live = session.getSnapshot().state
    expect(live.citizens.some((citizen) => citizen.route.some((step) =>
      step.edgeId.startsWith('walk:organic:road:')))).toBe(true)
    expect(session.inspectTick(50).tick).toBe(50)
    session.returnLive()
    expect(replayV5(world, session.exportReplay())).toEqual(live)
    expect(worldFingerprintV5(world, session.getConfig())).toBe(originalWorld)
  })
})
