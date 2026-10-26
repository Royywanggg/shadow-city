import type { SocialEncounterEvent, SocialEncounterLifecycleState } from './lifecycle'
import { EMPTY_SOCIAL_ENCOUNTERS } from './lifecycle'
import type { AgentKnowledgeV1, AgentMemoryV1, DirectedRelationshipV1,
  SocialInteractionDecisionV1, SocialInteractionV1 } from './socialTypes'
import type { ScheduledWitnessReport, WitnessAssessment, WitnessObservation } from './crimeWitness'
import type { OpportunityTargetV5 } from '../v5Types'

export interface OffenderDecisionTraceV1 {
  readonly episodeId: string
  readonly tick: number
  readonly second: number
  readonly offenderAgentId: string
  readonly target: OpportunityTargetV5
  readonly socialEncounterId: string | null
  readonly exposureSeconds: number
  readonly perceivedRisk: number
  readonly noneProbability: number
  readonly draw: number
  readonly attempted: boolean
  readonly completed: boolean
}

export interface SocialInteractionEventV1 {
  readonly id: string
  readonly tick: number
  readonly interactionId: string
  readonly participantIds: readonly [string, string]
  readonly type: 'Attempted' | 'Rejected' | 'Started' | 'Completed' | 'Interrupted'
}

export interface EncounterDecisionTraceV1 {
  readonly episodeId: string
  readonly tick: number
  readonly participantIds: readonly [string, string]
  readonly minDistanceMm: number
  readonly contactSeconds: number
  readonly firstPerceived: boolean
  readonly secondPerceived: boolean
  readonly interactionDecisionId: string | null
  readonly spatialRule: 'sameSurfaceOrOpenPortal'
  readonly perceptionModel: 'surface-portal-blocker-heading'
}

export interface EncounterMetricsV1 {
  readonly candidatePairSeconds: number
  readonly perceivedPairSeconds: number
  readonly opportunitySeconds: number
  readonly offenderAttempts: number
  readonly potentialWitnesses: number
  readonly actualWitnesses: number
}

export interface PerceivedPlaceRiskV1 {
  readonly ownerAgentId: string
  readonly placeId: string
  readonly score: number
  readonly lastUpdatedTick: number
  readonly sourceObservationId: string
}

export interface SocialStateV1 {
  readonly encounters: SocialEncounterLifecycleState
  readonly encounterEvents: readonly SocialEncounterEvent[]
  readonly interactions: readonly SocialInteractionV1[]
  readonly interactionDecisions: readonly SocialInteractionDecisionV1[]
  readonly interactionEvents: readonly SocialInteractionEventV1[]
  readonly decisionTraces: readonly EncounterDecisionTraceV1[]
  readonly offenderDecisionTraces: readonly OffenderDecisionTraceV1[]
  readonly relationships: readonly DirectedRelationshipV1[]
  readonly memories: readonly AgentMemoryV1[]
  readonly knowledge: readonly AgentKnowledgeV1[]
  readonly perceivedPlaceRisks: readonly PerceivedPlaceRiskV1[]
  readonly witnessAssessments: readonly WitnessAssessment[]
  readonly witnessObservations: readonly WitnessObservation[]
  readonly pendingWitnessReports: readonly ScheduledWitnessReport[]
  readonly reportLinks: readonly Readonly<{ offenceId: string; reportId: string }>[]
  readonly metrics: EncounterMetricsV1
}

export function createInitialSocialStateV1(): SocialStateV1 {
  return { encounters: EMPTY_SOCIAL_ENCOUNTERS, encounterEvents: [],
    interactions: [], interactionDecisions: [], interactionEvents: [], decisionTraces: [],
    offenderDecisionTraces: [],
    relationships: [], memories: [], knowledge: [], perceivedPlaceRisks: [],
    witnessAssessments: [], witnessObservations: [],
    pendingWitnessReports: [], reportLinks: [], metrics: { candidatePairSeconds: 0,
      perceivedPairSeconds: 0, opportunitySeconds: 0, offenderAttempts: 0,
      potentialWitnesses: 0, actualWitnesses: 0 } }
}
