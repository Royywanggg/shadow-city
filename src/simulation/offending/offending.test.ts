import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { createInitialCitizenState, stepCitizenSimulation } from '../engineV2'
import { createSimulationEnvironment } from '../environment'
import type { CitizenState, SimulationConfigV2 } from '../types'
import {
  createInitialOffenderStates,
  createOffendingProfiles,
  createOffendingRunId,
  DEFAULT_OFFENDING_CONFIG,
  evaluateOpportunitiesForTick,
  generateOffencesForTick,
  offenceChoiceProbabilities,
  REVIEW_OFFENDING_CONFIG,
  validateOffendingConfig,
} from './index'
import type { OffendingConfig } from './types'

const city = generateCity(HERO_SEED)
const citizenConfig: SimulationConfigV2 = {
  version: 2,
  simulationSeed: 'shadow-city-sim-01',
  logicalSecondsPerTick: 6,
  populationSize: 80,
  behaviorModel: 'synthetic-v1',
}
const environment = createSimulationEnvironment(city, citizenConfig)

function citizensAt(tick: number): readonly CitizenState[] {
  let state = createInitialCitizenState(environment, citizenConfig)
  for (let current = 1; current <= tick; current += 1) {
    state = stepCitizenSimulation(environment, citizenConfig, state, []).state
  }
  return state.citizens
}

function step(citizens: readonly CitizenState[], config: OffendingConfig, tick = 1) {
  const profiles = createOffendingProfiles(environment.profiles, config)
  return generateOffencesForTick(
    city, citizens, profiles, createInitialOffenderStates(profiles), tick,
    citizenConfig.logicalSecondsPerTick, config, createOffendingRunId(environment.runId, config),
  )
}

describe('v0.5 offender domain', () => {
  it('makes stable independent profiles with configurable groups and correlation', () => {
    const config = DEFAULT_OFFENDING_CONFIG
    const profiles = createOffendingProfiles(environment.profiles, config)
    expect(profiles).toEqual(createOffendingProfiles([...environment.profiles].reverse(), config))
    expect(new Set(profiles.map((profile) => profile.agentId)).size).toBe(80)
    const larger = createSimulationEnvironment(city, { ...citizenConfig, populationSize: 100 })
    expect(createOffendingProfiles(larger.profiles, config).slice(0, 80)).toEqual(profiles)
    const allSeriousSpecialists = createOffendingProfiles(environment.profiles, {
      ...config,
      groupShares: { minorSpecialist: 0, seriousSpecialist: 1, generalist: 0 },
    })
    expect(allSeriousSpecialists.every((profile) => profile.researchGroup === 'seriousSpecialist')).toBe(true)
    expect(() => validateOffendingConfig({ ...config, propensityCorrelation: 1 })).toThrow()
    expect(() => validateOffendingConfig({ ...config, groupShares: {
      minorSpecialist: 0.5, seriousSpecialist: 0.5, generalist: 0.5,
    } })).toThrow()
  })

  it('evaluates opportunities only at legal post-movement outdoor positions', () => {
    const citizens = citizensAt(1)
    const opportunities = evaluateOpportunitiesForTick(
      city, citizens, 1, citizenConfig.logicalSecondsPerTick, DEFAULT_OFFENDING_CONFIG,
    )
    expect(opportunities.length).toBeGreaterThan(0)
    const citizenById = new Map(citizens.map((citizen) => [citizen.id, citizen]))
    for (const opportunity of opportunities) {
      expect(opportunity.position).toEqual(citizenById.get(opportunity.agentId)?.position)
      expect(opportunity.nearbyCitizenIds).toEqual([...opportunity.nearbyCitizenIds].sort())
      expect(opportunity.nearbyCitizenIds).not.toContain(opportunity.agentId)
      expect(city.blocks.some((block) => block.id === opportunity.blockId &&
        block.district === opportunity.district)).toBe(true)
      expect(opportunity.pedestrianAnchor.kind === 'edge'
        ? city.pedestrian.edges.some((edge) => edge.id === opportunity.pedestrianAnchor.id)
        : city.pedestrian.anchors.some((anchor) => anchor.id === opportunity.pedestrianAnchor.id))
        .toBe(true)
    }
    expect(evaluateOpportunitiesForTick(city, citizens.map((citizen) => ({
      ...citizen, activity: 'atHome' as const,
    })), 1, citizenConfig.logicalSecondsPerTick, DEFAULT_OFFENDING_CONFIG)).toEqual([])
    const outdoor = citizens.find((citizen) => citizen.activity === 'travelling')!
    expect(() => evaluateOpportunitiesForTick(city, [{
      ...outdoor, position: { ...outdoor.position, x: outdoor.position.x + 1 },
    }], 1, citizenConfig.logicalSecondsPerTick, DEFAULT_OFFENDING_CONFIG)).toThrow(/active pedestrian edge/)
  })

  it('normalizes no/minor/serious choices and enforces zero opportunity', () => {
    const opportunity = evaluateOpportunitiesForTick(
      city, citizensAt(1), 1, citizenConfig.logicalSecondsPerTick, DEFAULT_OFFENDING_CONFIG,
    )[0]
    const profile = createOffendingProfiles(environment.profiles, DEFAULT_OFFENDING_CONFIG)
      .find((item) => item.agentId === opportunity.agentId)!
    const probabilities = offenceChoiceProbabilities(
      profile, opportunity, DEFAULT_OFFENDING_CONFIG, citizenConfig.logicalSecondsPerTick,
    )
    expect(probabilities.none + probabilities.minor + probabilities.serious).toBeCloseTo(1, 12)
    expect(Object.values(probabilities).every((value) => value >= 0 && value <= 1)).toBe(true)
    expect(offenceChoiceProbabilities(profile, {
      ...opportunity, exposureBySeverity: { minor: 0, serious: 0 },
    }, DEFAULT_OFFENDING_CONFIG, citizenConfig.logicalSecondsPerTick))
      .toEqual({ none: 1, minor: 0, serious: 0 })
    const higherRisk = offenceChoiceProbabilities(profile, {
      ...opportunity, perceivedRiskScore: 1,
    }, DEFAULT_OFFENDING_CONFIG, citizenConfig.logicalSecondsPerTick)
    const lowerRisk = offenceChoiceProbabilities(profile, {
      ...opportunity, perceivedRiskScore: 0,
    }, DEFAULT_OFFENDING_CONFIG, citizenConfig.logicalSecondsPerTick)
    expect(higherRisk.none).toBeGreaterThan(lowerRisk.none)
    const higherReward = offenceChoiceProbabilities(profile, {
      ...opportunity, rewardScore: 1,
    }, DEFAULT_OFFENDING_CONFIG, citizenConfig.logicalSecondsPerTick)
    const lowerReward = offenceChoiceProbabilities(profile, {
      ...opportunity, rewardScore: 0,
    }, DEFAULT_OFFENDING_CONFIG, citizenConfig.logicalSecondsPerTick)
    expect(higherReward.none).toBeLessThan(lowerReward.none)
  })

  it('attributes a maximum of one deterministic offence to each citizen and applies cooldown', () => {
    const citizens = citizensAt(1)
    const saturated: OffendingConfig = {
      ...REVIEW_OFFENDING_CONFIG,
      baseOddsPerEligibleAgentHour: { minor: 10_000, serious: 10_000 },
      cooldownTicks: 3,
    }
    const profiles = createOffendingProfiles(environment.profiles, saturated)
    const initial = createInitialOffenderStates(profiles)
    const runId = createOffendingRunId(environment.runId, saturated)
    const first = generateOffencesForTick(
      city, citizens, profiles, initial, 1, citizenConfig.logicalSecondsPerTick, saturated, runId,
    )
    const repeated = generateOffencesForTick(
      city, [...citizens].reverse(), [...profiles].reverse(), [...initial].reverse(),
      1, citizenConfig.logicalSecondsPerTick, saturated, runId,
    )
    expect(first).toEqual(repeated)
    expect(first.offences.length).toBeGreaterThan(0)
    expect(new Set(first.offences.map((offence) => offence.offenderAgentId)).size)
      .toBe(first.offences.length)
    expect(new Set(first.offences.map((offence) => offence.id)).size).toBe(first.offences.length)
    const citizenById = new Map(citizens.map((citizen) => [citizen.id, citizen]))
    for (const offence of first.offences) {
      expect(offence.position).toEqual(citizenById.get(offence.offenderAgentId)?.position)
      expect(offence.opportunity.agentId).toBe(offence.offenderAgentId)
      expect(offence.type).toBe(offence.severity === 'minor' ? 'minorOffence' : 'seriousOffence')
      expect(offence.truthEventId).toContain(offence.id)
    }
    const second = generateOffencesForTick(
      city, citizens, profiles, first.offenderStates, 2, citizenConfig.logicalSecondsPerTick,
      saturated, runId,
    )
    for (const offence of first.offences) {
      expect(second.offences.some((next) => next.offenderAgentId === offence.offenderAgentId)).toBe(false)
    }
    expect(step(citizens, { ...saturated, baseOddsPerEligibleAgentHour: {
      minor: 0, serious: 0,
    } }).offences).toEqual([])
    expect(step(citizens.map((citizen) => ({ ...citizen, activity: 'atHome' as const })),
      saturated).offences).toEqual([])
  })
})
