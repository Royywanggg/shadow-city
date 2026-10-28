import type { WorldPointMm } from '../../world/model'

export type InjurySeverityV1 = 'minor' | 'serious' | 'critical'
export type FunctionalStatusV1 = 'unimpaired' | 'impaired' | 'incapacitated'

export interface LifeScenarioConfigV1 {
  readonly version: 'life-v1'
  readonly seed: string
  readonly assaultProbability: Readonly<Record<'minor' | 'serious', number>>
  readonly injuryProbability: Readonly<Record<'minor' | 'serious', number>>
  readonly severityWeights: Readonly<Record<'minor' | 'serious',
    Readonly<Record<InjurySeverityV1, number>>>>
  readonly fatalProbabilityCritical: number
  readonly impairedSpeedFactor: number
  readonly incapacitatedTicks: Readonly<Record<'serious' | 'critical', number>>
  readonly recoveryTicks: Readonly<Record<InjurySeverityV1, number>>
  readonly discoveryRadiusMm: number
  readonly discoveryProbabilityPerEligibleTick: number
  readonly sceneReportProbability: number
  readonly sceneReportDelayTicks: number
  readonly scenePolicy: 'persistUntilExplicitCleanup'
}

export const DEFAULT_LIFE_SCENARIO_V1: LifeScenarioConfigV1 = Object.freeze({
  version: 'life-v1', seed: 'shadow-city-life-01',
  assaultProbability: { minor: 0.08, serious: 0.36 },
  injuryProbability: { minor: 0.34, serious: 0.72 },
  severityWeights: {
    minor: { minor: 0.88, serious: 0.11, critical: 0.01 },
    serious: { minor: 0.42, serious: 0.45, critical: 0.13 },
  },
  fatalProbabilityCritical: 0.12,
  impairedSpeedFactor: 0.65,
  incapacitatedTicks: { serious: 90, critical: 360 },
  recoveryTicks: { minor: 360, serious: 1440, critical: 2880 },
  discoveryRadiusMm: 7_000,
  discoveryProbabilityPerEligibleTick: 0.12,
  sceneReportProbability: 0.45,
  sceneReportDelayTicks: 3,
  scenePolicy: 'persistUntilExplicitCleanup',
})

export type LifePersonV1 = Readonly<{
  agentId: string
  lifeStatus: 'alive'
  functionalStatus: FunctionalStatusV1
  activeInjuryIds: readonly string[]
  resumeToSafeNode: boolean
}> | Readonly<{
  agentId: string
  lifeStatus: 'deceased'
  functionalStatus: null
  activeInjuryIds: readonly string[]
  deathEventId: string
  deathTick: number
  resumeToSafeNode: false
}>

export interface InjuryRecordV1 {
  readonly id: string
  readonly victimAgentId: string
  readonly sourceOffenceId: string
  readonly onsetTick: number
  readonly severity: InjurySeverityV1
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly stepDownTick: number | null
  readonly recoveryTick: number | null
  readonly status: 'active' | 'recovered' | 'fatal' | 'closedByDeath'
}

export interface LifeRecoveryEventV1 {
  readonly id: string
  readonly agentId: string
  readonly injuryId: string
  readonly tick: number
  readonly kind: 'improved' | 'recovered'
  readonly before: FunctionalStatusV1
  readonly after: FunctionalStatusV1
}

export interface DeathEventV1 {
  readonly id: string
  readonly victimAgentId: string
  readonly tick: number
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly relatedInjuryId: string
  readonly relatedOffenceId: string
  readonly causeClassification: 'immediatePhysicalAssaultOutcome'
  readonly provenance: 'harmOutcomeV1'
}

export interface DeathSceneV1 {
  readonly id: string
  readonly deathEventId: string
  readonly agentId: string
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly createdTick: number
  readonly state: 'present'
  readonly policy: 'persistUntilExplicitCleanup'
}

export interface LifeObservationV1 {
  readonly id: string
  readonly observerAgentId: string
  readonly kind: 'witnessedHarmfulOffence' | 'discoveredDeathScene' |
    'discoveredIncapacitationScene'
  readonly observedTick: number
  readonly surfaceId: string
  readonly position: WorldPointMm
  readonly sourceOffenceId: string | null
  readonly sourceDeathEventId: string | null
  readonly subjectToken: string | null
  readonly believedIdentity: string | null
}

/** An agent's claim contains no ground-truth death-event or victim ID. */
export interface DeathKnowledgeV1 {
  readonly id: string
  readonly ownerAgentId: string
  readonly subjectToken: string
  readonly believedIdentity: string | null
  readonly acquiredTick: number
  readonly source: 'sceneDiscovery'
  readonly sourceObservationId: string
  readonly confidence: number
}

export interface LifeSceneReportV1 {
  readonly id: string
  readonly availableTick: number
  readonly reportedPosition: WorldPointMm
  readonly reportedLevelId: string | null
  readonly reportedPlaceId: string | null
  readonly reportedStatus: 'possibleDeathScene' | 'possibleIncapacitatedPerson'
  readonly source: 'sceneDiscovery'
}

export interface PendingLifeReportV1 {
  readonly deathEventId: string
  readonly observationId: string
  readonly report: LifeSceneReportV1
}

export interface LifeStateV1 {
  readonly version: 'life-v1'
  readonly people: readonly LifePersonV1[]
  readonly injuries: readonly InjuryRecordV1[]
  readonly recoveryEvents: readonly LifeRecoveryEventV1[]
  readonly deaths: readonly DeathEventV1[]
  readonly scenes: readonly DeathSceneV1[]
  readonly observations: readonly LifeObservationV1[]
  readonly knowledge: readonly DeathKnowledgeV1[]
  readonly pendingReports: readonly PendingLifeReportV1[]
  readonly reports: readonly LifeSceneReportV1[]
}

export function createInitialLifeStateV1(agentIds: readonly string[]): LifeStateV1 {
  return { version: 'life-v1', people: agentIds.map((agentId) => ({
    agentId, lifeStatus: 'alive', functionalStatus: 'unimpaired',
    activeInjuryIds: [], resumeToSafeNode: false,
  })), injuries: [], recoveryEvents: [], deaths: [], scenes: [],
  observations: [], knowledge: [], pendingReports: [], reports: [] }
}
