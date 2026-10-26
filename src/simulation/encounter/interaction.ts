import { hashSeed } from '../rng'
import type { DirectedRelationshipV1, SocialActorInputV1, SocialConfigV1,
  SocialEncounterInputV1, SocialInteractionDecisionV1, SocialInteractionV1,
  SocialProfileV1 } from './socialTypes'

function unit(seed: string, episodeId: string, agentId: string, purpose: string): number {
  return hashSeed(`${seed}\u0000interaction-v1\u0000${episodeId}\u0000${agentId}\u0000${purpose}`) / 4294967296
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)) }

function validProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

export function validateSocialConfigV1(config: SocialConfigV1): void {
  if (!config || !Array.isArray(config.conversationDurationTicks) ||
    config.conversationDurationTicks.length !== 2) {
    throw new Error('Invalid social model configuration')
  }
  const [minDuration, maxDuration] = config.conversationDurationTicks
  if (config.version !== 'social-v1' || typeof config.seed !== 'string' ||
    config.seed.length === 0 || typeof config.diagnosticTraces !== 'boolean' ||
    !validProbability(config.greetingWillingness) ||
    !validProbability(config.conversationWillingness) ||
    !validProbability(config.nameExchangeProbability) ||
    !validProbability(config.familiarityEncounterGain) ||
    !validProbability(config.familiarityGreetingGain) ||
    !validProbability(config.familiarityConversationGain) ||
    !validProbability(config.familiarityDecayPer100Ticks) ||
    !Number.isSafeInteger(minDuration) || minDuration < 1 ||
    !Number.isSafeInteger(maxDuration) || maxDuration < minDuration ||
    !Number.isSafeInteger(config.minimumDwellSlackTicks) || config.minimumDwellSlackTicks < 0 ||
    !Number.isSafeInteger(config.minimumStationaryContactSeconds) ||
    config.minimumStationaryContactSeconds < 2 || config.minimumStationaryContactSeconds > 6 ||
    !Number.isSafeInteger(config.memoryCapacity) || config.memoryCapacity < 1 ||
    !Number.isSafeInteger(config.knowledgeCapacity) || config.knowledgeCapacity < 1 ||
    !Number.isSafeInteger(config.memoryHalfLifeTicks) || config.memoryHalfLifeTicks < 1 ||
    !Number.isSafeInteger(config.diagnosticTraceCapacity) ||
    config.diagnosticTraceCapacity < 1 || config.diagnosticTraceCapacity > 10_000) {
    throw new Error('Invalid social model configuration')
  }
}

function canConverse(actor: SocialActorInputV1, episode: SocialEncounterInputV1,
  tick: number, minimumSlack: number): boolean {
  return actor.activity === 'atDestination' && actor.isStationaryPublic &&
    actor.currentNodeId !== null && actor.placeId !== null &&
    actor.placeId === episode.placeId && actor.surfaceId === episode.surfaceId &&
    actor.nextDecisionTick - tick >= minimumSlack
}

export interface InteractionDecisionDiagnosticsV1 {
  readonly firstChance: number | null
  readonly secondChance: number | null
  readonly firstDraw: number | null
  readonly secondDraw: number | null
  readonly firstSociability: number
  readonly secondSociability: number
  readonly firstFamiliarity: number
  readonly secondFamiliarity: number
  readonly firstAvailableTicks: number
  readonly secondAvailableTicks: number
  readonly firstStationaryEligible: boolean
  readonly secondStationaryEligible: boolean
}

/** Each phase draws at most once; diagnostics capture values used by that draw. */
export function evaluateMutualInteractionV1(
  episode: SocialEncounterInputV1,
  firstActor: SocialActorInputV1,
  secondActor: SocialActorInputV1,
  firstProfile: SocialProfileV1,
  secondProfile: SocialProfileV1,
  tick: number,
  config: SocialConfigV1,
  firstRelation?: DirectedRelationshipV1 | null,
  secondRelation?: DirectedRelationshipV1 | null,
  phase: SocialInteractionDecisionV1['phase'] = 'initial',
): Readonly<{ decision: SocialInteractionDecisionV1;
  diagnostics: InteractionDecisionDiagnosticsV1 }> {
  validateSocialConfigV1(config)
  if (!Number.isSafeInteger(tick) || tick < 0 ||
    episode.participantIds[0] !== firstActor.agentId ||
    episode.participantIds[1] !== secondActor.agentId ||
    firstProfile.agentId !== firstActor.agentId ||
    secondProfile.agentId !== secondActor.agentId) {
    throw new Error('Mismatched social interaction participants or Tick')
  }
  const base = { id: `social-interaction:${episode.id}:${phase}`, encounterId: episode.id,
    phase,
    participantIds: episode.participantIds, tick, placeId: episode.placeId,
    surfaceId: episode.surfaceId } as const
  let firstChance: number | null = null
  let secondChance: number | null = null
  let firstDraw: number | null = null
  let secondDraw: number | null = null
  const firstStationaryEligible = canConverse(firstActor, episode, tick,
    config.minimumDwellSlackTicks)
  const secondStationaryEligible = canConverse(secondActor, episode, tick,
    config.minimumDwellSlackTicks)
  const finish = (decision: SocialInteractionDecisionV1) => ({ decision,
    diagnostics: { firstChance, secondChance, firstDraw, secondDraw,
      firstSociability: firstProfile.sociability,
      secondSociability: secondProfile.sociability,
      firstFamiliarity: firstRelation?.familiarity ?? 0,
      secondFamiliarity: secondRelation?.familiarity ?? 0,
      firstAvailableTicks: firstActor.nextDecisionTick - tick,
      secondAvailableTicks: secondActor.nextDecisionTick - tick,
      firstStationaryEligible, secondStationaryEligible } })
  const none = (reason: SocialInteractionDecisionV1['reason'], firstAccepted = false,
    secondAccepted = false) => finish({ ...base, type: 'none',
      firstAccepted, secondAccepted, reason, durationTicks: 0 })
  if (episode.status !== 'active') return none('alreadyDecided')
  const currentlyPerceivedBy = episode.currentPerceivedBy ?? episode.perceivedBy
  if (episode.contactThisTick === false ||
    !currentlyPerceivedBy.includes(firstActor.agentId) ||
    !currentlyPerceivedBy.includes(secondActor.agentId)) return none('notMutuallyPerceived')
  if (firstActor.hasActiveInteraction || secondActor.hasActiveInteraction ||
    firstActor.activity === 'interacting' || secondActor.activity === 'interacting' ||
    firstActor.activity === 'atHome' || secondActor.activity === 'atHome') return none('busy')

  const eligibleConversation = firstStationaryEligible && secondStationaryEligible
  const durationSpan = config.conversationDurationTicks[1] - config.conversationDurationTicks[0] + 1
  const duration = config.conversationDurationTicks[0] +
    hashSeed(`${config.seed}\u0000interaction-duration-v1\u0000${episode.id}`) % durationSpan
  const enoughTime = eligibleConversation &&
    firstActor.nextDecisionTick - tick >= duration + 1 &&
    secondActor.nextDecisionTick - tick >= duration + 1
  if (phase === 'settled' && enoughTime) {
    firstChance = clamp01(config.conversationWillingness * firstProfile.sociability *
      firstProfile.interactionPatience * (1 + (firstRelation?.familiarity ?? 0)))
    secondChance = clamp01(config.conversationWillingness * secondProfile.sociability *
      secondProfile.interactionPatience * (1 + (secondRelation?.familiarity ?? 0)))
    firstDraw = unit(config.seed, episode.id, firstActor.agentId, 'conversation')
    secondDraw = unit(config.seed, episode.id, secondActor.agentId, 'conversation')
    const firstAccepted = firstDraw < firstChance
    const secondAccepted = secondDraw < secondChance
    if (firstAccepted && secondAccepted) return finish({ ...base, type: 'conversation',
      firstAccepted, secondAccepted, reason: 'mutualConversation', durationTicks: duration })
    return none('declined', firstAccepted, secondAccepted)
  }
  if (phase === 'settled') return none(eligibleConversation && !enoughTime ?
    'insufficientTime' : 'declined')
  firstChance = clamp01(config.greetingWillingness * firstProfile.sociability *
    (1 + (firstRelation?.familiarity ?? 0)))
  secondChance = clamp01(config.greetingWillingness * secondProfile.sociability *
    (1 + (secondRelation?.familiarity ?? 0)))
  firstDraw = unit(config.seed, episode.id, firstActor.agentId, 'greeting')
  secondDraw = unit(config.seed, episode.id, secondActor.agentId, 'greeting')
  const firstGreeting = firstDraw < firstChance
  const secondGreeting = secondDraw < secondChance
  if (firstGreeting && secondGreeting) return finish({ ...base, type: 'greeting',
    firstAccepted: true, secondAccepted: true, reason: 'mutualGreeting', durationTicks: 0 })
  return none('declined', firstGreeting, secondGreeting)
}

export function decideMutualInteractionV1(
  ...args: Parameters<typeof evaluateMutualInteractionV1>
): SocialInteractionDecisionV1 {
  return evaluateMutualInteractionV1(...args).decision
}

/** The engine enforces the conversation lock from startTick through plannedEndTick - 1. */
export function materializeInteractionV1(decision: SocialInteractionDecisionV1): SocialInteractionV1 | null {
  if (decision.type === 'none') return null
  const conversation = decision.type === 'conversation'
  const startTick = conversation ? decision.tick + 1 : decision.tick
  return { id: decision.id, encounterId: decision.encounterId,
    participantIds: decision.participantIds, type: decision.type,
    status: conversation ? 'active' : 'completed', decisionTick: decision.tick,
    startTick, plannedEndTick: startTick + decision.durationTicks,
    endTick: conversation ? null : decision.tick,
    placeId: decision.placeId, surfaceId: decision.surfaceId }
}
