import type { DistrictKind } from '../city/model'
import { DEFAULT_SIMULATION_CONFIG } from './types'
import type {
  SimulationConfigV2,
  SimulationEvent,
  SimulationStateV2,
  WorldPosition,
} from './types'

export type IncidentSeverity = 'minor' | 'serious'
export type IncidentType = 'disruption' | 'safety'
export type SyntheticTimeBand = 'day' | 'evening' | 'night'

export interface IncidentConfig {
  readonly version: 'synthetic-opportunity-v1'
  /** Synthetic expected incidents per occupied block per simulated hour. */
  readonly baselineRatePerOccupiedBlockHour: number
  readonly densitySlope: number
  readonly maxDensityCount: number
  readonly seriousProbability: number
  readonly districtMultipliers: Readonly<Record<DistrictKind, number>>
  readonly timeBandMultipliers: Readonly<Record<SyntheticTimeBand, number>>
  readonly publicSpaceMultiplier: number
  readonly startHour: number
}

export interface ReportingConfig {
  readonly version: 'synthetic-reporting-v1'
  readonly observationSeed: string
  /** Baseline probability for severity exponent 1; synthetic, not empirical. */
  readonly globalProbability: number
  readonly severityExponent: Readonly<Record<IncidentSeverity, number>>
  readonly minDelayTicks: number
  readonly maxDelayTicks: number
  readonly ingestDelayTicks: number
}

export interface SimulationConfigV3 {
  readonly version: 3
  readonly citizen: SimulationConfigV2
  readonly incident: IncidentConfig
  readonly observation: ReportingConfig
}

export interface Incident {
  readonly id: string
  readonly occurrenceTick: number
  readonly position: Readonly<WorldPosition>
  readonly blockId: string
  readonly district: DistrictKind
  readonly type: IncidentType
  readonly severity: IncidentSeverity
  readonly involvedAgentIds: readonly string[]
  readonly context: Readonly<{
    outdoorPresence: number
    timeBand: SyntheticTimeBand
    opportunityMultiplier: number
  }>
  /** Internal research provenance; never copy this object into an observer view. */
  readonly provenance: Readonly<{
    generatorVersion: string
    spatialTrialId: string
    positionSourceCitizenId: string
  }>
}

export type ReportingOutcome =
  | Readonly<{ status: 'notReported'; incidentId: string; decisionTick: number }>
  | Readonly<{
      status: 'scheduled'
      incidentId: string
      decisionTick: number
      createdTick: number
      availableTick: number
    }>
  | Readonly<{
      status: 'available'
      incidentId: string
      decisionTick: number
      createdTick: number
      availableTick: number
      reportId: string
    }>

/** Explicit public report data. It deliberately contains no incident identifier. */
export interface ObservationRecord {
  readonly reportId: string
  readonly reportedOccurrenceTick: number
  readonly availableTick: number
  readonly reportedPosition: Readonly<WorldPosition>
  readonly reportedBlockId: string
  readonly reportedType: IncidentType
  readonly reportedSeverity: IncidentSeverity
}

export interface ReportingState {
  readonly outcomes: readonly ReportingOutcome[]
  readonly records: readonly ObservationRecord[]
  readonly nextReportOrdinal: number
}

export interface SimulationStateV3 {
  readonly version: 3
  readonly tick: number
  readonly logicalTimeSeconds: number
  readonly worldFingerprint: string
  readonly scenarioFingerprint: string
  readonly citizen: SimulationStateV2
  readonly incidents: readonly Incident[]
  readonly reporting: ReportingState
}

export interface IncidentOccurredEvent {
  readonly id: string
  readonly tick: number
  readonly type: 'IncidentOccurred'
  readonly incidentId: string
}

/** Public event details are limited to an already available report ID. */
export interface ReportAvailableEvent {
  readonly id: string
  readonly tick: number
  readonly type: 'ReportAvailable'
  readonly reportId: string
}

export interface SimulationTransitionV3 {
  readonly state: SimulationStateV3
  readonly citizenEvents: readonly SimulationEvent[]
  readonly truthEvents: readonly IncidentOccurredEvent[]
  readonly observationEvents: readonly ReportAvailableEvent[]
}

export interface GroundTruthMetrics {
  readonly totalIncidents: number
  readonly availableReports: number
  readonly pendingReports: number
  readonly unreportedIncidents: number
  readonly configuredGlobalProbability: number
  readonly currentCoverage: number | null
  readonly eventuallyReportedShare: number | null
  readonly maturedReportingShare: number | null
  readonly meanReportDelayTicks: number | null
  readonly truthBySeverity: Readonly<Record<IncidentSeverity, number>>
  readonly availableBySeverity: Readonly<Record<IncidentSeverity, number>>
  readonly truthByDistrict: Readonly<Record<DistrictKind, number>>
  readonly availableByDistrict: Readonly<Record<DistrictKind, number>>
  readonly truthByBlock: Readonly<Record<string, number>>
  readonly availableByBlock: Readonly<Record<string, number>>
}

export interface GroundTruthView {
  readonly asOfTick: number
  readonly incidents: readonly Incident[]
  readonly outcomes: readonly ReportingOutcome[]
  readonly metrics: GroundTruthMetrics
}

export interface ObservedWorldView {
  readonly asOfTick: number
  readonly reports: readonly ObservationRecord[]
  readonly availableReportCount: number
}

export interface ObserverPort {
  getView(): ObservedWorldView
  subscribe(listener: () => void): () => void
}

export const DEFAULT_V3_SCENARIO_CONFIG: SimulationConfigV3 = Object.freeze({
  version: 3,
  citizen: DEFAULT_SIMULATION_CONFIG,
  incident: Object.freeze({
    version: 'synthetic-opportunity-v1',
    baselineRatePerOccupiedBlockHour: 1.2,
    densitySlope: 0.25,
    maxDensityCount: 6,
    seriousProbability: 0.18,
    districtMultipliers: Object.freeze({ civic: 1.2, core: 1.1, residential: 1, works: 0.9 }),
    timeBandMultipliers: Object.freeze({ day: 0.65, evening: 1.2, night: 1 }),
    publicSpaceMultiplier: 1.15,
    startHour: 20,
  }),
  observation: Object.freeze({
    version: 'synthetic-reporting-v1',
    observationSeed: 'shadow-city-observation-01',
    globalProbability: 0.6,
    severityExponent: Object.freeze({ minor: 1, serious: 1.5 }),
    minDelayTicks: 0,
    maxDelayTicks: 24,
    ingestDelayTicks: 0,
  }),
})

/** Higher synthetic opportunity rate for fixed Tick 100/500 visual evidence. */
export const V04_REVIEW_SCENARIO_CONFIG: SimulationConfigV3 = Object.freeze({
  ...DEFAULT_V3_SCENARIO_CONFIG,
  incident: Object.freeze({
    ...DEFAULT_V3_SCENARIO_CONFIG.incident,
    baselineRatePerOccupiedBlockHour: 2.4,
  }),
})
