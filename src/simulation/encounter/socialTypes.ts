/** Optional social model. All coefficients are synthetic modelling assumptions. */
export interface SocialConfigV1 {
  readonly version: 'social-v1'
  readonly seed: string
  readonly greetingWillingness: number
  readonly conversationWillingness: number
  readonly nameExchangeProbability: number
  readonly conversationDurationTicks: readonly [number, number]
  readonly minimumDwellSlackTicks: number
  readonly minimumStationaryContactSeconds: number
  readonly memoryCapacity: number
  readonly knowledgeCapacity: number
  readonly memoryHalfLifeTicks: number
  readonly familiarityEncounterGain: number
  readonly familiarityGreetingGain: number
  readonly familiarityConversationGain: number
  readonly familiarityDecayPer100Ticks: number
  readonly diagnosticTraces: boolean
}

export const DEFAULT_SOCIAL_CONFIG_V1: SocialConfigV1 = Object.freeze({
  version: 'social-v1',
  seed: 'shadow-city-social-01',
  greetingWillingness: 0.38,
  conversationWillingness: 0.24,
  nameExchangeProbability: 0.55,
  conversationDurationTicks: [2, 5] as const,
  minimumDwellSlackTicks: 3,
  minimumStationaryContactSeconds: 2,
  memoryCapacity: 24,
  knowledgeCapacity: 32,
  memoryHalfLifeTicks: 1200,
  familiarityEncounterGain: 0.008,
  familiarityGreetingGain: 0.08,
  familiarityConversationGain: 0.18,
  familiarityDecayPer100Ticks: 0.985,
  diagnosticTraces: false,
})

export interface SocialProfileV1 {
  readonly agentId: string
  readonly sociability: number
  readonly attention: number
  readonly recognitionAcuity: number
  readonly interactionPatience: number
}

/** A minimal view of an objective episode; spatial detection owns the full record. */
export interface SocialEncounterInputV1 {
  readonly id: string
  readonly participantIds: readonly [string, string]
  readonly perceivedBy: readonly string[]
  readonly status: 'active' | 'ended'
  readonly placeId: string | null
  readonly surfaceId: string | null
  readonly interactionIds: readonly string[]
  /** Supplied by the Tick adapter; lifecycle perception is cumulative. */
  readonly currentPerceivedBy?: readonly string[]
  readonly contactThisTick?: boolean
}

/** isStationaryPublic must be derived from the authoritative world slot catalogue. */
export interface SocialActorInputV1 {
  readonly agentId: string
  readonly activity: string
  readonly placeId: string | null
  readonly surfaceId: string
  readonly currentNodeId: string | null
  readonly nextDecisionTick: number
  readonly isStationaryPublic: boolean
  readonly hasActiveInteraction: boolean
}

export interface SocialInteractionDecisionV1 {
  readonly id: string
  readonly encounterId: string
  readonly phase: 'initial' | 'settled'
  readonly participantIds: readonly [string, string]
  readonly tick: number
  readonly type: 'none' | 'greeting' | 'conversation'
  readonly firstAccepted: boolean
  readonly secondAccepted: boolean
  readonly reason: 'notMutuallyPerceived' | 'alreadyDecided' | 'busy' |
    'insufficientTime' | 'declined' | 'mutualGreeting' | 'mutualConversation'
  readonly durationTicks: number
  readonly placeId: string | null
  readonly surfaceId: string | null
}

export interface SocialInteractionV1 {
  readonly id: string
  readonly encounterId: string
  readonly participantIds: readonly [string, string]
  readonly type: 'greeting' | 'conversation'
  readonly status: 'active' | 'completed' | 'interrupted'
  readonly decisionTick: number
  readonly startTick: number
  readonly plannedEndTick: number
  readonly endTick: number | null
  readonly placeId: string | null
  readonly surfaceId: string | null
}

/** Referent IDs are private engine state; expose only owner-local subjectToken externally. */
export interface DirectedRelationshipV1 {
  readonly ownerAgentId: string
  readonly referentAgentId: string
  readonly subjectToken: string
  readonly familiarity: number
  readonly recognitionStrength: number
  readonly trust: number
  readonly encounterCount: number
  readonly greetingCount: number
  readonly conversationCount: number
  readonly lastEncounterTick: number
  readonly lastUpdatedTick: number
  readonly believedIdentity: string | null
}

export type RelationshipCategoryV1 = 'stranger' | 'familiar' | 'knownContact'

/** Knowledge contains a claim, not ground truth or an authoritative target ID. */
export interface AgentKnowledgeV1 {
  readonly id: string
  readonly ownerAgentId: string
  readonly kind: 'visualRecognition' | 'identityBelief' | 'behaviour' | 'event' | 'hearsay'
  readonly subjectToken: string | null
  readonly acquiredTick: number
  readonly source: 'direct' | 'interaction' | 'witness' | 'hearsay'
  readonly provenanceId: string | null
  readonly confidence: number
  readonly believedIdentity: string | null
  readonly expiresTick: number | null
}

export interface AgentMemoryV1 {
  readonly id: string
  readonly ownerAgentId: string
  readonly category: 'interaction' | 'placeExperience' | 'witness' |
    'victimExperience' | 'hearsay'
  readonly subjectToken: string | null
  readonly placeId: string | null
  readonly surfaceId: string | null
  readonly createdTick: number
  readonly lastUpdatedTick: number
  readonly source: 'direct' | 'interaction' | 'witness' | 'hearsay'
  readonly provenanceId: string | null
  readonly observationCode: string
  readonly confidence: number
  readonly salience: number
}
