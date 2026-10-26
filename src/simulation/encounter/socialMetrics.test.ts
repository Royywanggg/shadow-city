import { describe, expect, it } from 'vitest'
import { createCitizenIdentity } from '../population'
import type { SimulationStateV5 } from '../v5Types'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../v5Types'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from './config'
import type { SocialEncounterEpisode } from './lifecycle'
import { createInitialSocialStateV1 } from './state'
import type { SocialStateV1 } from './state'
import { summarizeSocialMetricsV1 } from './socialMetrics'

const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 3,
  encounter: DEFAULT_ENCOUNTER_SCENARIO_V1 }
const pair: readonly [string, string] = ['citizen-1', 'citizen-2']
const episode = (id: string, startedTick: number,
  status: 'active' | 'ended', placeId: string | null,
  contactSeconds: number): SocialEncounterEpisode => ({
  id, pairKey: JSON.stringify(pair), participantIds: pair,
  startedTick, startedSecond: 1,
  endedTick: status === 'ended' ? startedTick + 1 : null,
  endedSecond: status === 'ended' ? 6 : null,
  status, contactSeconds, proximityDurationTicks: 1,
  lastContactGlobalSecond: startedTick * 6,
  minDistanceMm: 800, surfaceId: 'ground', placeId,
  perceivedBy: pair, interactionIds: [],
})

function state(tick: number, social: ReturnType<typeof createInitialSocialStateV1>,
  extras: Partial<SimulationStateV5> = {}): SimulationStateV5 {
  return { version: 5, fingerprint: 'same-fingerprint', tick,
    citizens: pair.concat('citizen-3').map((id) => ({ id })) as unknown as
      SimulationStateV5['citizens'],
    social, offences: [], reports: [], ...extras } as SimulationStateV5
}

describe('state-derived scientific metrics', () => {
  it('distinguishes repeated episodes from unique pairs and right-censored duration', () => {
    const social = { ...createInitialSocialStateV1(),
      encounters: { pending: [], active: [episode('second', 7, 'active', 'cafe', 18)],
        completed: [episode('first', 2, 'ended', 'plaza', 4)], cooldownUntilSecond: {} },
      metrics: { ...createInitialSocialStateV1().metrics,
        candidatePairSeconds: 40, perceivedPairSeconds: 25 },
      relationships: [{ ownerAgentId: 'citizen-1', referentAgentId: 'citizen-2',
        subjectToken: 'person-0000000000000001', familiarity: 0.6,
        recognitionStrength: 0.7, trust: 0.6, encounterCount: 2,
        greetingCount: 1, conversationCount: 2, lastEncounterTick: 7,
        lastUpdatedTick: 10, believedIdentity: null }],
    }
    const result = summarizeSocialMetricsV1(state(10, social), config)
    expect(result.exposure.candidatePairSeconds).toBe(40)
    expect(result.exposure.encounterEpisodes).toBe(2)
    expect(result.exposure.uniqueEncounterPairs).toBe(1)
    expect(result.exposure.repeatedPairsWithinInterval).toBe(1)
    expect(result.exposure.additionalEpisodesForRepeatedPairs).toBe(1)
    expect(result.exposure.completedEpisodeDurationsSeconds).toEqual([{ key: '4', count: 1 }])
    expect(result.exposure.rightCensoredEpisodes).toBe(1)
    expect(result.exposure.uniqueContactsPerAgent).toEqual([
      { agentId: 'citizen-1', count: 1 }, { agentId: 'citizen-2', count: 1 },
      { agentId: 'citizen-3', count: 0 },
    ])
    expect(result.exposure.encountersByLastRecordedPlace).toEqual([
      { placeId: 'cafe', count: 1 }, { placeId: 'plaza', count: 1 },
    ])
    expect(result.exposure.encountersByStartHour).toEqual([{ key: '08', count: 2 }])
    expect(result.network.knownContactDirectedTies).toBe(1)
    expect(result.network.knownContactDensity).toBeCloseTo(1 / 6)
    expect(result.network.familiarityDistribution.reduce((sum, item) =>
      sum + item.count, 0)).toBe(6)
    const prior = state(5, { ...createInitialSocialStateV1(),
      metrics: { ...createInitialSocialStateV1().metrics,
        candidatePairSeconds: 15, perceivedPairSeconds: 9 } })
    const interval = summarizeSocialMetricsV1(state(10, social), config, prior)
    expect(interval.interval.fromTick).toBe(6)
    expect(interval.exposure.candidatePairSeconds).toBe(25)
    expect(interval.exposure.encounterEpisodes).toBe(1)
    expect(interval.exposure.repeatedPairsWithinInterval).toBe(0)
  })

  it('uses delivered reports and truth names, keeping opportunities distinct from offences', () => {
    const truthName = createCitizenIdentity('citizen-1').displayName
    const offences = [
      { id: 'offence-1', tick: 7, offenderAgentId: 'citizen-1',
        target: { kind: 'citizen', id: 'citizen-2' }, placeId: 'cafe' },
      { id: 'offence-2', tick: 9, offenderAgentId: 'citizen-1',
        target: { kind: 'placeResource', id: 'resource-1' }, placeId: 'mall' },
    ] as unknown as SimulationStateV5['offences']
    const social = { ...createInitialSocialStateV1(),
      metrics: { ...createInitialSocialStateV1().metrics,
        opportunitySeconds: 100, offenderAttempts: 3 },
      witnessObservations: [
        { id: 'observation-1', ownerAgentId: 'citizen-2', source: 'witness',
          offenceId: 'offence-1', observedTick: 7, believedIdentity: truthName },
        { id: 'observation-2', ownerAgentId: 'citizen-3', source: 'witness',
          offenceId: 'offence-1', observedTick: 7, believedIdentity: 'Wrong Name' },
        { id: 'observation-3', ownerAgentId: 'citizen-2', source: 'victim',
          offenceId: 'offence-2', observedTick: 9, believedIdentity: null },
      ] as unknown as SocialStateV1['witnessObservations'],
      reportLinks: [{ offenceId: 'offence-1', reportId: 'report-delivered' },
        { offenceId: 'offence-2', reportId: 'report-pending' }],
    }
    const reports = [{ id: 'report-delivered', availableTick: 8 }] as
      unknown as SimulationStateV5['reports']
    const result = summarizeSocialMetricsV1(state(10, social,
      { offences, reports }), config)
    expect(result.perception.identification).toEqual({ correct: 1, incorrect: 1, unknown: 1 })
    expect(result.perception.actualWitnessObservations).toBe(2)
    expect(result.perception.victimObservations).toBe(1)
    expect(result.crime.completedOffences).toBe(2)
    expect(result.crime.opportunitySeconds).toBe(100)
    expect(result.crime.offenderAttempts).toBe(3)
    expect(result.crime.offencesPer1000OpportunitySeconds).toBe(20)
    expect(result.crime.opportunityEpisodeConversion).toBeNull()
    expect(result.crime.citizenTargetOffences).toBe(1)
    expect(result.crime.witnessedOffences).toBe(1)
    expect(result.crime.reportedOffences).toBe(1)
    expect(result.crime.unreportedOffences).toBe(1)
    expect(result.crime.deliveredReports).toBe(1)
  })
})
