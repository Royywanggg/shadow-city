import { createRandomStream, nextRandom } from '../rng'
import type {
  ObservationConfigV4,
  ObservationRecordV4,
  PrivateIdentityOutcomeV4,
  ReportableOccurrenceV4,
  ReportingOutcomeV4,
  ReportingStateV4,
} from './v4Types'

function sample(seed: string, incidentId: string, purpose: string): number {
  return nextRandom(createRandomStream(seed, `v0.5-observation:${purpose}:${incidentId}`)).value
}

function probability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function validateObservationConfigV4(config: ObservationConfigV4): void {
  if (config.version !== 'offender-reporting-v1' || !config.observationSeed?.trim() ||
      !probability(config.globalProbability) ||
      ![config.severityExponent.minor, config.severityExponent.serious]
        .every((value) => Number.isFinite(value) && value > 0) ||
      !Number.isSafeInteger(config.minDelayTicks) || config.minDelayTicks < 0 ||
      !Number.isSafeInteger(config.maxDelayTicks) || config.maxDelayTicks < config.minDelayTicks ||
      !Number.isSafeInteger(config.ingestDelayTicks) || config.ingestDelayTicks < 0 ||
      !Number.isSafeInteger(config.maxDelayTicks + config.ingestDelayTicks) ||
      !probability(config.identity.noticeProbability) ||
      !probability(config.identity.recognitionProbability) ||
      !probability(config.identity.accuracyProbability)) {
    throw new Error('Invalid v4 observation configuration')
  }
}

export function effectiveReportingProbabilityV4(
  config: ObservationConfigV4,
  severity: ReportableOccurrenceV4['severity'],
): number {
  validateObservationConfigV4(config)
  if (severity !== 'minor' && severity !== 'serious') throw new Error('Invalid v4 offence severity')
  return 1 - (1 - config.globalProbability) ** config.severityExponent[severity]
}

export function createInitialReportingStateV4(): ReportingStateV4 {
  return { outcomes: [], records: [], nextReportOrdinal: 0 }
}

function assertOccurrence(occurrence: ReportableOccurrenceV4, tick: number): void {
  if (!occurrence.id || !occurrence.offenceId || !occurrence.offenderAgentId || !occurrence.blockId ||
      !Number.isSafeInteger(occurrence.occurrenceTick) || occurrence.occurrenceTick < 1 ||
      occurrence.occurrenceTick > tick ||
      ![occurrence.position.x, occurrence.position.y, occurrence.position.z].every(Number.isFinite) ||
      (occurrence.severity !== 'minor' && occurrence.severity !== 'serious') ||
      !['civic', 'core', 'residential', 'works'].includes(occurrence.district) ||
      occurrence.nearbyCitizenIds.some((id) => !id || id === occurrence.offenderAgentId) ||
      new Set(occurrence.nearbyCitizenIds).size !== occurrence.nearbyCitizenIds.length) {
    throw new Error('Invalid v4 reportable occurrence')
  }
}

/** A synthetic witness can name a candidate only when another nearby citizen exists. */
export function decideIdentityLeadV4(
  occurrence: ReportableOccurrenceV4,
  config: ObservationConfigV4,
): PrivateIdentityOutcomeV4 {
  validateObservationConfigV4(config)
  assertOccurrence(occurrence, occurrence.occurrenceTick)
  const nearby = [...occurrence.nearbyCitizenIds].sort(compareIds)
  if (nearby.length === 0 ||
      sample(config.observationSeed, occurrence.id, 'notice') >= config.identity.noticeProbability ||
      sample(config.observationSeed, occurrence.id, 'recognition') >= config.identity.recognitionProbability) {
    return { status: 'unknown' }
  }
  const witnessIndex = Math.floor(sample(config.observationSeed, occurrence.id, 'witness') * nearby.length)
  const witnessAgentId = nearby[witnessIndex]
  if (sample(config.observationSeed, occurrence.id, 'accuracy') < config.identity.accuracyProbability) {
    return {
      status: 'namedLead',
      candidateAgentId: occurrence.offenderAgentId,
      witnessAgentId,
      accurate: true,
    }
  }
  const falseCandidates = nearby.filter((id) => id !== witnessAgentId)
  if (falseCandidates.length === 0) return { status: 'unknown' }
  const falseIndex = Math.floor(sample(config.observationSeed, occurrence.id, 'falseCandidate') * falseCandidates.length)
  return {
    status: 'namedLead',
    candidateAgentId: falseCandidates[falseIndex],
    witnessAgentId,
    accurate: false,
  }
}

/** Both decisions are keyed by incident ID; changing only probability cannot alter truth. */
export function decideReportingOutcomeV4(
  occurrence: ReportableOccurrenceV4,
  config: ObservationConfigV4,
): ReportingOutcomeV4 {
  assertOccurrence(occurrence, occurrence.occurrenceTick)
  const p = effectiveReportingProbabilityV4(config, occurrence.severity)
  if (sample(config.observationSeed, occurrence.id, 'reportDecision') >= p) {
    return { status: 'notReported', incidentId: occurrence.id, decisionTick: occurrence.occurrenceTick }
  }
  const delayRange = config.maxDelayTicks - config.minDelayTicks + 1
  const delay = config.minDelayTicks + Math.floor(sample(config.observationSeed, occurrence.id, 'delay') * delayRange)
  const createdTick = occurrence.occurrenceTick + delay
  const availableTick = createdTick + config.ingestDelayTicks
  if (!Number.isSafeInteger(createdTick) || !Number.isSafeInteger(availableTick)) {
    throw new Error('V4 report arrival exceeds the simulation tick range')
  }
  return {
    status: 'scheduled',
    incidentId: occurrence.id,
    decisionTick: occurrence.occurrenceTick,
    createdTick,
    availableTick,
    identity: decideIdentityLeadV4(occurrence, config),
  }
}

export interface ReportingTransitionV4 {
  readonly state: ReportingStateV4
  readonly newlyAvailable: readonly ObservationRecordV4[]
}

export function stepReportingV4(
  previous: ReportingStateV4,
  allOccurrences: readonly ReportableOccurrenceV4[],
  newOccurrences: readonly ReportableOccurrenceV4[],
  config: ObservationConfigV4,
  tick: number,
): ReportingTransitionV4 {
  validateObservationConfigV4(config)
  if (!Number.isSafeInteger(tick) || tick < 1 ||
      !Number.isSafeInteger(previous.nextReportOrdinal) || previous.nextReportOrdinal < 0 ||
      previous.nextReportOrdinal !== previous.records.length) {
    throw new Error('Invalid v4 reporting state or tick')
  }
  const byId = new Map<string, ReportableOccurrenceV4>()
  for (const occurrence of allOccurrences) {
    assertOccurrence(occurrence, tick)
    if (byId.has(occurrence.id)) throw new Error('Duplicate v4 occurrence ID')
    byId.set(occurrence.id, occurrence)
  }
  const accountedFor = new Set<string>()
  for (const outcome of previous.outcomes) {
    if (accountedFor.has(outcome.incidentId) || !byId.has(outcome.incidentId)) {
      throw new Error('Invalid previous v4 reporting outcome')
    }
    accountedFor.add(outcome.incidentId)
  }
  const orderedNew = [...newOccurrences].sort((a, b) => compareIds(a.id, b.id))
  const newOutcomes = orderedNew.map((occurrence) => {
    if (occurrence.occurrenceTick !== tick || !byId.has(occurrence.id) || accountedFor.has(occurrence.id)) {
      throw new Error('Invalid newly occurred v4 incident')
    }
    accountedFor.add(occurrence.id)
    return decideReportingOutcomeV4(occurrence, config)
  })
  if (accountedFor.size !== byId.size) throw new Error('Missing v4 reporting outcome')

  const outcomes = [...previous.outcomes, ...newOutcomes]
  const due = outcomes.filter((outcome): outcome is Extract<ReportingOutcomeV4, { status: 'scheduled' }> =>
    outcome.status === 'scheduled' && outcome.availableTick <= tick)
    .sort((a, b) => a.availableTick - b.availableTick ||
      byId.get(a.incidentId)!.occurrenceTick - byId.get(b.incidentId)!.occurrenceTick ||
      compareIds(a.incidentId, b.incidentId))

  const delivered = new Map<string, Extract<ReportingOutcomeV4, { status: 'available' }>>()
  const newlyAvailable: ObservationRecordV4[] = []
  let nextReportOrdinal = previous.nextReportOrdinal
  for (const outcome of due) {
    const occurrence = byId.get(outcome.incidentId)!
    const reportId = `report-${String(++nextReportOrdinal).padStart(6, '0')}`
    const evidenceId = `evidence-${reportId}`
    const identity = outcome.identity
    delivered.set(outcome.incidentId, { ...outcome, status: 'available', reportId })
    newlyAvailable.push({
      reportId,
      reportedOccurrenceTick: occurrence.occurrenceTick,
      availableTick: outcome.availableTick,
      reportedPosition: { ...occurrence.position },
      reportedBlockId: occurrence.blockId,
      reportedDistrict: occurrence.district,
      reportedType: occurrence.severity === 'minor' ? 'minorOffence' : 'seriousOffence',
      reportedSeverity: occurrence.severity,
      suspect: identity.status === 'namedLead' ? {
        status: 'namedLead',
        candidateAgentId: identity.candidateAgentId,
        evidenceIds: [evidenceId],
        availableTick: outcome.availableTick,
        verification: 'unverified',
      } : { status: 'unknown' },
      evidenceRefs: identity.status === 'namedLead'
        ? [{ id: evidenceId, kind: 'syntheticWitnessStatement', availableTick: outcome.availableTick }]
        : [],
    })
  }
  return {
    state: {
      outcomes: outcomes.map((outcome) => delivered.get(outcome.incidentId) ?? outcome),
      records: [...previous.records, ...newlyAvailable],
      nextReportOrdinal,
    },
    newlyAvailable,
  }
}
