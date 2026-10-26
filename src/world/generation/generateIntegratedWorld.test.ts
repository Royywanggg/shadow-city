import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { createEnvironmentV5, createInitialStateV5 } from '../../simulation/engineV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../../simulation/v5Types'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'
import { generateIntegratedWorld } from './generateIntegratedWorld'

describe('original-city v0.6 integration', () => {
  it('preserves the original roads, plaza and all buildings outside one Galleria block', () => {
    const city = generateCity(HERO_SEED)
    const world = generateIntegratedWorld(HERO_SEED)
    expect(world.baseCity?.roads).toEqual(city.roads)
    expect(world.baseCity?.plaza).toEqual(city.plaza)
    expect(world.roadEdges.map((edge) => edge.id)).toEqual(city.roads.edges.map((edge) => edge.id))
    const oldMallParcelIds = new Set(city.parcels.filter((parcel) =>
      parcel.blockId === 'block-4-3').map((parcel) => parcel.id))
    expect(world.baseCity?.buildings.map((building) => building.id)).toEqual(city.buildings
      .filter((building) => !oldMallParcelIds.has(building.parcelId)).map((building) => building.id))
    expect(world.baseCity?.buildings).toHaveLength(city.buildings.length - 1)
    expect(world.config.seed).toBe(HERO_SEED)
    expect(world.config.extentMm).toBe(city.size * 1000)
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
