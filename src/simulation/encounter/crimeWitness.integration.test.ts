import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { generateVerticalProofWorld } from '../../world/generation/generateWorldV2'
import { DEFAULT_OFFENDING_CONFIG } from '../offending/types'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5 } from '../engineV5'
import { SimulationSessionV5 } from '../sessionV5'
import { replayV5 } from '../replayV5'
import { DEFAULT_SIMULATION_CONFIG_V5, type MovementTracePoint,
  type SimulationConfigV5 } from '../v5Types'
import { advanceEncounterCrimeV1 } from './crimeTick'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from './config'
import { createRecognitionTokenV1 } from './memory'
import { projectObserverViewV5 } from './observerProjection'
import type { AgentKnowledgeV1 } from './socialTypes'

const highOpportunityConfig = {
  ...DEFAULT_OFFENDING_CONFIG,
  groupMeanLogPropensity: {
    minorSpecialist: { minor: 8, serious: 8 },
    seriousSpecialist: { minor: 8, serious: 8 },
    generalist: { minor: 8, serious: 8 },
  },
  propensitySd: { minor: 0, serious: 0 },
  sensitivitySpread: 0,
  baseOddsPerEligibleAgentHour: { minor: 10_000, serious: 0 },
  minorCrowdFloor: 1,
  seriousMinimumNearby: 0,
  nearbySaturation: 1,
  districtExposure: {
    civic: { minor: 1, serious: 1 }, core: { minor: 1, serious: 1 },
    residential: { minor: 1, serious: 1 }, works: { minor: 1, serious: 1 },
  },
  timeBandExposure: {
    day: { minor: 1, serious: 1 }, evening: { minor: 1, serious: 1 },
    night: { minor: 1, serious: 1 },
  },
  rewardWeight: { minor: 0, serious: 0 },
  riskWeight: { minor: 0, serious: 0 },
}

function fixture(observationSeed: string) {
  const world = generateVerticalProofWorld()
  const config: SimulationConfigV5 = { ...DEFAULT_SIMULATION_CONFIG_V5,
    populationSize: 3, observationSeed, reportingProbability: 1,
    encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
      offending: highOpportunityConfig, offenceCompletionProbability: 1,
      witness: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.witness,
        eventPerceptionProbability: 1, victimPerceptionProbability: 1,
        levelRecallProbability: 1, placeRecallProbability: 1,
        severityAccuracyProbability: 1, reportDelayTicks: 2 },
      perception: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.perception,
        travellingAttention: 1, stationaryAttention: 1, fieldOfViewDegrees: 360 },
    } }
  const environment = createEnvironmentV5(world, config)
  const initial = createInitialStateV5(environment)
  const [actor, victim, passerby] = initial.citizens
  const x = -95_000; const y = 250; const z = 95_000
  const located = [actor, victim, passerby].map((citizen, index) => ({ ...citizen,
    activity: 'atDestination' as const, activityKind: 'leisure' as const,
    position: { x: x + [0, 800, 1_900][index], y, z },
    surfaceId: 'ground', placeId: 'north-park', currentNodeId: null,
    headingRadians: 0 }))
  const traces: MovementTracePoint[] = located.flatMap((citizen) =>
    Array.from({ length: 6 }, (_, index) => ({ agentId: citizen.id,
      second: index + 1, position: citizen.position,
      surfaceId: citizen.surfaceId, placeId: citizen.placeId, edgeId: null,
      headingRadians: citizen.headingRadians, activity: citizen.activity })))
  const socialSeed = config.encounter!.social.seed
  const token = createRecognitionTokenV1(socialSeed, victim.id, actor.id)
  const visual: AgentKnowledgeV1 = { id: 'fixture-visual', ownerAgentId: victim.id,
    kind: 'visualRecognition', subjectToken: token, acquiredTick: 0,
    source: 'interaction', provenanceId: 'prior-meeting', confidence: 0.9,
    believedIdentity: null, expiresTick: null }
  const identity: AgentKnowledgeV1 = { ...visual, id: 'fixture-identity',
    kind: 'identityBelief', believedIdentity: 'A claimed name' }
  const state = { ...initial, tick: 1, citizens: located,
    offenderCooldowns: { [victim.id]: 100, [passerby.id]: 100 },
    social: { ...initial.social!, knowledge: [visual, identity] } }
  return { environment, state, traces, actorId: actor.id, victimId: victim.id,
    passerbyId: passerby.id }
}

describe('constructed encounter crime and witness path', () => {
  it('rejects an old v5 checkpoint and fingerprint under opt-in encounter replay', () => {
    const world = generateVerticalProofWorld()
    const legacy = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 3 })
    legacy.advanceOneTick()
    const oldRecord = legacy.exportReplay()
    const encounter = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 3, encounter: DEFAULT_ENCOUNTER_SCENARIO_V1 })
    encounter.advanceOneTick()
    const newRecord = encounter.exportReplay()
    expect(oldRecord.fingerprint).not.toBe(newRecord.fingerprint)
    expect(() => replayV5(world, { ...oldRecord,
      config: newRecord.config })).toThrow('V5 replay fingerprint or tick mismatch')
    expect(() => replayV5(world, newRecord,
      legacy.getSnapshot().state)).toThrow('V5 checkpoint fingerprint or tick mismatch')
  })

  it('keeps legacy and encounter-aware offence/report pipelines exclusive', () => {
    const { environment, state, actorId, victimId, passerbyId } =
      fixture('compat-observation')
    const shared = { ...environment.config,
      offendingSeed: 'audit-offending-5' }
    const hazard = { id: `${actorId}:citizen:${victimId}:0@ground`,
      offenderAgentId: actorId, target: { kind: 'citizen' as const, id: victimId },
      startedTick: 0, lastContactTick: 0, totalExposureSeconds: 0,
      accumulatedHazard: 0, threshold: 0, consumed: false }
    const run = (mode: 'legacy' | 'encounterAware') => {
      const config: SimulationConfigV5 = { ...shared,
        encounter: { ...shared.encounter!, offenceMode: mode } }
      const env = createEnvironmentV5(environment.world, config)
      const initial = createInitialStateV5(env)
      return advanceStateV5({ ...initial,
        citizens: state.citizens.map((citizen) => ({ ...citizen,
          nextDecisionTick: 100 })),
        encounterEpisodes: [hazard],
        offenderCooldowns: { [victimId]: 100, [passerbyId]: 100 },
      }, env)
    }
    const legacy = run('legacy')
    const aware = run('encounterAware')
    expect(legacy.offences).toHaveLength(1)
    expect(aware.offences).toHaveLength(1)
    expect(new Set(legacy.offences.map((item) => item.id)).size).toBe(1)
    expect(new Set(aware.offences.map((item) => item.id)).size).toBe(1)
    expect(legacy.pendingReports).toHaveLength(1)
    expect(legacy.social?.pendingWitnessReports).toHaveLength(0)
    expect(aware.pendingReports).toHaveLength(0)
    expect(aware.social?.pendingWitnessReports).toHaveLength(2)
  })

  it('accepts a zero-population run without inventing an encounter, offence or witness', () => {
    const world = generateVerticalProofWorld()
    const session = new SimulationSessionV5(world, {
      ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 0,
      encounter: DEFAULT_ENCOUNTER_SCENARIO_V1,
    })
    for (let tick = 0; tick < 30; tick += 1) session.advanceOneTick()
    const state = session.getSnapshot().state
    expect(state.social?.encounters.active).toHaveLength(0)
    expect(state.social?.encounters.completed).toHaveLength(0)
    expect(state.social?.interactions).toHaveLength(0)
    expect(state.offences).toHaveLength(0)
    expect(state.social?.witnessAssessments).toHaveLength(0)
    expect(state.reports).toHaveLength(0)
  })

  it('uses the true within-tick second, subjective stages and delayed reports', () => {
    const { environment, state, traces, actorId, victimId, passerbyId } =
      fixture('witness-integration-seed')
    const first = advanceEncounterCrimeV1(state, environment, traces)
    const offence = first.offences.find((item) => item.offenderAgentId === actorId &&
      item.target.kind === 'citizen' && item.target.id === victimId)
    expect(offence).toBeDefined()
    expect(offence!.second).toBeGreaterThanOrEqual(1)
    expect(offence!.second).toBeLessThanOrEqual(6)
    const victimAssessment = first.social!.witnessAssessments.find((item) =>
      item.offenceId === offence!.id && item.witnessAgentId === victimId)
    const passerbyAssessment = first.social!.witnessAssessments.find((item) =>
      item.offenceId === offence!.id && item.witnessAgentId === passerbyId)
    expect(victimAssessment).toMatchObject({ source: 'victim', presentNearby: true,
      potentiallyAbleToObserve: true, actuallyPerceivedEvent: true,
      recognizedPerson: true, identifiedSuspect: true })
    expect(passerbyAssessment).toMatchObject({ source: 'witness', presentNearby: true,
      potentiallyAbleToObserve: true, actuallyPerceivedEvent: true,
      recognizedPerson: false, identifiedSuspect: false })
    expect(first.reports).toHaveLength(0)
    expect(first.social!.pendingWitnessReports).toHaveLength(2)
    expect(first.social!.perceivedPlaceRisks).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerAgentId: victimId, placeId: 'north-park' }),
      expect.objectContaining({ ownerAgentId: passerbyId, placeId: 'north-park' }),
    ]))
    expect(first.social!.perceivedPlaceRisks.every((risk) =>
      risk.ownerAgentId === victimId || risk.ownerAgentId === passerbyId)).toBe(true)
    expect(first.social!.perceivedPlaceRisks.every((risk) =>
      risk.score > 0 && risk.score <= 1)).toBe(true)
    expect(first.social!.pendingWitnessReports.every((item) =>
      item.report.availableTick === 3)).toBe(true)
    const delivered = advanceEncounterCrimeV1({ ...first, tick: 3 },
      environment, [])
    expect(delivered.reports).toHaveLength(2)
    expect(delivered.offences).toHaveLength(first.offences.length)
    expect(delivered.reports.map((item) => item.suspect.status).sort())
      .toEqual(['nameClaim', 'unknown'])
    const observed = projectObserverViewV5(delivered)
    expect(observed.reports).toHaveLength(2)
    expect(JSON.stringify(observed)).not.toContain(actorId)
    expect(JSON.stringify(observed)).not.toContain(offence!.id)
  })

  it('changing only the observation seed leaves citizens and crime truth unchanged', () => {
    const a = fixture('observation-a')
    const b = fixture('observation-b')
    const first = advanceEncounterCrimeV1(a.state, a.environment, a.traces)
    const second = advanceEncounterCrimeV1(b.state, b.environment, b.traces)
    expect(first.citizens).toEqual(second.citizens)
    expect(first.offences).toEqual(second.offences)
    expect(first.encounterEpisodes).toEqual(second.encounterEpisodes)
  })

  it('replays a naturally formed interaction, later offence, witness and report for one pair', () => {
    const world = generateIntegratedWorld()
    const scenario = { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
      social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
        greetingWillingness: 0.7, conversationWillingness: 0.85 },
      witness: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.witness,
        eventPerceptionProbability: 0.75, victimPerceptionProbability: 0.95 } }
    const session = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 120, offendingSeed: 'shadow-city-offending-chain-4',
      reportingProbability: 1, encounter: scenario })
    for (let tick = 0; tick < 94; tick += 1) session.advanceOneTick()
    const state = session.getSnapshot().state
    const social = state.social!
    const delivered = new Set(state.reports.map((report) => report.id))
    const chain = state.offences.flatMap((offence) => {
      if (offence.target.kind !== 'citizen' ||
        !offence.opportunity.socialContext?.offenderPerceivedTarget ||
        offence.opportunity.socialContext.directedFamiliarity <= 0) return []
      const pair = [offence.offenderAgentId, offence.target.id].sort().join('|')
      const earlier = social.interactions.find((interaction) =>
        interaction.participantIds.join('|') === pair &&
        interaction.status === 'completed' && interaction.endTick! < offence.tick)
      const witnessed = social.witnessObservations.some((observation) =>
        observation.offenceId === offence.id)
      const reported = social.reportLinks.some((link) =>
        link.offenceId === offence.id && delivered.has(link.reportId))
      return earlier && witnessed && reported ? [{ offence, interaction: earlier }] : []
    })[0]
    expect(chain).toBeDefined()
    const episode = [...social.encounters.active, ...social.encounters.completed].find((item) =>
      item.id === chain!.interaction.encounterId)
    expect(chain!.interaction.type).toBe('greeting')
    expect(episode?.interactionIds).toContain(chain!.interaction.id)
    expect(chain!.offence.encounterId).toBe(episode!.id)
    const observer = projectObserverViewV5(state)
    expect(observer.reports.length).toBeGreaterThan(0)
    expect(JSON.stringify(observer)).not.toContain(chain!.offence.offenderAgentId)
    expect(JSON.stringify(observer)).not.toContain(chain!.offence.id)
    expect(replayV5(world, session.exportReplay())).toEqual(state)
  })

  it('finds a separate later encounter after interaction, cooldown and subjective reporting', () => {
    const world = generateIntegratedWorld()
    const scenario = { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
      offenceCompletionProbability: 1,
      social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
        greetingWillingness: 0.7, conversationWillingness: 0.85 },
      offending: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.offending,
        baseOddsPerEligibleAgentHour: { minor: 12, serious: 2.8 } },
      witness: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.witness,
        eventPerceptionProbability: 1, victimPerceptionProbability: 1 } }
    const session = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 120, offendingSeed: 'shadow-city-reencounter-4',
      reportingProbability: 1, encounter: scenario })
    for (let tick = 0; tick < 573; tick += 1) session.advanceOneTick()
    const state = session.getSnapshot().state
    const social = state.social!
    const episodes = [...social.encounters.active, ...social.encounters.completed]
    const reportIds = new Set(projectObserverViewV5(state).reports.map((report) => report.id))
    const globalSecond = (tick: number, second: number) => (tick - 1) * 6 + second
    const chain = state.offences.flatMap((offence) => {
      if (offence.target.kind !== 'citizen' ||
        !offence.opportunity.socialContext?.offenderPerceivedTarget ||
        offence.opportunity.socialContext.directedFamiliarity <= 0) return []
      const later = episodes.find((item) => item.id === offence.encounterId)
      if (!later) return []
      const earlier = episodes.find((item) => item.pairKey === later.pairKey &&
        item.id !== later.id && item.endedTick !== null && item.endedSecond !== null &&
        globalSecond(later.startedTick, later.startedSecond) -
          globalSecond(item.endedTick, item.endedSecond) >=
          scenario.lifecycle.cooldownSeconds &&
        social.interactions.some((interaction) => interaction.encounterId === item.id &&
          interaction.status === 'completed' && interaction.endTick! < later.startedTick))
      const interaction = social.interactions.find((item) => item.encounterId === earlier?.id &&
        item.status === 'completed' && item.endTick! < later.startedTick)
      const witnessed = social.witnessObservations.some((item) => item.offenceId === offence.id)
      const reported = social.reportLinks.some((item) =>
        item.offenceId === offence.id && reportIds.has(item.reportId))
      return earlier && interaction && witnessed && reported ?
        [{ earlier, later, interaction, offence }] : []
    })[0]
    expect(chain).toBeDefined()
    expect(chain!.earlier.status).toBe('ended')
    expect(chain!.earlier.interactionIds).toContain(chain!.interaction.id)
    expect(chain!.later.id).not.toBe(chain!.earlier.id)
    expect(chain!.offence.opportunity.socialContext!.directedFamiliarity).toBeGreaterThan(0)
    const atInteraction = session.inspectTick(chain!.interaction.endTick!)
    expect(atInteraction.social!.memories.filter((item) =>
      item.provenanceId === chain!.interaction.id)).toHaveLength(2)
    const observer = projectObserverViewV5(state)
    expect(JSON.stringify(observer)).not.toContain(chain!.offence.offenderAgentId)
    expect(JSON.stringify(observer)).not.toContain(chain!.offence.id)
  }, 20_000)
})
