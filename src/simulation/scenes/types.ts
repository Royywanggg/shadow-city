import type { WorldPointMm } from '../../world/model'
import type { LifeSceneReportV1 } from '../life/types'

export interface SceneScenarioConfigV1 {
  readonly version: 'scene-v1'
  readonly cellSizeMm: number
  readonly hearsayProbabilityPerConversation: number
}

export const DEFAULT_SCENE_SCENARIO_V1: SceneScenarioConfigV1 = Object.freeze({
  version: 'scene-v1', cellSizeMm: 8_000,
  hearsayProbabilityPerConversation: 0.25,
})

export type SceneOriginV1 = Readonly<{
  kind: 'death'; deathEventId: string; injuryId: string; offenceId: string;
  incidentId: string
}> | Readonly<{
  kind: 'incapacitation'; injuryId: string; offenceId: string;
  incidentId: string
}>

export type SceneStructureRefV1 = Readonly<{
  kind: 'building' | 'galleria' | 'overpass'; id: string
}> | null

export interface SceneAnchorV1 {
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly structure: SceneStructureRefV1
}

export interface SceneEntityV1 {
  readonly id: string
  readonly kind: 'deathAftermath' | 'incapacitationAftermath'
  readonly origin: SceneOriginV1
  readonly createdTick: number
  readonly anchor: SceneAnchorV1
  readonly associatedAgentIds: readonly string[]
  readonly status: 'present' | 'resolved'
  readonly resolvedTick: number | null
  readonly resolution: 'recoveredMobility' | null
}

export interface SceneTransitionV1 {
  readonly id: string
  readonly sceneId: string
  readonly tick: number
  readonly kind: 'created' | 'resolved'
  readonly sourceId: string
}

/** A private provenance record; it is never projected into ObserverPort. */
export interface SceneDiscoveryV1 {
  readonly id: string
  readonly sceneId: string
  readonly observerAgentId: string
  readonly tick: number
  readonly observerPosition: WorldPointMm
  readonly observedSurfaceId: string
  readonly perceivedScenePosition: WorldPointMm
  readonly perceivedLevelId: string
  readonly perceivedPlaceId: string | null
  readonly perceivedStatus: 'possibleDeathScene' | 'possibleIncapacitatedPerson'
  readonly subjectToken: string | null
  readonly believedIdentity: string | null
}

export interface SceneHearsayV1 {
  readonly id: string
  readonly sceneId: string
  readonly sourceAgentId: string
  readonly receiverAgentId: string
  readonly interactionId: string
  readonly tick: number
  readonly claimedStatus: 'possibleDeathScene' | 'possibleIncapacitatedPerson'
  readonly claimedPlaceId: string | null
  readonly claimedLevelId: string | null
  readonly claimedName: string | null
}

export interface SceneStateV1 {
  readonly version: 'scene-v1'
  readonly entities: readonly SceneEntityV1[]
  readonly transitions: readonly SceneTransitionV1[]
  readonly discoveries: readonly SceneDiscoveryV1[]
  readonly hearsay: readonly SceneHearsayV1[]
  readonly pendingReports: readonly Readonly<{
    sceneId: string; discoveryId: string; report: LifeSceneReportV1
  }>[]
  readonly reportLinks: readonly Readonly<{
    sceneId: string; discoveryId: string; reportId: string
  }>[]
}

export function createInitialSceneStateV1(): SceneStateV1 {
  return { version: 'scene-v1', entities: [], transitions: [], discoveries: [], hearsay: [],
    pendingReports: [], reportLinks: [] }
}
