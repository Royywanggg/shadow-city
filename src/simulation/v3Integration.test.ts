import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { replayToTick } from './replay'
import { SimulationSession } from './session'
import { V04_REVIEW_SCENARIO_CONFIG, type SimulationConfigV3 } from './v3Types'

const city = generateCity(HERO_SEED)

function config(probability: number): SimulationConfigV3 {
  return {
    ...V04_REVIEW_SCENARIO_CONFIG,
    observation: { ...V04_REVIEW_SCENARIO_CONFIG.observation, globalProbability: probability },
  }
}

function advance(session: SimulationSession, targetTick: number): void {
  while (session.getSnapshot().liveTick < targetTick) session.advanceOneTick()
}

describe('v3 scenario integration', () => {
  it('keeps the citizen world and incidents identical while report sets grow monotonically', () => {
    const a = new SimulationSession(city, config(0.3))
    const b = new SimulationSession(city, config(0.6))
    const c = new SimulationSession(city, config(0.9))
    for (const session of [a, b, c]) advance(session, 500)

    const states = [a, b, c].map((session) => session.getSnapshot().state)
    if (states.some((state) => state.version !== 3)) throw new Error('Expected v3 state')
    const [low, medium, high] = states.map((state) => {
      if (state.version !== 3) throw new Error('Expected v3 state')
      return state
    })
    expect(low.citizen).toEqual(medium.citizen)
    expect(medium.citizen).toEqual(high.citizen)
    expect(low.incidents).toEqual(medium.incidents)
    expect(medium.incidents).toEqual(high.incidents)
    expect(low.incidents.length).toBeGreaterThan(3)
    expect(a.environmentV3?.worldFingerprint).toBe(b.environmentV3?.worldFingerprint)
    expect(a.environmentV3?.scenarioFingerprint).not.toBe(b.environmentV3?.scenarioFingerprint)

    const selected = (session: SimulationSession) => new Set(session.getGroundTruthView().outcomes
      .filter((outcome) => outcome.status !== 'notReported')
      .map((outcome) => outcome.incidentId))
    const lowIds = selected(a)
    const mediumIds = selected(b)
    const highIds = selected(c)
    expect([...lowIds].every((id) => mediumIds.has(id))).toBe(true)
    expect([...mediumIds].every((id) => highIds.has(id))).toBe(true)
    expect(highIds.size).toBeGreaterThan(lowIds.size)
    for (const session of [a, b, c]) {
      const metrics = session.getGroundTruthView().metrics
      expect(metrics.totalIncidents).toBe(metrics.unreportedIncidents + metrics.pendingReports + metrics.availableReports)
      expect(session.getObservedWorldView().availableReportCount).toBe(metrics.availableReports)
      expect(session.getSnapshot().eventCount).toBe(session.getEventHistory().length)
    }
  })

  it('replays exact truth, pending reports, and public records, then resets to an empty world', () => {
    const scenario = config(0.6)
    const session = new SimulationSession(city, scenario)
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 2 }, { effectiveTick: 15 })
    advance(session, 500)
    const live = session.getSnapshot().state
    const citizenEvents = session.getLiveEventHistory()
    const truthEvents = session.getTruthEventHistory()
    const observationEvents = session.getObservationEventHistory()
    const replay = replayToTick(city, scenario, session.getCommandHistory(), 500, session.environmentV3)
    expect(replay.state).toEqual(live)
    expect(replay.events).toEqual(citizenEvents)
    expect(replay.truthEvents).toEqual(truthEvents)
    expect(replay.observationEvents).toEqual(observationEvents)

    session.inspectTick(100)
    const historical = replayToTick(city, scenario, session.getCommandHistory(), 100, session.environmentV3)
    expect(session.getSnapshot().state).toEqual(historical.state)
    expect(session.getGroundTruthView().asOfTick).toBe(100)
    expect(session.getObservedWorldView().reports.every((record) => record.availableTick <= 100)).toBe(true)
    expect(session.getTruthEventHistory()).toEqual(historical.truthEvents)
    expect(session.getObservationEventHistory()).toEqual(historical.observationEvents)
    expect(() => session.advanceOneTick()).toThrow(/Return to live/)
    session.returnLive()
    expect(session.getSnapshot().state).toEqual(live)
    session.reset()
    expect(session.getSnapshot().tick).toBe(0)
    expect(session.getGroundTruthView().incidents).toEqual([])
    expect(session.getObservedWorldView().reports).toEqual([])
    expect(session.getTruthEventHistory()).toEqual([])
  })

  it('gives an observer only a cached public port with no truth or pending metadata', () => {
    const session = new SimulationSession(city, config(0.3))
    const port = session.createObserverPort()
    expect(Object.keys(port)).toEqual(['getView', 'subscribe'])
    expect(port.getView()).toBe(port.getView())
    advance(session, 100)
    const view = port.getView()
    expect(view).toBe(port.getView())
    expect(Object.keys(view)).toEqual(['asOfTick', 'reports', 'availableReportCount'])
    const serialized = JSON.stringify(view)
    for (const incident of session.getGroundTruthView().incidents) {
      expect(serialized).not.toContain(incident.id)
      expect(serialized).not.toContain(incident.provenance.spatialTrialId)
    }
    expect(serialized).not.toContain('pending')
    expect(serialized).not.toContain('unreported')
  })

  it('rejects an incompatible scenario state and a history overflow without partial commit', () => {
    const first = new SimulationSession(city, config(0.3))
    const other = new SimulationSession(city, config(0.9))
    expect(first.environmentV3?.worldFingerprint).toBe(other.environmentV3?.worldFingerprint)
    expect(first.environmentV3?.scenarioFingerprint).not.toBe(other.environmentV3?.scenarioFingerprint)

    const capped = new SimulationSession(city, config(0.6), {
      maxTicks: 500,
      maxCommands: 10,
      maxEvents: 10_000,
      maxPendingActions: 100,
      maxIncidents: 1,
      maxReports: 100,
    })
    let rejected = false
    for (let tick = 1; tick <= 100; tick += 1) {
      const before = capped.getSnapshot()
      const truthBefore = capped.getTruthEventHistory()
      try {
        capped.advanceOneTick()
      } catch (error) {
        expect(String(error)).toMatch(/history limit/)
        expect(capped.getSnapshot()).toBe(before)
        expect(capped.getTruthEventHistory()).toEqual(truthBefore)
        rejected = true
        break
      }
    }
    expect(rejected).toBe(true)
  })
})
