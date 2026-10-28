import type { WorldPointMm } from '../../world/model'

export type TypedOffenceKind = 'personTheft' | 'physicalAssault'

export interface TypedCrimeConfigV1 {
  readonly version: 'typed-crime-v1'
  /** Cause-specific attempts per eligible exposure hour before synthetic modifiers. */
  readonly theftHazardPerHour: number
  readonly assaultHazardPerHour: number
  readonly portableItemProbability: number
  readonly theftCompletionProbability: number
  readonly assaultCompletionProbability: number
  readonly maxRecentEpisodes: number
}

export const DEFAULT_TYPED_CRIME_CONFIG_V1: TypedCrimeConfigV1 = Object.freeze({
  version: 'typed-crime-v1', theftHazardPerHour: 0.8,
  assaultHazardPerHour: 0.18, portableItemProbability: 0.65,
  theftCompletionProbability: 0.72, assaultCompletionProbability: 0.82,
  maxRecentEpisodes: 4_096,
})

export interface PortableItemV1 {
  readonly id: string
  readonly type: 'phone'
  readonly ownerAgentId: string
  readonly possessorAgentId: string
  readonly accessible: boolean
}

export interface OpportunityEpisodeV1 {
  readonly id: string
  readonly actorAgentId: string
  readonly victimAgentId: string
  readonly itemId: string | null
  readonly offenceType: TypedOffenceKind
  readonly placeId: string | null
  readonly surfaceId: string
  readonly levelId: string
  readonly position: WorldPointMm
  readonly startTick: number
  readonly endTick: number | null
  readonly lastContactTick: number
  readonly exposureSeconds: number
  readonly accumulatedHazard: number
  readonly threshold: number
  readonly lastRatePerHour: number
  readonly lastPerceivedRisk: number
  readonly guardianship: number
  readonly status: 'active' | 'attempted' | 'ended'
  readonly endReason: 'attempted' | 'contactEnded' | 'itemUnavailable' |
    'surfaceChanged' | 'actorUnavailable' | 'competingAttempt' |
    'cooldown' | null
}

export interface CrimeAttemptV1 {
  readonly id: string
  readonly episodeId: string
  readonly offenceId: string | null
  readonly tick: number
  readonly second: number
  readonly actorAgentId: string
  readonly victimAgentId: string
  readonly itemId: string | null
  readonly type: TypedOffenceKind
  readonly outcome: 'completed' | 'failed' | 'invalidated'
  readonly reason: string
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly placeId: string | null
}

export interface VictimAwarenessV1 {
  readonly id: string
  readonly offenceId: string
  readonly victimAgentId: string
  readonly itemId: string | null
  readonly kind: 'missingProperty'
  readonly dueTick: number
  readonly acquiredTick: number | null
  readonly source: 'selfCheck'
}

export interface TypedCrimeStateV1 {
  readonly version: 'typed-crime-v1'
  readonly items: readonly PortableItemV1[]
  readonly activeEpisodes: readonly OpportunityEpisodeV1[]
  /** Bounded summaries. Older summaries are reconstructed from deterministic replay. */
  readonly recentEpisodes: readonly OpportunityEpisodeV1[]
  readonly archivedThroughTick: number | null
  readonly attempts: readonly CrimeAttemptV1[]
  readonly awareness: readonly VictimAwarenessV1[]
  readonly eligibleExposureSeconds: number
  readonly eligibleExposureSecondsByType: Readonly<Record<TypedOffenceKind, number>>
  readonly eligibleExposureSecondsByPlace: Readonly<Record<string, number>>
  readonly ineligibleContactSeconds: Readonly<{
    crossSurface: number
    unavailableAgent: number
    noPortableItem: number
  }>
}
