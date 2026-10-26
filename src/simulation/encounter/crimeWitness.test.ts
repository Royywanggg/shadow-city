import { describe, expect, it } from 'vitest'
import { DEFAULT_OFFENDING_CONFIG } from '../offending/types'
import { offenceChoiceProbabilities } from '../offending/decision'
import type { OffendingProfile, OpportunitySnapshot } from '../offending/types'
import type { OffenceV5 } from '../v5Types'
import { assessWitnessesForOffence, createWitnessObservations,
  decideEncounterAwareOffence, DEFAULT_WITNESS_MODEL_CONFIG,
  resolveSubjectiveRecognitionV1, scheduleWitnessReports,
  validateWitnessModelConfig } from './crimeWitness'
import { createRecognitionTokenV1 } from './memory'
import type { AgentKnowledgeV1 } from './socialTypes'
import { projectObserverViewV5 } from './observerProjection'
import type { DirectedPerceptionSample, SpatialCandidateSample } from './spatialTypes'

const position = { x: 12_345, y: 250, z: 3_456 }
const offence: OffenceV5 = {
  id: 'offence-1', incidentId: 'incident-1', tick: 10, second: 3,
  offenderAgentId: 'actor', target: { kind: 'citizen', id: 'victim' },
  severity: 'minor', position, surfaceId: 'ground', levelId: 'L0',
  placeId: 'plaza', encounterId: 'episode-1', opportunity: {
    id: 'opportunity-1', offenderAgentId: 'actor',
    target: { kind: 'citizen', id: 'victim' }, surfaceId: 'ground',
    levelId: 'L0', placeId: 'plaza', position, exposureSeconds: 3,
    perceivedRisk: 0.2, guardianship: 1,
  },
}

function candidate(witnessId: string, second = 3): SpatialCandidateSample {
  return { pairKey: JSON.stringify(['actor', witnessId]),
    participantIds: ['actor', witnessId], second, distanceMm: 1_200,
    relation: 'sameSurface', surfaceId: 'ground', placeId: 'plaza',
    first: { agentId: 'actor', second, position, surfaceId: 'ground',
      placeId: 'plaza', edgeId: null },
    secondTrace: { agentId: witnessId, second,
      position: { x: position.x + 1_200, y: 250, z: position.z },
      surfaceId: 'ground', placeId: 'plaza', edgeId: null },
    firstSpeedMmPerSecond: 0, secondSpeedMmPerSecond: 0 }
}

function perception(witnessId: string, potentiallyVisible: boolean,
  actuallyPerceived: boolean): DirectedPerceptionSample {
  return { pairKey: JSON.stringify(['actor', witnessId]), second: 3,
    observerAgentId: witnessId, targetAgentId: 'actor', distanceMm: 1_200,
    physicallyNear: true, potentiallyVisible, actuallyPerceived,
    approximation: 'surface-portal-blocker-heading' }
}

describe('encounter-aware offending and witness information', () => {
  it('rejects invalid witness configuration at scenario construction time', () => {
    const base = DEFAULT_WITNESS_MODEL_CONFIG
    expect(() => validateWitnessModelConfig(base)).not.toThrow()
    for (const override of [
      { observationSeed: '' },
      { witnessRadiusMm: 0 }, { witnessRadiusMm: 1.5 },
      { reportDelayTicks: 0 }, { reportDelayTicks: 1.5 },
      { locationResolutionMm: 0 }, { locationResolutionMm: Number.POSITIVE_INFINITY },
      { eventPerceptionProbability: -0.1 },
      { victimPerceptionProbability: 1.1 },
      { reportingProbability: Number.NaN },
      { levelRecallProbability: -0.1 },
      { placeRecallProbability: 1.1 },
      { severityAccuracyProbability: Number.POSITIVE_INFINITY },
      { identityConfidenceThreshold: 1.01 },
    ]) {
      expect(() => validateWitnessModelConfig({ ...base, ...override })).toThrow(
        'Invalid witness model configuration')
    }
    expect(() => validateWitnessModelConfig({ ...base,
      eventPerceptionProbability: 0, victimPerceptionProbability: 1,
      reportingProbability: 0, identityConfidenceThreshold: 1 })).not.toThrow()
  })

  it('uses the existing independent offence choice model once per episode', () => {
    const profile: OffendingProfile = { agentId: 'actor', researchGroup: 'generalist',
      logPropensity: { minor: 0.1, serious: -0.2 },
      rewardSensitivity: 1, riskSensitivity: 1 }
    const opportunity: OpportunitySnapshot = {
      agentId: 'actor', tick: 10, position: { x: 12, y: 0, z: 3 },
      activity: 'travelling', pedestrianAnchor: { kind: 'publicAnchor', id: 'plaza' },
      blockId: 'block', district: 'civic', timeBand: 'day',
      nearbyCitizenIds: ['victim'], nearbyOutdoorCount: 1,
      exposureBySeverity: { minor: 0.5, serious: 0.2 },
      rewardScore: 0.4, perceivedRiskScore: 0.3,
    }
    const input = { encounterId: 'episode-1', profile, opportunity,
      config: DEFAULT_OFFENDING_CONFIG, exposureSeconds: 6 }
    const decision = decideEncounterAwareOffence(input)
    expect(decision.probabilities).toEqual(offenceChoiceProbabilities(profile,
      opportunity, DEFAULT_OFFENDING_CONFIG, 6))
    expect(decideEncounterAwareOffence(input)).toEqual(decision)
    expect(decideEncounterAwareOffence({ ...input, exposureSeconds: 60 })
      .probabilities.none).toBeLessThan(decision.probabilities.none)
    expect(decideEncounterAwareOffence({ ...input, opportunity: { ...opportunity,
      exposureBySeverity: { minor: 0, serious: 0 } } }).severity).toBeNull()
  })

  it('separates proximity, visibility, event perception, recognition and identity belief', () => {
    const config = { ...DEFAULT_WITNESS_MODEL_CONFIG,
      eventPerceptionProbability: 1, victimPerceptionProbability: 1 }
    const samples = [candidate('victim'), candidate('stranger'),
      candidate('blocked'), candidate('late', 4)]
    const perceptions = [perception('victim', true, true),
      perception('stranger', true, true), perception('blocked', false, false)]
    const assessments = assessWitnessesForOffence(offence, samples, perceptions,
      [{ ownerAgentId: 'victim', observedAgentId: 'actor',
        subjectToken: 'known-face-7', knowledgeId: 'knowledge-7',
        believedIdentity: 'someone-else', confidence: 0.7 }], config)
    expect(assessments.map((item) => item.witnessAgentId)).toEqual([
      'blocked', 'stranger', 'victim'])
    expect(assessments.find((item) => item.witnessAgentId === 'blocked')).toMatchObject({
      presentNearby: true, potentiallyAbleToObserve: false,
      actuallyPerceivedEvent: false, recognizedPerson: false,
      identifiedSuspect: false })
    expect(assessments.find((item) => item.witnessAgentId === 'stranger')).toMatchObject({
      potentiallyAbleToObserve: true, actuallyPerceivedEvent: true,
      recognizedPerson: false, identifiedSuspect: false,
      believedIdentity: null })
    expect(assessments.find((item) => item.witnessAgentId === 'victim')).toMatchObject({
      source: 'victim', actuallyPerceivedEvent: true,
      recognizedPerson: true, identifiedSuspect: true,
      believedIdentity: 'someone-else' })
    const weak = assessWitnessesForOffence(offence, [candidate('victim')],
      [perception('victim', true, true)],
      [{ ownerAgentId: 'victim', observedAgentId: 'actor',
        subjectToken: 'weak-face', knowledgeId: 'weak-knowledge',
        believedIdentity: 'uncertain', confidence: 0.2 }], config)
    expect(weak[0]).toMatchObject({ recognizedPerson: true,
      identifiedSuspect: false, believedIdentity: null })
  })

  it('requires prior owner-local visual knowledge before recognizing or naming someone', () => {
    const token = createRecognitionTokenV1('social-seed', 'victim', 'actor')
    const visual: AgentKnowledgeV1 = { id: 'visual-1', ownerAgentId: 'victim',
      kind: 'visualRecognition', subjectToken: token, acquiredTick: 5,
      source: 'interaction', provenanceId: 'social-1', confidence: 0.8,
      believedIdentity: null, expiresTick: null }
    const identity: AgentKnowledgeV1 = { ...visual, id: 'identity-1',
      kind: 'identityBelief', believedIdentity: 'claimed-name', confidence: 0.6 }
    expect(resolveSubjectiveRecognitionV1('victim', 'actor', [identity],
      'social-seed', 10)).toBeNull()
    expect(resolveSubjectiveRecognitionV1('victim', 'actor', [visual],
      'social-seed', 10)?.believedIdentity).toBeNull()
    expect(resolveSubjectiveRecognitionV1('victim', 'actor', [visual, identity],
      'social-seed', 10)).toMatchObject({ subjectToken: token,
      knowledgeId: 'visual-1', believedIdentity: 'claimed-name', confidence: 0.6 })
    expect(resolveSubjectiveRecognitionV1('victim', 'actor', [visual, identity],
      'social-seed', 4)).toBeNull()
  })

  it('counts a nearby but spatially blocked resident without inventing a witness', () => {
    const config = { ...DEFAULT_WITNESS_MODEL_CONFIG,
      eventPerceptionProbability: 1 }
    const traces = [
      { agentId: 'actor', second: 3, position, surfaceId: 'ground',
        placeId: 'plaza', edgeId: null },
      { agentId: 'behind-wall', second: 3,
        position: { x: position.x + 900, y: 250, z: position.z },
        surfaceId: 'closed-room', placeId: null, edgeId: null },
      { agentId: 'different-floor', second: 3,
        position: { x: position.x, y: 5_500, z: position.z },
        surfaceId: 'skybridge', placeId: null, edgeId: null },
    ]
    const assessments = assessWitnessesForOffence(offence, [], [], [],
      config, {}, traces)
    expect(assessments.map((item) => item.witnessAgentId)).toEqual([
      'behind-wall', 'different-floor'])
    expect(assessments.every((item) => item.presentNearby &&
      !item.potentiallyAbleToObserve && !item.actuallyPerceivedEvent)).toBe(true)
    expect(createWitnessObservations(offence, assessments, config)).toHaveLength(0)
  })

  it('creates reports from subjective observations with delay and no automatic truth identity', () => {
    const config = { ...DEFAULT_WITNESS_MODEL_CONFIG,
      eventPerceptionProbability: 1, victimPerceptionProbability: 1,
      reportingProbability: 1, levelRecallProbability: 1,
      placeRecallProbability: 1, severityAccuracyProbability: 1 }
    const assessed = assessWitnessesForOffence(offence,
      [candidate('victim'), candidate('stranger')],
      [perception('victim', true, true), perception('stranger', true, true)],
      [{ ownerAgentId: 'victim', observedAgentId: 'actor',
        subjectToken: 'face-1', knowledgeId: 'known-1',
        believedIdentity: 'uncertain-person', confidence: 0.6 }], config)
    const observations = createWitnessObservations(offence, assessed, config)
    expect(observations).toHaveLength(2)
    expect(observations.find((item) => item.ownerAgentId === 'stranger')?.believedIdentity).toBeNull()
    const scheduled = scheduleWitnessReports(observations, config)
    expect(scheduled).toHaveLength(2)
    expect(scheduled.every((item) => item.report.availableTick === 12)).toBe(true)
    expect(scheduled.find((item) => item.reporterAgentId === 'stranger')?.report.suspect)
      .toEqual({ status: 'unknown' })
    expect(scheduled.find((item) => item.reporterAgentId === 'victim')?.report.suspect)
      .toEqual({ status: 'nameClaim', claimedName: 'uncertain-person',
        verification: 'unverified' })
    expect(scheduled.some((item) => item.report.suspect.status === 'namedLead')).toBe(false)
  })

  it('projects only delivered, allowlisted report fields with detached immutable objects', () => {
    const malicious = { id: 'report-1', availableTick: 3,
      reportedOccurrenceTick: 1, reportedPosition: { x: 0, y: 0, z: 0 },
      reportedLevelId: 'L0', reportedPlaceId: null,
      reportedSeverity: 'minor' as const,
      suspect: { status: 'unknown' as const },
      source: 'witness' as const, offenderAgentId: 'secret',
      privateMemory: { trueIdentity: 'secret' } }
    const future = { ...malicious, id: 'report-future', availableTick: 4 }
    const projected = projectObserverViewV5({ tick: 3, reports: [malicious, future] })
    expect(projected.reports).toHaveLength(1)
    expect(projected.reports[0]).toEqual({ id: 'report-1', availableTick: 3,
      reportedOccurrenceTick: 1, reportedPosition: { x: 0, y: 0, z: 0 },
      reportedLevelId: 'L0', reportedPlaceId: null,
      reportedSeverity: 'minor', suspect: { status: 'unknown' }, source: 'witness' })
    expect(Object.isFrozen(projected.reports)).toBe(true)
    expect(Object.isFrozen(projected.reports[0].reportedPosition)).toBe(true)
    expect(projected.reports[0]).not.toBe(malicious)
    const nameClaim = projectObserverViewV5({ tick: 3, reports: [{ ...malicious,
      id: 'name-claim', suspect: { status: 'nameClaim' as const,
        claimedName: 'a possible name', verification: 'unverified' as const } }] })
    expect(nameClaim.reports[0].suspect).toEqual({ status: 'nameClaim',
      claimedName: 'a possible name', verification: 'unverified' })
  })
})
