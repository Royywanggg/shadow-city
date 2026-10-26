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

  it('aligns curved bridge, stair and ramp paths at their real navigation landings', () => {
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
    expect(bridge.path.some((point) => point.z > 500)).toBe(true)
    expect(bridge.path.every((point) => point.y === 5_500)).toBe(true)
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
