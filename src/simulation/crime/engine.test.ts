import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5 } from '../engineV5'
import { createNavigationIndexV2 } from '../../world/navigation/routeV2'
import { replayV5 } from '../replayV5'
import { DEFAULT_LIFE_SCENARIO_V1 } from '../life/types'
import { DEFAULT_SCENE_SCENARIO_V1 } from '../scenes/types'
import { advanceEncounterCrimeV1 } from '../encounter/crimeTick'
import { observerViewV5 } from '../offending/opportunityV5'
import { finalizeLifeTickV1 } from '../life/state'
import { worldClockAtTick } from '../clock'
import { calendarAtTick } from '../habits/calendar'
import { DEFAULT_HABIT_SCENARIO_V1 } from '../habits/types'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from '../encounter/config'
import { DEFAULT_SIMULATION_CONFIG_V5, type MovementTracePoint } from '../v5Types'
import type { OpportunitySnapshot, OffendingProfile } from '../offending/types'
import type { SpatialCandidateSample } from '../encounter/spatialTypes'
import { advanceTypedCrimeV1, cumulativeAttemptProbability, typedCrimeUnit } from './engine'
import { DEFAULT_TYPED_CRIME_CONFIG_V1 } from './types'
import type { TypedOffenceKind } from './types'

const world = generateIntegratedWorld('shadow-city-hero-01')
const surface = world.surfaces[0]
const point = world.navNodes.find((item) => item.surfaceId === surface.id)!.position
const baseConfig = {
  ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 2,
  habit: { ...DEFAULT_HABIT_SCENARIO_V1, calendarSecondsPerTick: 6 },
  encounter: DEFAULT_ENCOUNTER_SCENARIO_V1,
  typedCrime: { ...DEFAULT_TYPED_CRIME_CONFIG_V1,
    portableItemProbability: 1, theftHazardPerHour: 100,
    assaultHazardPerHour: 0, theftCompletionProbability: 1 },
}

function fixture(completion: number, secondSurface = surface.id,
  kind: TypedOffenceKind = 'personTheft', injuryProbability = 0) {
  const config = { ...baseConfig, reportingProbability: 1,
    typedCrime: { ...baseConfig.typedCrime,
    theftHazardPerHour: kind === 'personTheft' ? 100 : 0,
    assaultHazardPerHour: kind === 'physicalAssault' ? 100 : 0,
    theftCompletionProbability: completion,
    assaultCompletionProbability: completion },
    ...(kind === 'physicalAssault' ? { life: { ...DEFAULT_LIFE_SCENARIO_V1,
      injuryProbability: { minor: injuryProbability, serious: injuryProbability } } } : {}) }
  const environment = createEnvironmentV5(world, config)
  const initial = createInitialStateV5(environment)
  const actor = initial.citizens[0].id
  const victim = initial.citizens[1].id
  const item = initial.typedCrime!.items.find((entry) =>
    entry.possessorAgentId === victim)!
  const episodeId = `episode:${actor}:${victim}:${kind}:` +
    `${kind === 'personTheft' ? item.id : 'person'}:${surface.id}:1`
  const episode = { id: episodeId, actorAgentId: actor, victimAgentId: victim,
    itemId: kind === 'personTheft' ? item.id : null, offenceType: kind,
    placeId: null, surfaceId: surface.id, levelId: surface.levelId,
    position: point, startTick: 1, endTick: null, lastContactTick: 1,
    exposureSeconds: 0, accumulatedHazard: 0, threshold: 0.000001,
    lastRatePerHour: 0, lastPerceivedRisk: 0, guardianship: 0,
    status: 'active' as const, endReason: null }
  const state = { ...initial, tick: 1, typedCrime: { ...initial.typedCrime!,
    activeEpisodes: [episode] } }
  const first: MovementTracePoint = { agentId: actor, second: 1,
    position: point, surfaceId: surface.id, placeId: null,
    edgeId: null, activity: 'atDestination' }
  const second: MovementTracePoint = { ...first, agentId: victim,
    surfaceId: secondSurface }
  const candidate: SpatialCandidateSample = {
    pairKey: JSON.stringify([actor, victim]), participantIds: [actor, victim],
    second: 1, distanceMm: 0,
    relation: secondSurface === surface.id ? 'sameSurface' : 'openPortal',
    surfaceId: secondSurface === surface.id ? surface.id : null,
    placeId: null, first, secondTrace: second,
    firstSpeedMmPerSecond: 0, secondSpeedMmPerSecond: 0,
  }
  const profiles = new Map<string, OffendingProfile>([actor, victim].map((id) =>
    [id, { agentId: id, researchGroup: 'generalist',
      logPropensity: { minor: 0,
        serious: kind === 'physicalAssault' && id === victim ? -100 : 0 }, rewardSensitivity: 0,
      riskSensitivity: 0 }]))
  const snapshot = (): OpportunitySnapshot => ({ agentId: actor, tick: 1,
    position: { x: 0, y: 0, z: 0 }, activity: 'atDestination',
    pedestrianAnchor: { kind: 'publicAnchor', id: surface.id },
    blockId: 'test', district: 'core', timeBand: 'day',
    nearbyCitizenIds: [victim], nearbyOutdoorCount: 1,
    exposureBySeverity: { minor: 1, serious: 1 }, rewardScore: 0,
    perceivedRiskScore: 0 })
  return { state, environment, candidate, profiles, snapshot, actor, victim, item }
}

describe('unified time and typed crime', () => {
  it('keeps calendar, movement and contact on the same six-second axis', () => {
    const end = worldClockAtTick(8, 14_400)
    expect(end.elapsedSeconds).toBe(86_400)
    expect(end.dayIndex).toBe(1)
    expect(end.timeOfDaySeconds).toBe(8 * 3_600)
    expect(calendarAtTick(8, 14_400, 6).day).toBe(1)
    expect(calendarAtTick(23, 600, 6).minuteOfDay).toBe(0)
  })

  it('uses cumulative hazard with exposure and substep invariance', () => {
    const rate = 0.001
    expect(cumulativeAttemptProbability(rate, 0)).toBe(0)
    expect(cumulativeAttemptProbability(0, 3_600)).toBe(0)
    expect(cumulativeAttemptProbability(rate, 20)).toBeCloseTo(1 - Math.exp(-0.02))
    expect(cumulativeAttemptProbability(rate, 20)).toBeGreaterThan(
      cumulativeAttemptProbability(rate, 10))
    expect(1 - Math.exp(-rate * 20)).toBeCloseTo(
      1 - (1 - cumulativeAttemptProbability(rate, 5)) ** 4)
    const count = 10_000
    const observed = Array.from({ length: count }, (_, index) =>
      -Math.log(typedCrimeUnit(`fixed-contact:${index}`)) <
      rate * 500).filter(Boolean).length / count
    expect(Math.abs(observed - cumulativeAttemptProbability(rate, 500))).toBeLessThan(0.02)
  })

  it('transfers possession exactly once while retaining legal ownership', () => {
    const test = fixture(1)
    const first = advanceTypedCrimeV1(test.state, test.environment,
      [test.candidate], test.profiles, test.snapshot)
    expect(first).toEqual(advanceTypedCrimeV1(test.state, test.environment,
      [test.candidate], test.profiles, test.snapshot))
    expect(first.state.typedCrime!.attempts).toHaveLength(1)
    expect(first.state.typedCrime!.attempts[0].outcome).toBe('completed')
    expect(first.newOffences[0].offenceType).toBe('personTheft')
    expect(first.newOffences[0].mechanism).toBe('nonPhysical')
    expect(first.state.typedCrime!.items.find((item) => item.id === test.item.id)).toMatchObject({
      ownerAgentId: test.victim, possessorAgentId: test.actor })
    const repeat = advanceTypedCrimeV1({ ...first.state, tick: 2 },
      test.environment, [test.candidate], test.profiles, test.snapshot)
    expect(repeat.state.offences).toHaveLength(1)
  })

  it('does not transfer an item after a failed attempt', () => {
    const test = fixture(0)
    const result = advanceTypedCrimeV1(test.state, test.environment,
      [test.candidate], test.profiles, test.snapshot)
    expect(result.state.typedCrime!.attempts[0].outcome).toBe('failed')
    expect(result.newOffences).toHaveLength(0)
    expect(result.state.typedCrime!.items.find((item) => item.id === test.item.id)!
      .possessorAgentId).toBe(test.victim)
  })

  it('does not treat a cross-surface pair as physical contact', () => {
    const other = world.surfaces.find((item) => item.id !== surface.id)!
    const test = fixture(1, other.id)
    const result = advanceTypedCrimeV1(test.state, test.environment,
      [test.candidate], test.profiles, test.snapshot)
    expect(result.newOffences).toHaveLength(0)
    expect(result.state.typedCrime!.attempts).toHaveLength(0)
    expect(result.state.typedCrime!.eligibleExposureSeconds).toBe(0)
  })

  it('cannot steal an item absent from the victim possession state', () => {
    const test = fixture(1)
    const withoutItem = { ...test.state, typedCrime: { ...test.state.typedCrime!,
      items: test.state.typedCrime!.items.filter((item) => item.id !== test.item.id) } }
    const result = advanceTypedCrimeV1(withoutItem, test.environment,
      [test.candidate], test.profiles, test.snapshot)
    expect(result.newOffences).toHaveLength(0)
    expect(result.state.typedCrime!.attempts).toHaveLength(0)
  })

  it('separates a completed assault from its independently sampled injury', () => {
    const noInjury = fixture(1, surface.id, 'physicalAssault', 0)
    const completed = advanceTypedCrimeV1(noInjury.state, noInjury.environment,
      [noInjury.candidate], noInjury.profiles, noInjury.snapshot)
    expect(completed.newOffences).toHaveLength(1)
    expect(completed.newOffences[0].mechanism).toBe('physicalAssault')
    expect(finalizeLifeTickV1(completed.state, noInjury.environment)
      .life!.injuries).toHaveLength(0)
    const injured = fixture(1, surface.id, 'physicalAssault', 1)
    const outcome = advanceTypedCrimeV1(injured.state, injured.environment,
      [injured.candidate], injured.profiles, injured.snapshot)
    const final = finalizeLifeTickV1(outcome.state, injured.environment)
    expect(final.life!.injuries).toHaveLength(1)
    expect(final.life!.injuries[0].sourceOffenceId).toBe(outcome.newOffences[0].id)
    expect(final.offences).toHaveLength(1)
  })

  it('keeps theft hidden until a victim self-check and delivers only a delayed report', () => {
    const test = fixture(1)
    const stolen = advanceTypedCrimeV1(test.state, test.environment,
      [test.candidate], test.profiles, test.snapshot).state
    const awareness = stolen.typedCrime!.awareness[0]
    expect(awareness.dueTick).toBeGreaterThan(1)
    expect(stolen.social!.knowledge).toHaveLength(0)
    expect(observerViewV5(stolen).reports).toHaveLength(0)
    const discovered = advanceEncounterCrimeV1({ ...stolen, tick: awareness.dueTick },
      test.environment, [], [], [])
    expect(discovered.typedCrime!.awareness[0].acquiredTick).toBe(awareness.dueTick)
    expect(discovered.social!.knowledge.some((item) =>
      item.ownerAgentId === test.victim && item.believedIdentity === null)).toBe(true)
    expect(observerViewV5(discovered).reports).toHaveLength(0)
    const delivered = advanceEncounterCrimeV1({ ...discovered,
      tick: awareness.dueTick + test.environment.config.encounter!.witness.reportDelayTicks },
    test.environment, [], [], [])
    expect(observerViewV5(delivered).reports).toHaveLength(1)
    expect(observerViewV5(delivered).reports[0].suspect.status).toBe('unknown')
    expect(JSON.stringify(observerViewV5(delivered))).not.toContain(test.actor)
    expect(JSON.stringify(observerViewV5(delivered))).not.toContain(test.item.id)
  })

  it('replays naturally generated item transfers, knowledge and causal IDs', () => {
    const seed = 'place-paired-03'
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5,
      simulationSeed: seed, offendingSeed: `${seed}-offending`,
      observationSeed: `${seed}-observation`, populationSize: 120,
      habit: { ...DEFAULT_HABIT_SCENARIO_V1, seed: `${seed}-habits`,
        calendarSecondsPerTick: 6 },
      encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
        social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
          seed: `${seed}-social`, greetingWillingness: 0.7,
          conversationWillingness: 0.85, diagnosticTraces: true } },
      typedCrime: { ...DEFAULT_TYPED_CRIME_CONFIG_V1, theftHazardPerHour: 10 },
      life: { ...DEFAULT_LIFE_SCENARIO_V1, seed: `${seed}-life` },
      scene: DEFAULT_SCENE_SCENARIO_V1,
      placeInteraction: { version: 'place-v1' as const },
    }
    const environment = createEnvironmentV5(world, config)
    const index = createNavigationIndexV2(world)
    let state = createInitialStateV5(environment)
    for (let tick = 0; tick < 200; tick += 1) {
      state = advanceStateV5(state, environment, index)
    }
    expect(state.offences.some((offence) => offence.offenceType === 'personTheft')).toBe(true)
    expect(state.typedCrime!.items.some((item) =>
      item.ownerAgentId !== item.possessorAgentId)).toBe(true)
    const replayed = replayV5(world, { fingerprint: environment.fingerprint,
      config, commands: [], targetTick: 200 })
    expect(replayed).toEqual(state)
    const reportOnlyConfig = { ...config, reportingProbability: 0 }
    const reportOnlyEnvironment = createEnvironmentV5(world, reportOnlyConfig)
    let noReports = createInitialStateV5(reportOnlyEnvironment)
    for (let tick = 0; tick < 200; tick += 1) {
      noReports = advanceStateV5(noReports, reportOnlyEnvironment, index)
    }
    expect(noReports.citizens).toEqual(state.citizens)
    expect(noReports.offences).toEqual(state.offences)
    expect(noReports.typedCrime!.items).toEqual(state.typedCrime!.items)
    expect(noReports.life).toEqual(state.life)
    expect(() => replayV5(world, { fingerprint: environment.fingerprint,
      config: { ...config, typedCrime: { ...config.typedCrime,
        theftHazardPerHour: 1 } }, commands: [], targetTick: 200 }))
      .toThrow(/fingerprint/)
  })
})
