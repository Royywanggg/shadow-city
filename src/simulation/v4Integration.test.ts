import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { createInitialStateV4, createSimulationEnvironmentV4, stepSimulationV4 } from './engineV4'
import { replayToTick } from './replay'
import { SimulationSession } from './session'
import { V05_REVIEW_SCENARIO_CONFIG, type SimulationConfigV4 } from './v4Types'

const city = generateCity(HERO_SEED)

function scenario(probability: number): SimulationConfigV4 {
  return {
    ...V05_REVIEW_SCENARIO_CONFIG,
    observation: { ...V05_REVIEW_SCENARIO_CONFIG.observation, globalProbability: probability },
  }
}

function advance(session: SimulationSession, targetTick: number): void {
  while (session.getSnapshot().liveTick < targetTick) session.advanceOneTick()
}

describe('v4 offender-driven scenario', () => {
  it('preserves movement and attributed truth under observation-only counterfactuals', () => {
    const [never, middle, always] = [0, 0.6, 1].map((probability) => new SimulationSession(city, scenario(probability)))
    for (const session of [never, middle, always]) advance(session, 500)
    const states = [never, middle, always].map((session) => session.getSnapshot().state)
    if (states.some((state) => state.version !== 4)) throw new Error('Expected v4 states')
    const [low, medium, high] = states.map((state) => {
      if (state.version !== 4) throw new Error('Expected v4 state')
      return state
    })
    expect(low.citizen).toEqual(medium.citizen)
    expect(medium.citizen).toEqual(high.citizen)
    expect(low.offenderStates).toEqual(medium.offenderStates)
    expect(low.offences).toEqual(medium.offences)
    expect(medium.offences).toEqual(high.offences)
    expect(low.incidents).toEqual(high.incidents)
    expect(low.offences.length).toBeGreaterThan(0)
    expect(never.environmentV4?.worldFingerprint).toBe(always.environmentV4?.worldFingerprint)
    expect(never.environmentV4?.scenarioFingerprint).not.toBe(always.environmentV4?.scenarioFingerprint)
    expect(never.getObservedWorldViewV4().reports).toHaveLength(0)
    expect(never.getGroundTruthViewV4().metrics.unreportedOffences).toBe(low.offences.length)
    expect(always.getGroundTruthViewV4().metrics.eventualReportingShare).toBe(1)
    const selected = (session: SimulationSession) => new Set(session.getGroundTruthViewV4().outcomes
      .filter((outcome) => outcome.status !== 'notReported')
      .map((outcome) => outcome.incidentId))
    const middleIds = selected(middle)
    const highIds = selected(always)
    expect([...middleIds].every((id) => highIds.has(id))).toBe(true)
  })

  it('attributes each offence to a citizen at the legal post-movement position, then emits one incident and event', () => {
    const environment = createSimulationEnvironmentV4(city, scenario(0.6))
    const cityBefore = JSON.stringify(city)
    let state = createInitialStateV4(environment)
    const offenceIds = new Set<string>()
    const incidentIds = new Set<string>()
    let count = 0
    for (let tick = 1; tick <= 500; tick += 1) {
      const transition = stepSimulationV4(environment, state, [])
      state = transition.state
      const citizens = new Map(state.citizen.citizens.map((citizen) => [citizen.id, citizen]))
      expect(transition.truthEvents).toHaveLength(state.offences.length - count)
      const newOffences = state.offences.slice(count)
      count = state.offences.length
      for (const offence of newOffences) {
        const citizen = citizens.get(offence.offenderAgentId)
        expect(citizen).toBeDefined()
        expect(offence.position).toEqual(citizen?.position)
        expect(offence.opportunity.agentId).toBe(offence.offenderAgentId)
        expect(offence.opportunity.nearbyCitizenIds).not.toContain(offence.offenderAgentId)
        expect(offenceIds.has(offence.id)).toBe(false)
        expect(incidentIds.has(offence.incidentId)).toBe(false)
        offenceIds.add(offence.id)
        incidentIds.add(offence.incidentId)
        expect(transition.truthEvents.some((event) => event.offenceId === offence.id &&
          event.incidentId === offence.incidentId && event.offenderAgentId === offence.offenderAgentId)).toBe(true)
      }
    }
    expect(count).toBeGreaterThan(0)
    expect(state.incidents).toHaveLength(count)
    expect(JSON.stringify(city)).toBe(cityBefore)
  })

  it('replays Tick 500 exactly, inspects history without changing live state, and resets', () => {
    const config = scenario(0.6)
    const session = new SimulationSession(city, config)
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 2 }, { effectiveTick: 15 })
    advance(session, 500)
    const live = session.getSnapshot().state
    const replay = replayToTick(city, config, session.getCommandHistory(), 500, session.environmentV4)
    expect(replay.state).toEqual(live)
    expect(replay.events).toEqual(session.getLiveEventHistory())
    expect(replay.truthEvents).toEqual(session.getTruthEventHistory())
    expect(replay.observationEvents).toEqual(session.getObservationEventHistory())
    session.inspectTick(100)
    expect(session.getSnapshot().state).toEqual(replayToTick(city, config, session.getCommandHistory(), 100).state)
    expect(session.getObservedWorldViewV4().reports.every((report) => report.availableTick <= 100)).toBe(true)
    expect(() => session.advanceOneTick()).toThrow(/Return to live/)
    session.returnLive()
    expect(session.getSnapshot().state).toEqual(live)
    session.reset()
    expect(session.getSnapshot().tick).toBe(0)
    expect(session.getGroundTruthViewV4().offences).toEqual([])
    expect(session.getObservedWorldViewV4().reports).toEqual([])
  })

  it('keeps observer records allowlisted and evidence-backed without private provenance', () => {
    const session = new SimulationSession(city, scenario(1))
    const port = session.createObserverPortV4()
    expect(Object.keys(port)).toEqual(['getView', 'subscribe'])
    expect(port.getView()).toBe(port.getView())
    advance(session, 500)
    const view = port.getView()
    expect(view).toBe(port.getView())
    expect(Object.keys(view)).toEqual(['asOfTick', 'reports', 'availableReportCount'])
    expect(view.reports.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(view)
    for (const privateKey of ['offenderAgentId', 'incidentId', 'offenceId', 'witnessAgentId', 'accurate',
      'nearbyCitizenIds', 'pendingReports', 'unreportedOffences', 'researchGroup']) {
      expect(serialized).not.toContain(privateKey)
    }
    for (const report of view.reports) {
      if (report.suspect.status === 'namedLead') {
        expect(report.suspect.verification).toBe('unverified')
        expect(report.suspect.evidenceIds.length).toBeGreaterThan(0)
        expect(report.suspect.evidenceIds.every((id) => report.evidenceRefs.some((ref) =>
          ref.id === id && ref.availableTick <= view.asOfTick))).toBe(true)
      }
    }
    const metrics = session.getGroundTruthViewV4().metrics
    expect(metrics.minorOffences + metrics.seriousOffences).toBe(metrics.totalOffences)
    expect(metrics.availableReports + metrics.pendingReports + metrics.unreportedOffences)
      .toBe(metrics.totalOffences)
  })

  it('rejects incompatible replay environments and captures mutable configuration', () => {
    const low = scenario(0.3)
    const high = scenario(0.9)
    const lowEnvironment = createSimulationEnvironmentV4(city, low)
    const highEnvironment = createSimulationEnvironmentV4(city, high)
    expect(lowEnvironment.worldFingerprint).toBe(highEnvironment.worldFingerprint)
    expect(lowEnvironment.scenarioFingerprint).not.toBe(highEnvironment.scenarioFingerprint)
    expect(() => replayToTick(city, high, [], 10, lowEnvironment)).toThrow(/incompatible/i)
    expect(() => stepSimulationV4(highEnvironment, createInitialStateV4(lowEnvironment), [])).toThrow(/incompatible/i)
    const mutable = {
      ...high,
      offending: { ...high.offending, baseOddsPerEligibleAgentHour: { ...high.offending.baseOddsPerEligibleAgentHour } },
      observation: { ...high.observation, identity: { ...high.observation.identity } },
    }
    const captured = createSimulationEnvironmentV4(city, mutable)
    mutable.offending.baseOddsPerEligibleAgentHour.minor = 0
    mutable.observation.identity.accuracyProbability = 0
    expect(captured.config.offending.baseOddsPerEligibleAgentHour.minor).toBeGreaterThan(0)
    expect(captured.config.observation.identity.accuracyProbability).toBeGreaterThan(0)
    expect(Object.isFrozen(captured.config.offending.baseOddsPerEligibleAgentHour)).toBe(true)
  })
})
