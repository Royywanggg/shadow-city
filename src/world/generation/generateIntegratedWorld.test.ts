import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { createEnvironmentV5, createInitialStateV5 } from '../../simulation/engineV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../../simulation/v5Types'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { createWalkwayDeckGeometry } from '../../scene/WalkwayStructures'
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

  it('aligns the bridge with a plaza-edge pavilion and the Galleria upper floor', () => {
    const world = generateIntegratedWorld()
    const node = new Map(world.navNodes.map((item) => [item.id, item]))
    for (const id of ['bridge:deck', 'connector:west-stair', 'connector:east-ramp']) {
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
    const pavilion = world.surfaces.find((surface) => surface.id === 'pavilion-l1')!
    const pavilionXs = pavilion.polygonXZ.map((point) => point.x)
    const pavilionZs = pavilion.polygonXZ.map((point) => point.z)
    expect(bridge.path[0].x).toBeGreaterThanOrEqual(Math.min(...pavilionXs))
    expect(bridge.path[0].x).toBeLessThanOrEqual(Math.max(...pavilionXs))
    expect(bridge.path[0].z).toBeGreaterThanOrEqual(Math.min(...pavilionZs))
    expect(bridge.path[0].z).toBeLessThanOrEqual(Math.max(...pavilionZs))
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
    const deck = createWalkwayDeckGeometry(bridge.path, 2.9)
    const vertices = deck.getAttribute('position')
    for (const [index, endpoint] of [[0, bridge.path[0]],
      [bridge.path.length - 1, bridge.path.at(-1)!]] as const) {
      expect((vertices.getX(index * 4) + vertices.getX(index * 4 + 1)) / 2)
        .toBeCloseTo(endpoint.x / 1000, 3)
      expect((vertices.getZ(index * 4) + vertices.getZ(index * 4 + 1)) / 2)
        .toBeCloseTo(endpoint.z / 1000, 3)
    }
    const upperFloors = world.boxes.filter((box) => box.id.startsWith('galleria-upper-'))
    expect(upperFloors.some((box) => Math.abs(bridge.path.at(-1)!.x - box.center.x) <=
      box.size.x / 2 && Math.abs(bridge.path.at(-1)!.z - box.center.z) <= box.size.z / 2 &&
      Math.abs(box.center.y + box.size.y / 2 - bridge.path.at(-1)!.y) < 100)).toBe(true)
    deck.dispose()
    const index = createNavigationIndexV2(world)
    const crossing = findRouteV2(index, 'pavilion:l0:entry', 'galleria:l1:bridge-entry')
    expect(crossing.status).toBe('ok')
    if (crossing.status === 'ok') expect(crossing.steps.some((step) =>
      step.edgeId === 'bridge:deck')).toBe(true)
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
})
