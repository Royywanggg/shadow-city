import { hashSeed } from '../rng'
import { offenceChoiceProbabilities, type OffenceChoiceProbabilities } from '../offending/decision'
import type { OffendingConfig, OffendingProfile, OpportunitySnapshot } from '../offending/types'
import type { MovementTracePoint, OffenceV5, ReportV5 } from '../v5Types'
import { createRecognitionTokenV1 } from './memory'
import type { AgentKnowledgeV1 } from './socialTypes'
import type { DirectedPerceptionSample, SpatialCandidateSample } from './spatialTypes'

const keyedUnit = (key: string): number => (hashSeed(key) + 0.5) / 0x1_0000_0000

/** The existing offender choice model is evaluated once per distinct opportunity episode. */
export function decideEncounterAwareOffence(input: Readonly<{
  encounterId: string
  profile: OffendingProfile
  opportunity: OpportunitySnapshot
  config: OffendingConfig
  exposureSeconds: number
}>): Readonly<{ severity: 'minor' | 'serious' | null;
  probabilities: OffenceChoiceProbabilities; draw: number }> {
  if (!input.encounterId || !Number.isSafeInteger(input.exposureSeconds) ||
    input.exposureSeconds <= 0) throw new Error('Invalid encounter offence decision')
  const probabilities = offenceChoiceProbabilities(input.profile, input.opportunity,
    input.config, input.exposureSeconds)
  const draw = keyedUnit(`${input.config.offendingSeed}:encounter-choice:${input.encounterId}`)
  const severity = draw < probabilities.none ? null :
    draw < probabilities.none + probabilities.minor ? 'minor' : 'serious'
  return Object.freeze({ severity, probabilities, draw })
}

export interface WitnessModelConfig {
  readonly observationSeed: string
  readonly witnessRadiusMm: number
  readonly eventPerceptionProbability: number
  readonly victimPerceptionProbability: number
  readonly reportingProbability: number
  readonly reportDelayTicks: number
  readonly locationResolutionMm: number
  readonly levelRecallProbability: number
  readonly placeRecallProbability: number
  readonly severityAccuracyProbability: number
  readonly identityConfidenceThreshold: number
}

export const DEFAULT_WITNESS_MODEL_CONFIG: WitnessModelConfig = Object.freeze({
  observationSeed: 'shadow-city-observation-01',
  witnessRadiusMm: 12_000,
  eventPerceptionProbability: 0.28,
  victimPerceptionProbability: 0.82,
  reportingProbability: 0.6,
  reportDelayTicks: 2,
  locationResolutionMm: 2_000,
  levelRecallProbability: 0.8,
  placeRecallProbability: 0.72,
  severityAccuracyProbability: 0.9,
  identityConfidenceThreshold: 0.6,
})

/** A known visual token is owner-local; the believed identity may be wrong. */
export interface SubjectiveRecognition {
  readonly ownerAgentId: string
  readonly observedAgentId: string
  readonly subjectToken: string
  readonly knowledgeId: string
  readonly believedIdentity: string | null
  readonly confidence: number
}

/** Match an observed person to owner-local knowledge without copying a truth ID into memory. */
export function resolveSubjectiveRecognitionV1(ownerAgentId: string,
  observedAgentId: string, knowledge: readonly AgentKnowledgeV1[],
  socialSeed: string, tick: number): SubjectiveRecognition | null {
  const token = createRecognitionTokenV1(socialSeed, ownerAgentId, observedAgentId)
  const current = knowledge.filter((item) => item.ownerAgentId === ownerAgentId &&
    item.subjectToken === token && item.acquiredTick <= tick &&
    (item.expiresTick === null || item.expiresTick > tick))
  const visual = current.filter((item) => item.kind === 'visualRecognition' &&
    item.confidence > 0).sort((a, b) => b.confidence - a.confidence ||
    b.acquiredTick - a.acquiredTick || a.id.localeCompare(b.id))[0]
  if (!visual) return null
  const identity = current.filter((item) => item.kind === 'identityBelief' &&
    item.believedIdentity && item.confidence > 0).sort((a, b) =>
    b.confidence - a.confidence || b.acquiredTick - a.acquiredTick ||
    a.id.localeCompare(b.id))[0]
  return Object.freeze({ ownerAgentId, observedAgentId, subjectToken: token,
    knowledgeId: visual.id,
    believedIdentity: identity?.believedIdentity ?? null,
    confidence: Math.min(visual.confidence, identity?.confidence ?? 1) })
}

export interface WitnessAssessment {
  readonly offenceId: string
  readonly witnessAgentId: string
  readonly source: 'victim' | 'witness'
  readonly second: number
  readonly distanceMm: number
  readonly presentNearby: true
  readonly potentiallyAbleToObserve: boolean
  readonly actuallyPerceivedEvent: boolean
  readonly recognizedPerson: boolean
  readonly identifiedSuspect: boolean
  readonly subjectToken: string | null
  readonly believedIdentity: string | null
  readonly knowledgeId: string | null
  readonly recognitionConfidence: number | null
}

export interface WitnessObservation {
  readonly id: string
  readonly ownerAgentId: string
  readonly source: 'victim' | 'witness'
  /** Internal provenance only; never project this field to ObserverPort. */
  readonly offenceId: string
  readonly observedTick: number
  readonly observedSecond: number
  readonly perceivedPosition: Readonly<{ x: number; y: number; z: number }>
  readonly perceivedLevelId: string | null
  readonly perceivedPlaceId: string | null
  readonly perceivedSeverity: 'minor' | 'serious'
  readonly subjectToken: string | null
  readonly believedIdentity: string | null
  readonly recognitionKnowledgeId: string | null
  readonly confidence: number
}

/** The link to ground truth stays in simulation state, outside the public report. */
export interface ScheduledWitnessReport {
  readonly offenceId: string
  readonly reporterAgentId: string
  readonly source: 'victim' | 'witness'
  readonly report: WitnessReportV5
}

export interface WitnessReportV5 extends ReportV5 {
  readonly source: 'victim' | 'witness'
}

export function validateWitnessModelConfig(config: WitnessModelConfig): void {
  const probabilities = [config.eventPerceptionProbability,
    config.victimPerceptionProbability, config.reportingProbability,
    config.levelRecallProbability, config.placeRecallProbability,
    config.severityAccuracyProbability, config.identityConfidenceThreshold]
  if (!config.observationSeed || !Number.isSafeInteger(config.witnessRadiusMm) ||
    config.witnessRadiusMm <= 0 || !Number.isSafeInteger(config.reportDelayTicks) ||
    config.reportDelayTicks < 1 || !Number.isSafeInteger(config.locationResolutionMm) ||
    config.locationResolutionMm <= 0 || probabilities.some((value) =>
    !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error('Invalid witness model configuration')
  }
}

/** Evaluate the event at its actual second, using spatially legal candidates. */
export function assessWitnessesForOffence(offence: OffenceV5,
  candidates: readonly SpatialCandidateSample[],
  perceptions: readonly DirectedPerceptionSample[],
  recognition: readonly SubjectiveRecognition[],
  config: WitnessModelConfig,
  attentionByAgentId: Readonly<Record<string, number>> = {},
  offenceSecondTraces?: readonly MovementTracePoint[]): readonly WitnessAssessment[] {
  validateWitnessModelConfig(config)
  if (!Number.isSafeInteger(offence.second) || offence.second < 1) {
    throw new Error('Offence requires a valid within-tick second')
  }
  const perceptionByWitness = new Map(perceptions.filter((sample) =>
    sample.second === offence.second && sample.targetAgentId === offence.offenderAgentId)
    .map((sample) => [sample.observerAgentId, sample]))
  const recognitionByWitness = new Map(recognition.filter((item) =>
    item.observedAgentId === offence.offenderAgentId && item.knowledgeId &&
    item.subjectToken && Number.isFinite(item.confidence) &&
    item.confidence >= 0 && item.confidence <= 1)
    .map((item) => [item.ownerAgentId, item]))
  const legalCandidateByWitness = new Map<string, SpatialCandidateSample>()
  for (const candidate of candidates) {
    if (candidate.second !== offence.second ||
      !candidate.participantIds.includes(offence.offenderAgentId)) continue
    const offenderTrace = candidate.first.agentId === offence.offenderAgentId ?
      candidate.first : candidate.secondTrace
    if (offenderTrace.surfaceId !== offence.surfaceId) continue
    const witnessId = candidate.first.agentId === offence.offenderAgentId ?
      candidate.secondTrace.agentId : candidate.first.agentId
    const prior = legalCandidateByWitness.get(witnessId)
    if (!prior || candidate.distanceMm < prior.distanceMm) {
      legalCandidateByWitness.set(witnessId, candidate)
    }
  }
  const nearby = offenceSecondTraces ? offenceSecondTraces.filter((trace) =>
    trace.second === offence.second && trace.agentId !== offence.offenderAgentId)
    .map((trace) => ({ witnessId: trace.agentId,
      distanceMm: Math.round(Math.hypot(trace.position.x - offence.position.x,
        trace.position.y - offence.position.y, trace.position.z - offence.position.z)) })) :
    [...legalCandidateByWitness].map(([witnessId, candidate]) => ({ witnessId,
      distanceMm: candidate.distanceMm }))
  const byWitness = new Map<string, WitnessAssessment>()
  for (const { witnessId, distanceMm } of nearby) {
    if (distanceMm > config.witnessRadiusMm) continue
    const prior = byWitness.get(witnessId)
    if (prior && prior.distanceMm <= distanceMm) continue
    const legalCandidate = legalCandidateByWitness.get(witnessId)
    const perception = perceptionByWitness.get(witnessId)
    const potential = legalCandidate !== undefined &&
      perception?.potentiallyVisible === true
    const source = offence.target.kind === 'citizen' &&
      offence.target.id === witnessId ? 'victim' : 'witness'
    const attention = attentionByAgentId[witnessId] ?? 1
    if (!Number.isFinite(attention) || attention < 0 || attention > 1) {
      throw new Error('Witness attention must be within [0, 1]')
    }
    const perceptionProbability = source === 'victim' ?
      config.victimPerceptionProbability : config.eventPerceptionProbability
    const nearRadius = Math.min(config.witnessRadiusMm, 2_000)
    const distanceFactor = distanceMm <= nearRadius ? 1 : Math.max(0,
      1 - (distanceMm - nearRadius) / (config.witnessRadiusMm - nearRadius))
    const perceived = potential && keyedUnit(`${config.observationSeed}:event-perception:${offence.id}:${witnessId}`) <
      perceptionProbability * attention * distanceFactor
    const known = recognitionByWitness.get(witnessId)
    const recognized = perceived && perception?.actuallyPerceived === true && known !== undefined
    const identified = recognized && known!.believedIdentity !== null &&
      known!.confidence >= config.identityConfidenceThreshold
    byWitness.set(witnessId, Object.freeze({ offenceId: offence.id,
      witnessAgentId: witnessId, source, second: offence.second,
      distanceMm, presentNearby: true,
      potentiallyAbleToObserve: potential, actuallyPerceivedEvent: perceived,
      recognizedPerson: recognized, identifiedSuspect: identified,
      subjectToken: recognized ? known!.subjectToken : null,
      believedIdentity: identified ? known!.believedIdentity : null,
      knowledgeId: recognized ? known!.knowledgeId : null,
      recognitionConfidence: recognized ? known!.confidence : null }))
  }
  return [...byWitness.values()].sort((a, b) =>
    a.witnessAgentId.localeCompare(b.witnessAgentId))
}

/** Subjective observations are created only for people who perceived the event. */
export function createWitnessObservations(offence: OffenceV5,
  assessments: readonly WitnessAssessment[],
  config: WitnessModelConfig): readonly WitnessObservation[] {
  validateWitnessModelConfig(config)
  const round = (value: number) => Math.round(value / config.locationResolutionMm) *
    config.locationResolutionMm
  return assessments.filter((assessment) => assessment.offenceId === offence.id &&
    assessment.actuallyPerceivedEvent).map((assessment) => {
    const key = `${config.observationSeed}:observation:${offence.id}:${assessment.witnessAgentId}`
    const severityIsAccurate = keyedUnit(`${key}:severity`) < config.severityAccuracyProbability
    return Object.freeze({ id: `witness-observation:${offence.id}:${assessment.witnessAgentId}`,
      ownerAgentId: assessment.witnessAgentId, source: assessment.source,
      offenceId: offence.id, observedTick: offence.tick, observedSecond: offence.second,
      perceivedPosition: Object.freeze({ x: round(offence.position.x),
        y: round(offence.position.y), z: round(offence.position.z) }),
      perceivedLevelId: keyedUnit(`${key}:level`) < config.levelRecallProbability ?
        offence.levelId : null,
      perceivedPlaceId: keyedUnit(`${key}:place`) < config.placeRecallProbability ?
        offence.placeId : null,
      perceivedSeverity: severityIsAccurate ? offence.severity :
        offence.severity === 'minor' ? 'serious' : 'minor',
      subjectToken: assessment.subjectToken,
      believedIdentity: assessment.identifiedSuspect ? assessment.believedIdentity : null,
      recognitionKnowledgeId: assessment.knowledgeId,
      confidence: assessment.identifiedSuspect ?
        Math.min(0.75, assessment.recognitionConfidence ?? 0) : 0.45 })
  })
}

/** Report payloads are derived from witness-local observations, never directly from truth. */
export function scheduleWitnessReports(observations: readonly WitnessObservation[],
  config: WitnessModelConfig): readonly ScheduledWitnessReport[] {
  validateWitnessModelConfig(config)
  const reports: ScheduledWitnessReport[] = []
  for (const observation of observations) {
    if (keyedUnit(`${config.observationSeed}:report:${observation.id}`) >=
      config.reportingProbability) continue
    const first = hashSeed(`${config.observationSeed}:opaque-a:${observation.id}`)
    const second = hashSeed(`${observation.id}:opaque-b:${config.observationSeed}`)
    const publicId = `report:${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
    const report: WitnessReportV5 = Object.freeze({ id: publicId,
      availableTick: observation.observedTick + config.reportDelayTicks,
      reportedOccurrenceTick: observation.observedTick,
      reportedPosition: Object.freeze({ ...observation.perceivedPosition }),
      reportedLevelId: observation.perceivedLevelId,
      reportedPlaceId: observation.perceivedPlaceId,
      reportedSeverity: observation.perceivedSeverity,
      source: observation.source,
      suspect: observation.believedIdentity ? Object.freeze({ status: 'nameClaim' as const,
        claimedName: observation.believedIdentity,
        verification: 'unverified' as const }) : Object.freeze({ status: 'unknown' as const }) })
    reports.push(Object.freeze({ offenceId: observation.offenceId,
      reporterAgentId: observation.ownerAgentId, source: observation.source, report }))
  }
  return reports.sort((a, b) => a.report.id.localeCompare(b.report.id))
}
