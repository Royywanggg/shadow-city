import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createSimulationEnvironment } from './environment'
import type { SimulationConfigV2 } from './types'

const city = generateCity(HERO_SEED)
const config: SimulationConfigV2 = {
  version: 2, simulationSeed: 'shadow-city-sim-01', logicalSecondsPerTick: 6,
  populationSize: 200, behaviorModel: 'synthetic-v1',
}

describe('deterministic activity occupancy', () => {
  it('derives separated slots from legal plaza, park, and public entrance nodes', () => {
    const env = createSimulationEnvironment(city, config)
    expect(env.activitySlots.some((slot) => slot.siteId.startsWith('plaza:'))).toBe(true)
    expect(env.activitySlots.some((slot) => slot.siteId.startsWith('park:'))).toBe(true)
    expect(env.activitySlots.some((slot) => slot.siteId.startsWith('building:'))).toBe(true)
    for (const [index, slot] of env.activitySlots.entries()) {
      const anchor = env.navigation.anchorById.get(slot.anchorId)!
      const node = env.navigation.nodeById.get(anchor.nodeId)!
      expect(slot.position).toEqual({ x: node.x, y: node.surfaceY, z: node.z })
      for (const other of env.activitySlots.slice(index + 1)) {
        expect(Math.hypot(slot.position.x - other.position.x, slot.position.z - other.position.z))
          .toBeGreaterThanOrEqual(0.9 - 1e-6)
      }
    }
  })

  it('keeps 200 citizens independent at Ticks 0, 100, and 500', () => {
    const env = createSimulationEnvironment(city, config)
    let state = createInitialCitizenState(env, config)
    const siteBySlot = new Map(env.activitySlots.map((slot) => [slot.id, slot.siteId]))
    let sharedSiteObserved = false
    let joggingObserved = false
    for (let tick = 0; tick <= 500; tick += 1) {
      if (state.citizens.some((citizen) => citizen.activity === 'travelling' &&
        citizen.movementMode === 'jog')) joggingObserved = true
      const sites = new Map<string, number>()
      for (const citizen of state.citizens) {
        if (citizen.activity !== 'atDestination' || !citizen.occupancySlotId) continue
        const site = siteBySlot.get(citizen.occupancySlotId)!
        sites.set(site, (sites.get(site) ?? 0) + 1)
      }
      if ([...sites.values()].some((count) => count > 1)) sharedSiteObserved = true
      if (tick === 0 || tick === 100 || tick === 500) {
        expect(state.citizens).toHaveLength(200)
        const reservations = state.citizens.flatMap((citizen) =>
          citizen.occupancySlotId ? [citizen.occupancySlotId] : [])
        expect(new Set(reservations).size).toBe(reservations.length)
        for (const citizen of state.citizens.filter((item) => item.activity === 'atDestination')) {
          const slot = env.activitySlots.find((item) => item.id === citizen.occupancySlotId)
          expect(slot).toBeDefined()
          expect(citizen.position).toEqual(slot?.position)
          expect(citizen.currentAnchorId).toBe(slot?.anchorId)
          expect(Number.isFinite(citizen.headingRadians)).toBe(true)
        }
      }
      if (tick < 500) state = stepCitizenSimulation(env, config, state, []).state
    }
    expect(sharedSiteObserved).toBe(true)
    expect(joggingObserved).toBe(true)
  })

  it('waits at home and records capacity instead of stacking residents when a site is full', () => {
    const full = createSimulationEnvironment(city, config)
    const onlySlot = full.activitySlots[0]
    const env = { ...full, activitySlots: [onlySlot], publicAnchorIds: [onlySlot.anchorId] }
    let state = createInitialCitizenState(env, config)
    const initialWaiting = state.citizens.filter((citizen) => citizen.activity === 'waitingForSpace')
    expect(initialWaiting.length).toBeGreaterThan(0)
    expect(initialWaiting.every((citizen) => citizen.occupancySlotId === null &&
      citizen.currentAnchorId !== null && citizen.destinationAnchorId === onlySlot.anchorId)).toBe(true)
    let deferred = 0
    for (let tick = 0; tick < 150; tick += 1) {
      const next = stepCitizenSimulation(env, config, state, [])
      state = next.state
      deferred += next.events.filter((event) => event.type === 'TripDeferred').length
      expect(state.citizens.filter((citizen) => citizen.occupancySlotId !== null)).toHaveLength(1)
    }
    expect(deferred).toBeGreaterThan(0)
  })

  it('rejects a serialized state that assigns one occupancy slot to two agents', () => {
    const env = createSimulationEnvironment(city, config)
    const state = createInitialCitizenState(env, config)
    const occupants = state.citizens.filter((citizen) => citizen.occupancySlotId !== null)
    expect(occupants.length).toBeGreaterThan(1)
    const duplicated = {
      ...state,
      citizens: state.citizens.map((citizen) => citizen.id === occupants[1].id
        ? { ...citizen, occupancySlotId: occupants[0].occupancySlotId,
          destinationAnchorId: occupants[0].destinationAnchorId }
        : citizen),
    }
    expect(() => stepCitizenSimulation(env, config, duplicated, [])).toThrow(/duplicate citizen occupancy/)
  })
})
