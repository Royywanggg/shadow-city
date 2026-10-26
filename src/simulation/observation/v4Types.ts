import type { DistrictKind } from '../../city/model'
import type { WorldPosition } from '../types'
import type { IncidentSeverity } from '../v3Types'

export type OffenceCategoryV4 = 'minorOffence' | 'seriousOffence'
export type BehaviourGroupV4 = 'minorSpecialist' | 'seriousSpecialist' | 'generalist'

export interface ObservationConfigV4 {
  readonly version: 'offender-reporting-v1'
  readonly observationSeed: string
  /** Synthetic baseline probability, not an empirically estimated reporting rate. */
  readonly globalProbability: number
  readonly severityExponent: Readonly<Record<IncidentSeverity, number>>
  readonly minDelayTicks: number
  readonly maxDelayTicks: number
  readonly ingestDelayTicks: number
  readonly identity: Readonly<{
    noticeProbability: number
    recognitionProbability: number
    accuracyProbability: number
  }>
}

/** Private adapter from offender-world facts to the observation process. */
export interface ReportableOccurrenceV4 {
  readonly id: string
  readonly offenceId: string
  readonly occurrenceTick: number
  readonly position: Readonly<WorldPosition>
  readonly blockId: string
  readonly district: DistrictKind
  readonly severity: IncidentSeverity
  readonly offenderAgentId: string
  /** Sorted, distinct outdoor citizens near the offence; excludes its offender. */
  readonly nearbyCitizenIds: readonly string[]
}

export type PrivateIdentityOutcomeV4 =
  | Readonly<{ status: 'unknown' }>
  | Readonly<{
      status: 'namedLead'
      candidateAgentId: string
      witnessAgentId: string
      accurate: boolean
    }>

export type ReportingOutcomeV4 =
  | Readonly<{
      status: 'notReported'
      incidentId: string
      decisionTick: number
    }>
  | Readonly<{
      status: 'scheduled'
      incidentId: string
      decisionTick: number
      createdTick: number
      availableTick: number
      identity: PrivateIdentityOutcomeV4
    }>
  | Readonly<{
      status: 'available'
      incidentId: string
      decisionTick: number
      createdTick: number
      availableTick: number
      reportId: string
      identity: PrivateIdentityOutcomeV4
    }>

export interface PublicEvidenceRefV4 {
  readonly id: string
  readonly kind: 'syntheticWitnessStatement'
  readonly availableTick: number
}

export type PublicSuspectV4 =
  | Readonly<{ status: 'unknown' }>
  | Readonly<{
      status: 'namedLead'
      candidateAgentId: string
      evidenceIds: readonly string[]
      availableTick: number
      verification: 'unverified'
    }>

/** Explicit public fields; there is no ground-truth incident or offender ID. */
export interface ObservationRecordV4 {
  readonly reportId: string
  readonly reportedOccurrenceTick: number
  readonly availableTick: number
  readonly reportedPosition: Readonly<WorldPosition>
  readonly reportedBlockId: string
  readonly reportedDistrict: DistrictKind
  readonly reportedType: OffenceCategoryV4
  readonly reportedSeverity: IncidentSeverity
  readonly suspect: PublicSuspectV4
  readonly evidenceRefs: readonly PublicEvidenceRefV4[]
}

export interface ReportingStateV4 {
  readonly outcomes: readonly ReportingOutcomeV4[]
  readonly records: readonly ObservationRecordV4[]
  readonly nextReportOrdinal: number
}

export interface ObservedWorldViewV4 {
  readonly asOfTick: number
  readonly reports: readonly ObservationRecordV4[]
  readonly availableReportCount: number
}

export interface ObserverPortV4 {
  getView(): ObservedWorldViewV4
  subscribe(listener: () => void): () => void
}

/** Minimum truth fields needed to derive researcher metrics. */
export interface OffenceMetricFactV4 {
  readonly id: string
  readonly incidentId: string
  readonly offenderAgentId: string
  readonly occurrenceTick: number
  readonly severity: IncidentSeverity
  readonly district: DistrictKind
}

export interface MinorSeriousAssociationV4 {
  readonly both: number
  readonly minorOnly: number
  readonly seriousOnly: number
  readonly neither: number
  readonly seriousGivenMinor: number | null
  readonly seriousGivenNoMinor: number | null
  readonly riskDifference: number | null
}

export interface GroundTruthMetricsV4 {
  readonly totalOffences: number
  readonly minorOffences: number
  readonly seriousOffences: number
  readonly uniqueOffendingAgents: number
  readonly repeatOffendingAgents: number
  readonly meanOffencesPerOffender: number | null
  readonly frequency: Readonly<{ zero: number; one: number; twoOrMore: number }>
  readonly association: MinorSeriousAssociationV4
  readonly crossSeverityRateAmongOffenders: number | null
  readonly offencesByDistrict: Readonly<Record<DistrictKind, number>>
  readonly offencesByGroup: Readonly<Record<BehaviourGroupV4, number>>
  readonly availableBySeverity: Readonly<Record<IncidentSeverity, number>>
  readonly availableReports: number
  readonly pendingReports: number
  readonly unreportedOffences: number
  readonly currentReportingCoverage: number | null
  readonly eventualReportingShare: number | null
  readonly configuredGlobalReportingProbability: number
  readonly meanAvailableReportDelayTicks: number | null
}

export const DEFAULT_V4_OBSERVATION_CONFIG: ObservationConfigV4 = Object.freeze({
  version: 'offender-reporting-v1',
  observationSeed: 'shadow-city-observation-01',
  globalProbability: 0.6,
  severityExponent: Object.freeze({ minor: 1, serious: 1.5 }),
  minDelayTicks: 0,
  maxDelayTicks: 24,
  ingestDelayTicks: 0,
  identity: Object.freeze({
    noticeProbability: 0.35,
    recognitionProbability: 0.35,
    accuracyProbability: 0.75,
  }),
})
