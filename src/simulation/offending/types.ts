import type { DistrictKind } from '../../city/model'
import type { AgentProfile, CitizenActivity, WorldPosition } from '../types'
import type { SyntheticTimeBand } from '../v3Types'

export type OffenceSeverity = 'minor' | 'serious'
export type BehaviourGroup = 'minorSpecialist' | 'seriousSpecialist' | 'generalist'

export interface OffendingConfig {
  readonly version: 'offender-choice-v1'
  readonly offendingSeed: string
  readonly startHour: number
  readonly groupShares: Readonly<Record<BehaviourGroup, number>>
  readonly groupMeanLogPropensity: Readonly<Record<BehaviourGroup, Readonly<Record<OffenceSeverity, number>>>>
  readonly propensitySd: Readonly<Record<OffenceSeverity, number>>
  readonly propensityCorrelation: number
  readonly sensitivitySpread: number
  /** Synthetic odds weights per eligible agent-hour, not empirical offence rates. */
  readonly baseOddsPerEligibleAgentHour: Readonly<Record<OffenceSeverity, number>>
  readonly districtExposure: Readonly<Record<DistrictKind, Readonly<Record<OffenceSeverity, number>>>>
  readonly timeBandExposure: Readonly<Record<SyntheticTimeBand, Readonly<Record<OffenceSeverity, number>>>>
  readonly publicSpaceExposureMultiplier: number
  readonly minorCrowdFloor: number
  readonly seriousMinimumNearby: number
  readonly nearbySaturation: number
  readonly nearbyRadius: number
  readonly rewardByDistrict: Readonly<Record<DistrictKind, number>>
  readonly perceivedRiskByDistrict: Readonly<Record<DistrictKind, number>>
  readonly rewardWeight: Readonly<Record<OffenceSeverity, number>>
  readonly riskWeight: Readonly<Record<OffenceSeverity, number>>
  readonly cooldownTicks: number
}

export interface OffendingProfile {
  readonly agentId: string
  /** Research label, never an observed offender identity or a forced outcome. */
  readonly researchGroup: BehaviourGroup
  readonly logPropensity: Readonly<Record<OffenceSeverity, number>>
  readonly rewardSensitivity: number
  readonly riskSensitivity: number
}

export interface OffenderDynamicState {
  readonly agentId: string
  readonly cooldownUntilTick: number
}

export type PedestrianSpatialAnchor =
  | Readonly<{ kind: 'edge'; id: string }>
  | Readonly<{ kind: 'publicAnchor'; id: string }>

export interface OpportunitySnapshot {
  readonly agentId: string
  readonly tick: number
  readonly position: Readonly<WorldPosition>
  readonly activity: CitizenActivity
  readonly pedestrianAnchor: PedestrianSpatialAnchor
  readonly blockId: string
  readonly district: DistrictKind
  readonly timeBand: SyntheticTimeBand
  /** Co-located citizens are possible witnesses, not designated victims. */
  readonly nearbyCitizenIds: readonly string[]
  readonly nearbyOutdoorCount: number
  readonly exposureBySeverity: Readonly<Record<OffenceSeverity, number>>
  readonly rewardScore: number
  readonly perceivedRiskScore: number
}

export interface Offence {
  readonly id: string
  readonly incidentId: string
  readonly truthEventId: string
  readonly occurrenceTick: number
  readonly offenderAgentId: string
  readonly type: 'minorOffence' | 'seriousOffence'
  readonly severity: OffenceSeverity
  readonly position: Readonly<WorldPosition>
  readonly pedestrianAnchor: PedestrianSpatialAnchor
  readonly blockId: string
  readonly district: DistrictKind
  readonly opportunity: OpportunitySnapshot
  readonly outcome: 'occurred'
  readonly provenance: Readonly<{ generatorVersion: string }>
}

export interface OffenderStepResult {
  readonly offences: readonly Offence[]
  readonly offenderStates: readonly OffenderDynamicState[]
}

export type CitizenProfiles = readonly AgentProfile[]

export const DEFAULT_OFFENDING_CONFIG: OffendingConfig = Object.freeze({
  version: 'offender-choice-v1',
  offendingSeed: 'shadow-city-offending-01',
  startHour: 20,
  groupShares: Object.freeze({ minorSpecialist: 0.4, seriousSpecialist: 0.2, generalist: 0.4 }),
  groupMeanLogPropensity: Object.freeze({
    minorSpecialist: Object.freeze({ minor: 0.45, serious: -1.1 }),
    seriousSpecialist: Object.freeze({ minor: -1.1, serious: 0.7 }),
    generalist: Object.freeze({ minor: 0.05, serious: -0.1 }),
  }),
  propensitySd: Object.freeze({ minor: 0.65, serious: 0.65 }),
  propensityCorrelation: 0.1,
  sensitivitySpread: 0.4,
  baseOddsPerEligibleAgentHour: Object.freeze({ minor: 1.2, serious: 0.28 }),
  districtExposure: Object.freeze({
    civic: Object.freeze({ minor: 0.72, serious: 0.55 }),
    core: Object.freeze({ minor: 0.9, serious: 0.72 }),
    residential: Object.freeze({ minor: 0.66, serious: 0.48 }),
    works: Object.freeze({ minor: 0.62, serious: 0.55 }),
  }),
  timeBandExposure: Object.freeze({
    day: Object.freeze({ minor: 0.7, serious: 0.55 }),
    evening: Object.freeze({ minor: 1, serious: 0.9 }),
    night: Object.freeze({ minor: 0.85, serious: 0.8 }),
  }),
  publicSpaceExposureMultiplier: 1.08,
  minorCrowdFloor: 0.55,
  seriousMinimumNearby: 1,
  nearbySaturation: 4,
  nearbyRadius: 12,
  rewardByDistrict: Object.freeze({ civic: 0.35, core: 0.75, residential: 0.5, works: 0.6 }),
  perceivedRiskByDistrict: Object.freeze({ civic: 0.7, core: 0.5, residential: 0.55, works: 0.45 }),
  rewardWeight: Object.freeze({ minor: 0.4, serious: 0.5 }),
  riskWeight: Object.freeze({ minor: 0.55, serious: 0.75 }),
  cooldownTicks: 20,
})

/** Declared higher opportunity fixture for visual checkpoints, never a measured rate. */
export const REVIEW_OFFENDING_CONFIG: OffendingConfig = Object.freeze({
  ...DEFAULT_OFFENDING_CONFIG,
  baseOddsPerEligibleAgentHour: Object.freeze({ minor: 2.4, serious: 0.9 }),
})
