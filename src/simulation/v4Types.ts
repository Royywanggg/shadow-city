import { DEFAULT_SIMULATION_CONFIG } from './types'
import type { SimulationConfigV2, SimulationEvent, SimulationStateV2 } from './types'
import {
  DEFAULT_OFFENDING_CONFIG,
  REVIEW_OFFENDING_CONFIG,
  type Offence,
  type OffenderDynamicState,
  type OffendingConfig,
  type OffendingProfile,
} from './offending/types'
import {
  DEFAULT_V4_OBSERVATION_CONFIG,
  type GroundTruthMetricsV4,
  type ObservationConfigV4,
  type ObservedWorldViewV4,
  type ObserverPortV4,
  type ReportableOccurrenceV4,
  type ReportingOutcomeV4,
  type ReportingStateV4,
  type ObservationRecordV4,
} from './observation/v4Types'

export interface SimulationConfigV4 {
  readonly version: 4
  readonly citizen: SimulationConfigV2
  readonly offending: OffendingConfig
  readonly observation: ObservationConfigV4
}

export interface SimulationStateV4 {
  readonly version: 4
  readonly tick: number
  readonly logicalTimeSeconds: number
  readonly worldFingerprint: string
  readonly scenarioFingerprint: string
  readonly citizen: SimulationStateV2
  readonly offenderStates: readonly OffenderDynamicState[]
  readonly offences: readonly Offence[]
  readonly incidents: readonly ReportableOccurrenceV4[]
  readonly reporting: ReportingStateV4
}

export interface OffenceOccurredEvent {
  readonly id: string
  readonly tick: number
  readonly type: 'OffenceOccurred'
  readonly offenceId: string
  readonly incidentId: string
  readonly offenderAgentId: string
}

export interface ReportAvailableEventV4 {
  readonly id: string
  readonly tick: number
  readonly type: 'ReportAvailable'
  readonly reportId: string
}

export interface SimulationTransitionV4 {
  readonly state: SimulationStateV4
  readonly citizenEvents: readonly SimulationEvent[]
  readonly truthEvents: readonly OffenceOccurredEvent[]
  readonly observationEvents: readonly ReportAvailableEventV4[]
}

export interface GroundTruthViewV4 {
  readonly asOfTick: number
  readonly incidents: readonly ReportableOccurrenceV4[]
  readonly offences: readonly Offence[]
  readonly profiles: readonly OffendingProfile[]
  readonly outcomes: readonly ReportingOutcomeV4[]
  readonly metrics: GroundTruthMetricsV4
}

export type {
  Offence,
  OffenderDynamicState,
  OffendingConfig,
  OffendingProfile,
  ObservationConfigV4,
  ObservationRecordV4,
  ObservedWorldViewV4,
  ObserverPortV4,
  ReportableOccurrenceV4,
  ReportingOutcomeV4,
  ReportingStateV4,
  GroundTruthMetricsV4,
}

export const DEFAULT_V4_SCENARIO_CONFIG: SimulationConfigV4 = Object.freeze({
  version: 4,
  citizen: DEFAULT_SIMULATION_CONFIG,
  offending: DEFAULT_OFFENDING_CONFIG,
  observation: DEFAULT_V4_OBSERVATION_CONFIG,
})

/** Higher declared synthetic odds for fixed visual review; never a measured crime rate. */
export const V05_REVIEW_SCENARIO_CONFIG: SimulationConfigV4 = Object.freeze({
  ...DEFAULT_V4_SCENARIO_CONFIG,
  offending: REVIEW_OFFENDING_CONFIG,
})
