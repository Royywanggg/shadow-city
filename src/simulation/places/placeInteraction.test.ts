import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { createNavigationIndexV2, findRouteV2 } from '../../world/navigation/routeV2'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from '../encounter/config'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5 } from '../engineV5'
import { chooseHabitDestinationV1, habitPlaceIsOpenV1 } from '../habits/decision'
import { DEFAULT_HABIT_SCENARIO_V1, readHabitLog } from '../habits/types'
import { applyLifeOutcomesV1 } from '../life/state'
import { DEFAULT_LIFE_SCENARIO_V1 } from '../life/types'
import { observerViewV5 } from '../offending/opportunityV5'
import { replayV5 } from '../replayV5'
import { DEFAULT_SIMULATION_CONFIG_V5, type OffenceV5 } from '../v5Types'
import { derivePlaceRuntimeV1, validateFunctionalPlacesV1 } from './runtime'

const world = generateIntegratedWorld('shadow-city-hero-01')
const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 120,
  habit: DEFAULT_HABIT_SCENARIO_V1, encounter: DEFAULT_ENCOUNTER_SCENARIO_V1,
  placeInteraction: { version: 'place-v1' as const } }

describe('functional Central Galleria vertical slice', () => {
  it('has stable shop, café and floor identities with legal entrance and exit routes', () => {
    expect(() => validateFunctionalPlacesV1(world)).not.toThrow()
    const mall = world.places.find((item) => item.id === 'central-galleria')!
    const shops = world.places.filter((item) => item.buildingId === mall.id &&
      item.kind === 'retail')
    const cafes = world.places.filter((item) => item.buildingId === mall.id &&
      item.kind === 'cafe')
    expect(shops.map((item) => item.floorId)).toEqual(['L0', 'L1'])
    expect(cafes.map((item) => item.floorId)).toEqual(['L0', 'L1'])
    const modes = new Map(Object.entries(config.initialAccessModes))
    expect(habitPlaceIsOpenV1(shops[0], config, modes, 0)).toBe(true)
    expect(habitPlaceIsOpenV1(shops[0], { ...config, startHour: 23 },
      modes, 0)).toBe(false)
    const index = createNavigationIndexV2(world)
    const destination = shops.find((item) => item.floorId === 'L1')!.slotNodeIds[0]
    const route = findRouteV2(index, 'plaza:east-mid', destination,
      undefined, new Map([['bridge-entry', 'entryClosed']]))
    expect(route.status).toBe('ok')
    if (route.status !== 'ok') return
    expect(route.steps.some((step) => step.edgeId.startsWith('portal:shop:retail:l1')))
      .toBe(true)
    for (const step of route.steps) {
      const edge = index.edgeById.get(step.edgeId)!
      expect(edge.path.length).toBeGreaterThanOrEqual(2)
      expect(index.nodeById.get(step.fromNodeId)).toBeDefined()
      expect(index.nodeById.get(step.toNodeId)).toBeDefined()
    }
    expect(findRouteV2(index, destination, 'plaza:east-mid').status).toBe('ok')
    expect(findRouteV2(index, 'plaza:east-mid', destination, undefined,
      new Map([['mall-entry', 'entryClosed']])).status).toBe('unreachable')
  })

  it('rejects over-capacity slot assignments without merging citizens', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const mall = world.places.find((item) => item.id === 'central-galleria')!
    const nodes = new Map(world.navNodes.map((item) => [item.id, item]))
    const occupy = (count: number) => ({ ...initial,
      citizens: initial.citizens.map((citizen, index) => index < count ? {
        ...citizen, activity: 'atDestination' as const, activityKind: 'leisure' as const,
        placeId: mall.id, currentNodeId: mall.slotNodeIds[index % mall.slotNodeIds.length],
        reservedSlotNodeId: mall.slotNodeIds[index % mall.slotNodeIds.length],
        surfaceId: nodes.get(mall.slotNodeIds[index % mall.slotNodeIds.length])!.surfaceId,
        position: nodes.get(mall.slotNodeIds[index % mall.slotNodeIds.length])!.position,
      } : citizen) })
    expect(derivePlaceRuntimeV1(occupy(mall.capacity), environment).places.find((item) =>
      item.placeId === mall.id)?.availableSlots).toBe(0)
    expect(() => derivePlaceRuntimeV1(occupy(mall.capacity + 1), environment))
      .toThrow('Duplicate activity slot assignment')
  })

  it('keeps a physically occupied slot unavailable after its activity reservation ends', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const shop = world.places.find((item) => item.id === 'galleria-retail-l1')!
    const slotId = shop.slotNodeIds[0]
    const node = world.navNodes.find((item) => item.id === slotId)!
    const waiting = { ...initial.citizens[0], activity: 'waitingForSpace' as const,
      placeId: shop.id, surfaceId: node.surfaceId, currentNodeId: node.id,
      position: node.position, reservedSlotNodeId: null }
    const state = { ...initial, citizens: [waiting, ...initial.citizens.slice(1)] }
    const runtime = derivePlaceRuntimeV1(state, environment)
    const place = runtime.places.find((item) => item.placeId === shop.id)!
    expect(place.slotAssignments[slotId]).toBe(waiting.id)
    expect(place.occupantIds).toContain(waiting.id)
    expect(place.availableSlots).toBe(shop.capacity - 1)
    const duplicate = { ...initial.citizens[1], reservedSlotNodeId: slotId }
    expect(() => derivePlaceRuntimeV1({ ...state,
      citizens: [waiting, duplicate, ...initial.citizens.slice(2)] }, environment))
      .toThrow('Duplicate activity slot assignment')
  })

  it('rejects a full shop for newcomers while allowing its current slot holder to continue', () => {
    const environment = createEnvironmentV5(world, config)
    const initial = createInitialStateV5(environment)
    const index = createNavigationIndexV2(world)
    const shop = world.places.find((item) => item.id === 'galleria-retail-l1')!
    const full = new Set(shop.slotNodeIds)
    const modes = new Map(Object.entries(config.initialAccessModes))
    const decide = (citizen: typeof initial.citizens[number]) =>
      chooseHabitDestinationV1(citizen, environment.profiles[0],
        initial.habits!.citizens[0], environment.habitProfiles![0],
        world, config, config.habit!, index, full, modes, 0,
        new Map(), new Map(), initial)
    expect(decide(initial.citizens[0]).trace.candidates.find((item) =>
      item.placeId === shop.id && item.kind === 'shop')).toMatchObject({
      feasible: false, reason: 'capacity' })
    const node = index.nodeById.get(shop.slotNodeIds[0])!
    const inside = { ...initial.citizens[0], activity: 'waitingForSpace' as const,
      placeId: shop.id, surfaceId: node.surfaceId, currentNodeId: node.id,
      position: node.position, reservedSlotNodeId: null }
    expect(decide(inside).trace.candidates.find((item) =>
      item.placeId === shop.id && item.kind === 'shop')?.feasible).toBe(true)
  })

  it('interrupts a severe injury activity without assigning the occupied position again', () => {
    const severeLife = { ...DEFAULT_LIFE_SCENARIO_V1,
      injuryProbability: { minor: 1, serious: 1 },
      severityWeights: { ...DEFAULT_LIFE_SCENARIO_V1.severityWeights,
        serious: { minor: 0, serious: 0, critical: 1 } },
      fatalProbabilityCritical: 0 }
    const environment = createEnvironmentV5(world, { ...config,
      populationSize: 2, life: severeLife })
    const initial = createInitialStateV5(environment)
    const shop = world.places.find((item) => item.id === 'galleria-retail-l1')!
    const node = world.navNodes.find((item) => item.id === shop.slotNodeIds[0])!
    const victim = { ...initial.citizens[1], activity: 'atDestination' as const,
      activityKind: 'shop' as const, placeId: shop.id,
      surfaceId: node.surfaceId, currentNodeId: node.id,
      position: node.position, reservedSlotNodeId: node.id }
    const target = { kind: 'citizen' as const, id: victim.id }
    const offence: OffenceV5 = { id: 'fixture:indoor-assault',
      incidentId: 'fixture:indoor-incident', tick: 1, second: 6,
      offenderAgentId: initial.citizens[0].id, target,
      severity: 'serious', mechanism: 'physicalAssault',
      position: node.position, surfaceId: node.surfaceId,
      levelId: 'L1', placeId: shop.id, encounterId: 'fixture:contact',
      opportunity: { id: 'fixture:opportunity',
        offenderAgentId: initial.citizens[0].id, target,
        surfaceId: node.surfaceId, levelId: 'L1', placeId: shop.id,
        position: node.position, exposureSeconds: 6,
        guardianship: 0, perceivedRisk: 0 } }
    const harmed = applyLifeOutcomesV1({ ...initial, tick: 1,
      citizens: [initial.citizens[0], victim], offences: [offence] }, environment)
    expect(harmed.citizens[1].activity).toBe('incapacitated')
    expect(harmed.events).toContainEqual(expect.objectContaining({
      type: 'ActivityInterrupted', agentId: victim.id,
      placeId: shop.id, tick: 1 }))
    const runtime = derivePlaceRuntimeV1(harmed, environment)
    expect(runtime.places.find((item) => item.placeId === shop.id)
      ?.slotAssignments[node.id]).toBe(victim.id)
  })

  it('records natural indoor visits and reconstructs occupancy, activities and truth', () => {
    const environment = createEnvironmentV5(world, config)
    const index = createNavigationIndexV2(world)
    let state = createInitialStateV5(environment)
    for (let tick = 0; tick < 500; tick += 1) {
      const previous = state
      state = advanceStateV5(state, environment, index)
      state.citizens.forEach((citizen, agentIndex) => {
        const prior = previous.citizens[agentIndex]
        const movedMm = Math.hypot(citizen.position.x - prior.position.x,
          citizen.position.y - prior.position.y,
          citizen.position.z - prior.position.z)
        expect(movedMm).toBeLessThanOrEqual(Math.ceil(
          environment.profiles[agentIndex].travellerCosts.speedMmPerSecond *
          config.logicalSecondsPerTick * 1.48) + 2)
      })
      const occupied = state.placeRuntime!.places.flatMap((place) =>
        Object.keys(place.slotAssignments))
      expect(new Set(occupied).size).toBe(occupied.length)
      for (const place of state.placeRuntime!.places) {
        const definition = world.places.find((item) => item.id === place.placeId)!
        expect(Object.keys(place.slotAssignments).length).toBeLessThanOrEqual(definition.capacity)
      }
    }
    const indoorStarts = state.events.filter((item) => item.type === 'ActivityStarted' &&
      item.placeId?.startsWith('galleria-retail-'))
    const indoorFinishes = state.events.filter((item) => item.type === 'ActivityFinished' &&
      item.placeId?.startsWith('galleria-retail-'))
    expect(indoorStarts.length).toBeGreaterThan(0)
    expect(indoorFinishes.length).toBeGreaterThan(0)
    expect(state.habits!.citizens.flatMap((item) => readHabitLog(item.history))
      .some((item) => item.kind === 'shop' && item.outcome === 'completed' &&
        item.placeId.startsWith('galleria-retail-'))).toBe(true)
    const replay = replayV5(world, { fingerprint: environment.fingerprint,
      config, commands: [], targetTick: 500 })
    expect(replay).toEqual(state)
    expect(JSON.stringify(observerViewV5(state))).not.toContain('placeRuntime')
  }, 120_000)

  it('rejects new mall visits when closed while preserving legal egress', () => {
    const closed = { ...config, initialAccessModes: {
      ...config.initialAccessModes, 'mall-entry': 'entryClosed' as const } }
    const environment = createEnvironmentV5(world, closed)
    const index = createNavigationIndexV2(world)
    const shop = world.places.find((item) => item.id === 'galleria-retail-l1')!
    expect(findRouteV2(index, 'plaza:east-mid', shop.slotNodeIds[0], undefined,
      new Map([['mall-entry', 'entryClosed']])).status).toBe('unreachable')
    expect(findRouteV2(index, shop.slotNodeIds[0], 'plaza:east-mid', undefined,
      new Map([['mall-entry', 'entryClosed']])).status).toBe('ok')
    let state = createInitialStateV5(environment)
    for (let tick = 0; tick < 200; tick += 1) {
      state = advanceStateV5(state, environment, index)
    }
    expect(state.events.some((item) => item.type === 'DestinationReached' &&
      item.placeId?.startsWith('galleria-'))).toBe(false)
    expect(state.placeRuntime!.places.find((item) =>
      item.placeId === shop.id)?.isOpen).toBe(false)
  }, 120_000)
})
