import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { createEnvironmentV5, createInitialStateV5 } from '../../simulation/engineV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../../simulation/v5Types'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { createWalkwayDeckGeometry, overpassDeckPath,
  overpassGuardPaths } from '../../scene/WalkwayStructures'
import { generateIntegratedWorld } from './generateIntegratedWorld'

describe('original-city v0.6 integration', () => {
  it('expands the original map while preserving its roads, plaza and buildings outside one Galleria block', () => {
    const city = generateCity(HERO_SEED)
    const world = generateIntegratedWorld(HERO_SEED)
    expect(world.baseCity?.roads.nodes.slice(0, city.roads.nodes.length)).toEqual(city.roads.nodes)
    expect(world.baseCity?.roads.edges.slice(0, city.roads.edges.length)).toEqual(city.roads.edges)
    expect(world.baseCity?.plaza).toEqual(city.plaza)
    expect(world.roadEdges.slice(0, city.roads.edges.length).map((edge) => edge.id))
      .toEqual(city.roads.edges.map((edge) => edge.id))
    const oldMallParcelIds = new Set(city.parcels.filter((parcel) =>
      parcel.blockId === 'block-4-3').map((parcel) => parcel.id))
    expect(world.baseCity?.buildings.slice(0, city.buildings.length - 1).map((building) => building.id)).toEqual(city.buildings
      .filter((building) => !oldMallParcelIds.has(building.parcelId)).map((building) => building.id))
    expect(world.baseCity!.buildings.length).toBeGreaterThan(city.buildings.length + 20)
    expect(world.config.seed).toBe(HERO_SEED)
    expect(world.config.extentMm).toBe(300_000)
    expect(world.baseCity?.size).toBe(300)
    expect(world.roadNodes.some((node) => node.id === 'node-8-8')).toBe(true)
    const neighbours = new Map(world.roadNodes.map((node) => [node.id, [] as string[]]))
    for (const edge of world.roadEdges) {
      neighbours.get(edge.from)!.push(edge.to)
      neighbours.get(edge.to)!.push(edge.from)
    }
    const visited = new Set(['node-3-3'])
    const pending = ['node-3-3']
    for (let index = 0; index < pending.length; index += 1) {
      for (const next of neighbours.get(pending[index])!) if (!visited.has(next)) {
        visited.add(next)
        pending.push(next)
      }
    }
    expect(visited.size).toBe(world.roadNodes.length)
  })

  it('connects both open-air stair flights to one level bridge and the Galleria floor', () => {
    const world = generateIntegratedWorld()
    const node = new Map(world.navNodes.map((item) => [item.id, item]))
    for (const id of ['bridge:deck', 'connector:west-stair',
      'connector:east-stair', 'connector:east-ramp']) {
      const edge = world.navEdges.find((item) => item.id === id)!
      expect(edge.path.length).toBeGreaterThan(10)
      expect(edge.path[0]).toEqual(node.get(edge.fromNodeId)?.position)
      expect(edge.path.at(-1)).toEqual(node.get(edge.toNodeId)?.position)
      expect(edge.path.every((point) => point.y >= 250 && point.y <= 5_500)).toBe(true)
    }
    const bridge = world.navEdges.find((edge) => edge.id === 'bridge:deck')!
    expect(new Set(bridge.path.map((point) => point.z)).size).toBe(1)
    expect(bridge.path[0].z).toBeLessThan(-6_000)
    expect(bridge.path.every((point) => point.y === 5_500)).toBe(true)
    for (const [side, endpoint] of [['west', bridge.path[0]],
      ['east', bridge.path.at(-1)!]] as const) {
      const landing = world.surfaces.find((surface) =>
        surface.id === `overpass-${side}-landing`)!
      const xs = landing.polygonXZ.map((point) => point.x)
      const zs = landing.polygonXZ.map((point) => point.z)
      expect(endpoint.x).toBeGreaterThanOrEqual(Math.min(...xs))
      expect(endpoint.x).toBeLessThanOrEqual(Math.max(...xs))
      expect(endpoint.z).toBeGreaterThanOrEqual(Math.min(...zs))
      expect(endpoint.z).toBeLessThanOrEqual(Math.max(...zs))
      const stair = world.navEdges.find((edge) => edge.id === `connector:${side}-stair`)!
      expect(stair.path[0].y).toBe(250)
      expect(stair.path.at(-1)!.y).toBe(5_500)
      expect(stair.path.every((point, index) => index === 0 ||
        point.y >= stair.path[index - 1].y)).toBe(true)
      expect(stair.path.at(-1)!.x).toBe(endpoint.x)
      expect(Math.abs(stair.path.at(-1)!.z - endpoint.z)).toBeLessThan(1_250)
      const footpad = world.boxes.find((box) => box.id === `overpass-${side}-footpad`)!
      expect(Math.abs(footpad.center.y + footpad.size.y / 2 - stair.path[0].y))
        .toBeLessThanOrEqual(20)
    }
    expect(world.boxes.some((box) => box.id.startsWith('pavilion-'))).toBe(false)
    const ramp = world.navEdges.find((edge) => edge.id === 'connector:east-ramp')!
    const galleria = world.surfaces.find((surface) => surface.id === 'galleria-l0')!
    const mallXs = galleria.polygonXZ.map((point) => point.x)
    const mallZs = galleria.polygonXZ.map((point) => point.z)
    expect(ramp.path.every((point) => point.x >= Math.min(...mallXs) &&
      point.x <= Math.max(...mallXs) && point.z >= Math.min(...mallZs) &&
      point.z <= Math.max(...mallZs))).toBe(true)
    const atriumWest = Math.min(...world.surfaces.find((surface) =>
      surface.id === 'galleria-l1')!.blockedPolygonsXZ[0].map((point) => point.x))
    expect(Math.max(...ramp.path.map((point) => point.x)) + 800).toBeLessThan(atriumWest)
    const deck = createWalkwayDeckGeometry(bridge.path, 2.5)
    const vertices = deck.getAttribute('position')
    for (const [index, endpoint] of [[0, bridge.path[0]],
      [bridge.path.length - 1, bridge.path.at(-1)!]] as const) {
      expect((vertices.getX(index * 4) + vertices.getX(index * 4 + 1)) / 2)
        .toBeCloseTo(endpoint.x / 1000, 3)
      expect((vertices.getZ(index * 4) + vertices.getZ(index * 4 + 1)) / 2)
        .toBeCloseTo(endpoint.z / 1000, 3)
      expect(vertices.getY(index * 4)).toBeCloseTo(endpoint.y / 1000, 3)
    }
    const upperFloors = world.boxes.filter((box) => box.id.startsWith('galleria-upper-'))
    const galleriaEntry = node.get('galleria:l1:bridge-entry')!.position
    const approach = world.navEdges.find((edge) => edge.id === 'bridge:galleria-approach')!
    const portal = world.navEdges.find((edge) => edge.id === 'portal:galleria-upper')!
    expect(approach.path[0]).toEqual(bridge.path.at(-1))
    expect(portal.path[0]).toEqual(approach.path.at(-1))
    expect(portal.path.at(-1)).toEqual(galleriaEntry)
    expect([...approach.path, ...portal.path].every((point) =>
      point.y === 5_500 && point.z === bridge.path[0].z)).toBe(true)
    expect(world.navNodes.find((item) => item.id === 'overpass:east:foot')!.position.x + 1_250)
      .toBeLessThanOrEqual(Math.min(...mallXs))
    expect(upperFloors.some((box) => Math.abs(galleriaEntry.x - box.center.x) <=
      box.size.x / 2 && Math.abs(galleriaEntry.z - box.center.z) <= box.size.z / 2 &&
      Math.abs(box.center.y + box.size.y / 2 - galleriaEntry.y) < 100)).toBe(true)
    deck.dispose()
    const index = createNavigationIndexV2(world)
    const crossing = findRouteV2(index, 'overpass:west:foot', 'galleria:l1:bridge-entry')
    expect(crossing.status).toBe('ok')
    if (crossing.status === 'ok') expect(crossing.steps.some((step) =>
      step.edgeId === 'bridge:deck')).toBe(true)
    const eastDescent = findRouteV2(index, 'bridge:east', 'overpass:east:foot')
    expect(eastDescent.status).toBe('ok')
    if (eastDescent.status === 'ok') expect(eastDescent.steps.some((step) =>
      step.edgeId === 'connector:east-stair')).toBe(true)
  })

  it('keeps 200 homes distinct and gives every retained facade a legal portal', () => {
    const world = generateIntegratedWorld()
    const environment = createEnvironmentV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 200 })
    const citizens = createInitialStateV5(environment).citizens
    expect(new Set(citizens.map((citizen) => citizen.currentNodeId)).size).toBe(200)
    expect(citizens.every((citizen) => world.surfaces.find((surface) =>
      surface.id === citizen.surfaceId)?.indoor)).toBe(true)
    for (const building of world.baseCity!.buildings) {
      expect(world.navEdges.some((edge) => edge.id === `portal:${building.id}`)).toBe(true)
    }
  })

  it('keeps the original ground crossing and an accessible upper Galleria route', () => {
    const world = generateIntegratedWorld()
    const index = createNavigationIndexV2(world)
    expect(findRouteV2(index, 'plaza:east-mid', 'mall:west-mid').status).toBe('ok')
    const upper = world.places.find((place) => place.id === 'central-galleria')!.slotNodeIds
      .find((id) => id.startsWith('galleria:l1:'))!
    expect(findRouteV2(index, 'bridge:west', upper).status).toBe('ok')
    const closed = findRouteV2(index, 'plaza:east-mid', upper, undefined,
      new Map([['bridge-entry', 'entryClosed']]))
    expect(closed.status).toBe('ok')
    if (closed.status === 'ok') expect(closed.steps.some((step) =>
      step.edgeId === 'bridge:deck')).toBe(false)
  })

  it('reproduces the same integrated static world from the same original seed', () => {
    expect(generateIntegratedWorld()).toEqual(generateIntegratedWorld())
  })

  it('ends the blue deck at the Galleria facade with guards on both exposed sides', () => {
    const world = generateIntegratedWorld()
    const bridge = world.overpasses![0]
    const edges = new Map(world.navEdges.map((item) => [item.id, item]))
    const deck = overpassDeckPath(bridge, edges)
    const guards = overpassGuardPaths(bridge, edges)
    const mall = world.surfaces.find((surface) => surface.id === 'galleria-l1')!
    const facadeX = Math.min(...mall.polygonXZ.map((point) => point.x))
    expect(bridge.terminalPoint!.x).toBe(facadeX)
    expect(deck.at(-1)!.x).toBe(facadeX)
    expect(deck.every((point) => point.x <= facadeX)).toBe(true)
    expect(guards.full.at(-1)!.x).toBe(facadeX)
    expect(guards.stairSide.at(-1)!.at(-1)!.x).toBe(facadeX)
    expect(guards.stairSide).toHaveLength(2)
    const blue = createWalkwayDeckGeometry(deck, bridge.widthMm / 1000)
    blue.computeBoundingBox()
    expect(blue.boundingBox!.max.x).toBeCloseTo(facadeX / 1000, 3)
    blue.dispose()
    expect(world.boxes.filter((box) => box.id.startsWith('overpass-terminal-jamb-')))
      .toHaveLength(2)
    expect(world.boxes.some((box) => box.id === 'overpass-terminal-lintel')).toBe(true)
    const portalZ = bridge.terminalPoint!.z
    const openingHalfWidth = bridge.widthMm / 2
    for (const pane of world.boxes.filter((box) => box.id.startsWith('galleria-west-glass-'))) {
      const paneMinZ = pane.center.z - pane.size.z / 2
      const paneMaxZ = pane.center.z + pane.size.z / 2
      expect(paneMaxZ <= portalZ - openingHalfWidth ||
        paneMinZ >= portalZ + openingHalfWidth).toBe(true)
    }
    const threshold = world.boxes.find((box) => box.id === 'galleria-overpass-threshold')!
    expect(threshold.center.x).toBe(facadeX)
    expect(Math.abs(threshold.center.y - bridge.terminalPoint!.y)).toBeLessThan(30)
  })
})
