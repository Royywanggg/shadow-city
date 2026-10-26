import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { createCitizenIdentity, createCitizenIdentityCatalog } from './population'
import { SimulationSession } from './session'
import type { AgentProfile } from './types'
import { V05_REVIEW_SCENARIO_CONFIG } from './v4Types'

const city = generateCity(HERO_SEED)

function profiles(count: number): AgentProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `citizen-${String(index).padStart(4, '0')}`,
    homeAnchorId: 'home',
    speedUnitsPerLogicalSecond: 0.3,
    jogPreference: 0.2,
    firstDepartureTick: 1,
    homeDwellTicks: 100,
    visitDwellTicks: 40,
  }))
}

describe('researcher population identity', () => {
  it('builds 1,000 stable independent identities from a shared ten-model catalogue', () => {
    const thousand = createCitizenIdentityCatalog(profiles(1000))
    const repeated = createCitizenIdentityCatalog(profiles(1000))
    const firstHundred = createCitizenIdentityCatalog(profiles(100))
    expect(thousand.size).toBe(1000)
    expect([...thousand.values()]).toEqual([...repeated.values()])
    for (const [id, identity] of firstHundred) expect(thousand.get(id)).toEqual(identity)
    expect(new Set([...thousand.values()].map((identity) => identity.displayName)).size).toBe(1000)
    expect(new Set([...thousand.values()].map((identity) => identity.appearance.presetId)).size).toBe(10)
    expect([...thousand.values()].every((identity) => identity.appearance.outfitPresetId === null &&
      identity.appearance.hairstylePresetId === null && identity.appearance.accessoryPresetId === null)).toBe(true)
    for (const identity of thousand.values()) {
      const appearance = identity.appearance
      if (appearance.presetId === 'character-7') {
        expect(appearance.primaryClothingColor).toBeNull()
        expect(appearance.secondaryClothingColor).toBeNull()
      } else {
        expect(appearance.primaryClothingColor).toMatch(/^#[0-9a-f]{6}$/)
        expect(appearance.secondaryClothingColor).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
    const realizedSignatures = new Set([...thousand.values()].map((identity) => {
      const look = identity.appearance
      return `${look.presetId}|${look.primaryClothingColor}|${look.secondaryClothingColor}`
    }))
    expect(realizedSignatures.size).toBeGreaterThan(40)
    expect(realizedSignatures.size).toBeLessThan(1000)
    expect([...thousand.values()].every((identity) => identity.occupation === null)).toBe(true)
  })

  it('isolates identity and appearance seeds from one another', () => {
    const id = 'citizen-0003'
    const first = createCitizenIdentity(id, { identitySeed: 'names-A', appearanceSeed: 'looks-A' })
    const renamed = createCitizenIdentity(id, { identitySeed: 'names-B', appearanceSeed: 'looks-A' })
    const restyled = createCitizenIdentity(id, { identitySeed: 'names-A', appearanceSeed: 'looks-B' })
    expect(renamed.appearance).toEqual(first.appearance)
    expect(renamed.displayName).not.toBe(first.displayName)
    expect(restyled.displayName).toBe(first.displayName)
    expect(restyled.appearance).not.toEqual(first.appearance)
  })
})

describe('researcher population port', () => {
  it('exposes every citizen and complete tick-bounded history independently of observer knowledge', () => {
    const session = new SimulationSession(city, V05_REVIEW_SCENARIO_CONFIG)
    const population = session.createPopulationResearchPort()
    const observer = session.createObserverPortV4()
    const initial = population.getView()
    expect(initial.citizens).toHaveLength(V05_REVIEW_SCENARIO_CONFIG.citizen.populationSize)
    expect(initial.identityCatalog).toMatchObject({
      version: 'population-identity-v1',
      identitySeed: 'shadow-city-identity-01',
      appearanceSeed: 'shadow-city-appearance-01',
    })
    expect(population.getView()).toBe(initial)
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 1 }, { effectiveTick: 50 })
    expect(population.getView()).toBe(initial)
    expect(population.getAgentHistory('absent')).toBeNull()
    const citizenId = initial.citizens[0].id
    expect(population.getAgentHistory(citizenId)?.initialActivity).toBe(initial.citizens[0].state.activity)
    expect(population.getAgentHistory(citizenId)?.activityEvents).toEqual([])
    expect(population.getAgentHistory(citizenId)).toBe(population.getAgentHistory(citizenId))

    for (let tick = 1; tick <= 500; tick += 1) session.advanceOneTick()
    const live = population.getView()
    expect(live.asOfTick).toBe(500)
    expect(live).toBe(population.getView())
    const state = session.getSnapshot().state
    if (state.version !== 4) throw new Error('Expected v4 state')
    const offence = state.offences[0]
    expect(offence).toBeDefined()
    const offenderId = offence.offenderAgentId
    const history = population.getAgentHistory(offenderId)!
    expect(history.offences).toEqual(state.offences.filter((item) => item.offenderAgentId === offenderId))
    expect(history.activityEvents).toEqual(session.getLiveEventHistory().filter((event) =>
      event.source === 'citizen' && event.agentId === offenderId))
    expect(population.getView().citizens.find((citizen) => citizen.id === offenderId)?.offendingProfile?.agentId)
      .toBe(offenderId)
    expect(Object.keys(observer)).toEqual(['getView', 'subscribe'])
    expect(JSON.stringify(observer.getView())).not.toContain('offenderAgentId')

    session.inspectTick(100)
    expect(population.getView().asOfTick).toBe(100)
    expect(population.getAgentHistory(offenderId)?.activityEvents.every((event) => event.tick <= 100)).toBe(true)
    expect(population.getAgentHistory(offenderId)?.offences.every((item) => item.occurrenceTick <= 100)).toBe(true)
    const replayState = session.getSnapshot().state
    if (replayState.version !== 4) throw new Error('Expected v4 replay state')
    expect(population.getAgentHistory(offenderId)?.offences).toEqual(replayState.offences.filter((item) =>
      item.offenderAgentId === offenderId))
    session.returnLive()
    expect(population.getView().asOfTick).toBe(500)
    expect(population.getAgentHistory(offenderId)?.offences).toEqual(history.offences)
    session.reset()
    expect(population.getView().asOfTick).toBe(0)
    expect(population.getAgentHistory(offenderId)?.activityEvents).toEqual([])
    expect(population.getAgentHistory(offenderId)?.offences).toEqual([])
  })

  it('does not derive identity or appearance from movement or offending seeds', () => {
    const changed = {
      ...V05_REVIEW_SCENARIO_CONFIG,
      citizen: { ...V05_REVIEW_SCENARIO_CONFIG.citizen, simulationSeed: 'different-movement' },
      offending: { ...V05_REVIEW_SCENARIO_CONFIG.offending, offendingSeed: 'different-offending' },
    }
    const first = new SimulationSession(city, V05_REVIEW_SCENARIO_CONFIG).createPopulationResearchPort().getView()
    const second = new SimulationSession(city, changed).createPopulationResearchPort().getView()
    expect(second.citizens.map((citizen) => citizen.identity))
      .toEqual(first.citizens.map((citizen) => citizen.identity))
  })
})
