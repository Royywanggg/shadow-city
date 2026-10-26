import type { WorldModelV2 } from '../../world/model'
import type { CitizenStateV5 } from '../v5Types'
import { createCitizenIdentity } from '../population'
import { hashSeed } from '../rng'
import { createSocialProfileV1 } from './socialProfiles'
import { evaluateMutualInteractionV1, materializeInteractionV1 } from './interaction'
import { createRecognitionTokenV1, decayMemoriesV1, rememberExperienceV1,
  upsertKnowledgeV1 } from './memory'
import { decayDirectedRelationshipV1, setRelationshipIdentityBeliefV1,
  updateDirectedRelationshipV1,
  type RelationshipExperienceV1 } from './relationships'
import type { SocialEncounterEpisode, SocialEncounterEvent,
  SocialEncounterLifecycleState } from './lifecycle'
import type { DirectedPerceptionSample, SpatialCandidateSample } from './spatialTypes'
import type { EncounterDecisionTraceV1, SocialInteractionEventV1, SocialStateV1 } from './state'
import type { AgentKnowledgeV1, AgentMemoryV1, DirectedRelationshipV1,
  SocialActorInputV1, SocialConfigV1, SocialInteractionV1 } from './socialTypes'

export interface SocialTickInputV1 {
  readonly world: WorldModelV2
  readonly config: SocialConfigV1
  readonly tick: number
  readonly citizens: readonly CitizenStateV5[]
  readonly previous: SocialStateV1
  readonly lifecycle: SocialEncounterLifecycleState
  readonly lifecycleEvents: readonly SocialEncounterEvent[]
  readonly candidates: readonly SpatialCandidateSample[]
  readonly perceptions: readonly DirectedPerceptionSample[]
  readonly interruptedInteractionIds: ReadonlySet<string>
  readonly interactionsEnabled: boolean
}

export interface SocialTickResultV1 {
  readonly citizens: readonly CitizenStateV5[]
  readonly social: SocialStateV1
}

const PUBLIC_STOP_KINDS = new Set(['retail', 'cafe', 'mall', 'plaza', 'park', 'transit'])

function actorInput(citizen: CitizenStateV5, world: WorldModelV2,
  terminalStationaryContact: boolean): SocialActorInputV1 {
  const place = citizen.placeId ? world.places.find((item) => item.id === citizen.placeId) : null
  const node = citizen.currentNodeId ? world.navNodes.find((item) =>
    item.id === citizen.currentNodeId) : null
  const atSlot = Boolean(place && node && place.slotNodeIds.includes(node.id) &&
    place.surfaceIds.includes(citizen.surfaceId) && node.surfaceId === citizen.surfaceId &&
    node.position.x === citizen.position.x && node.position.y === citizen.position.y &&
    node.position.z === citizen.position.z)
  return { agentId: citizen.id, activity: citizen.activity,
    placeId: citizen.placeId, surfaceId: citizen.surfaceId,
    currentNodeId: citizen.currentNodeId, nextDecisionTick: citizen.nextDecisionTick,
    isStationaryPublic: Boolean(terminalStationaryContact && atSlot && place &&
      PUBLIC_STOP_KINDS.has(place.kind) &&
      citizen.activity === 'atDestination' && citizen.route.length === 0),
    hasActiveInteraction: Boolean(citizen.engagement) }
}

function interactionEvent(interaction: Pick<SocialInteractionV1, 'id' | 'participantIds'>, tick: number,
  type: SocialInteractionEventV1['type']): SocialInteractionEventV1 {
  return { id: `${type}:${interaction.id}:${tick}`, tick,
    interactionId: interaction.id, participantIds: interaction.participantIds, type }
}

/** Domain integration runs after movement; all social effects enter the next movement Tick. */
export function advanceSocialTickV1(input: SocialTickInputV1): SocialTickResultV1 {
  const { world, config, tick, previous, lifecycle, lifecycleEvents, candidates,
    perceptions, interruptedInteractionIds, interactionsEnabled } = input
  if (!Number.isSafeInteger(tick) || tick < 1) throw new Error('Invalid social Tick')
  const citizenById = new Map(input.citizens.map((citizen) => [citizen.id, citizen]))
  const relationships = new Map(previous.relationships.map((relation) =>
    [JSON.stringify([relation.ownerAgentId, relation.referentAgentId]),
      decayDirectedRelationshipV1(relation, tick, config)]))
  const memoryGroups = new Map<string, AgentMemoryV1[]>()
  const knowledgeGroups = new Map<string, AgentKnowledgeV1[]>()
  for (const memory of previous.memories) {
    const group = memoryGroups.get(memory.ownerAgentId) ?? []
    group.push(memory)
    memoryGroups.set(memory.ownerAgentId, group)
  }
  for (const record of previous.knowledge) {
    const group = knowledgeGroups.get(record.ownerAgentId) ?? []
    group.push(record)
    knowledgeGroups.set(record.ownerAgentId, group)
  }
  const memories = new Map<string, readonly AgentMemoryV1[]>()
  const knowledge = new Map<string, readonly AgentKnowledgeV1[]>()
  for (const citizen of input.citizens) {
    memories.set(citizen.id, decayMemoriesV1(memoryGroups.get(citizen.id) ?? [], tick, config))
    knowledge.set(citizen.id, (knowledgeGroups.get(citizen.id) ?? []).filter((item) =>
      item.expiresTick === null || item.expiresTick > tick))
  }
  const newInteractionEvents: SocialInteractionEventV1[] = []
  const decisionTraces: EncounterDecisionTraceV1[] = []
  const newDecisions = [] as SocialStateV1['interactionDecisions'][number][]
  const interactions: SocialInteractionV1[] = []
  const profiles = new Map(input.citizens.map((citizen) =>
    [citizen.id, createSocialProfileV1(citizen.id, config.seed)]))

  function experience(ownerAgentId: string, referentAgentId: string,
    kind: RelationshipExperienceV1, interaction?: SocialInteractionV1,
    claimedDisplayName?: string): void {
    const ownerProfile = profiles.get(ownerAgentId)
    if (!ownerProfile || !profiles.has(referentAgentId)) return
    const subjectToken = createRecognitionTokenV1(config.seed, ownerAgentId, referentAgentId)
    const key = JSON.stringify([ownerAgentId, referentAgentId])
    const prior = relationships.get(key) ?? null
    let relation = updateDirectedRelationshipV1(prior,
      ownerAgentId, referentAgentId, subjectToken, tick, kind, config,
      ownerProfile.attention)
    if (claimedDisplayName !== undefined) {
      relation = setRelationshipIdentityBeliefV1(relation, claimedDisplayName, tick)
    }
    relationships.set(key, relation)
    if (!interaction) return
    const memory: AgentMemoryV1 = {
      id: `memory:${interaction.id}:${ownerAgentId}`,
      ownerAgentId, category: 'interaction', subjectToken,
      placeId: interaction.placeId, surfaceId: interaction.surfaceId,
      createdTick: tick, lastUpdatedTick: tick, source: 'interaction',
      provenanceId: interaction.id, observationCode: interaction.type,
      confidence: Math.min(1, 0.55 + 0.4 * ownerProfile.attention),
      salience: interaction.type === 'conversation' ? 0.7 : 0.4,
    }
    memories.set(ownerAgentId, rememberExperienceV1(memories.get(ownerAgentId) ?? [],
      memory, config, tick))
    const observation: AgentKnowledgeV1 = {
      id: `recognition:${ownerAgentId}:${subjectToken}`,
      ownerAgentId, kind: 'visualRecognition', subjectToken, acquiredTick: tick,
      source: 'interaction', provenanceId: interaction.id,
      confidence: Math.min(1, 0.45 + 0.45 * ownerProfile.recognitionAcuity),
      believedIdentity: null, expiresTick: null,
    }
    knowledge.set(ownerAgentId, upsertKnowledgeV1(knowledge.get(ownerAgentId) ?? [],
      observation, config, tick))
    if (claimedDisplayName !== undefined) {
      const claim: AgentKnowledgeV1 = {
        id: `identity:${ownerAgentId}:${subjectToken}`,
        ownerAgentId, kind: 'identityBelief', subjectToken, acquiredTick: tick,
        source: 'interaction', provenanceId: interaction.id,
        confidence: 0.82, believedIdentity: claimedDisplayName, expiresTick: null,
      }
      knowledge.set(ownerAgentId, upsertKnowledgeV1(knowledge.get(ownerAgentId) ?? [],
        claim, config, tick))
    }
  }

  function applyCompleted(interaction: SocialInteractionV1): void {
    const [first, second] = interaction.participantIds
    const revealsName = (speakerId: string): boolean => interaction.type === 'conversation' &&
      (hashSeed(`${config.seed}\u0000name-disclosure-v1\u0000${interaction.id}\u0000${speakerId}`) /
        4294967296) < config.nameExchangeProbability * profiles.get(speakerId)!.sociability
    experience(first, second, interaction.type, interaction,
      revealsName(second) ? createCitizenIdentity(second).displayName : undefined)
    experience(second, first, interaction.type, interaction,
      revealsName(first) ? createCitizenIdentity(first).displayName : undefined)
  }

  for (const previousInteraction of previous.interactions) {
    if (previousInteraction.status !== 'active') {
      interactions.push(previousInteraction)
      continue
    }
    if (interruptedInteractionIds.has(previousInteraction.id)) {
      interactions.push({ ...previousInteraction, status: 'interrupted', endTick: tick })
      newInteractionEvents.push(interactionEvent(previousInteraction, tick, 'Interrupted'))
    } else if (tick >= previousInteraction.plannedEndTick) {
      const completed = { ...previousInteraction, status: 'completed' as const, endTick: tick }
      interactions.push(completed)
      newInteractionEvents.push(interactionEvent(completed, tick, 'Completed'))
      applyCompleted(completed)
    } else {
      interactions.push(previousInteraction)
      if (tick === previousInteraction.startTick) {
        newInteractionEvents.push(interactionEvent(previousInteraction, tick, 'Started'))
      }
    }
  }

  const samplesByPair = new Map<string, SpatialCandidateSample[]>()
  for (const sample of candidates) {
    const list = samplesByPair.get(sample.pairKey) ?? []
    list.push(sample)
    samplesByPair.set(sample.pairKey, list)
  }
  const perceivedByPair = new Map<string, Set<string>>()
  for (const sample of perceptions) if (sample.actuallyPerceived) {
    const set = perceivedByPair.get(sample.pairKey) ?? new Set<string>()
    set.add(sample.observerAgentId)
    perceivedByPair.set(sample.pairKey, set)
  }
  const priorDecisions = new Map(previous.interactionDecisions.map((item) =>
    [JSON.stringify([item.encounterId, item.phase]), item]))
  const priorEpisodes = new Map(previous.encounters.active.map((item) => [item.id, item]))
  for (const episode of [...lifecycle.active].sort((a, b) => a.id.localeCompare(b.id))) {
    const [firstId, secondId] = episode.participantIds
    const first = citizenById.get(firstId)
    const second = citizenById.get(secondId)
    if (!first || !second) continue
    const perceived = perceivedByPair.get(episode.pairKey) ?? new Set<string>()
    const pairSamples = samplesByPair.get(episode.pairKey) ?? []
    const contactThisTick = pairSamples.length > 0
    const terminalSeconds = Array.from({ length: config.minimumStationaryContactSeconds },
      (_, index) => 6 - index)
    const terminalStationaryContact = episode.placeId !== null &&
      terminalSeconds.every((second) => pairSamples.some((sample) =>
        sample.second === second && sample.placeId === episode.placeId &&
        sample.surfaceId === episode.surfaceId &&
        sample.first.activity === 'atDestination' &&
        sample.secondTrace.activity === 'atDestination' &&
        sample.firstSpeedMmPerSecond <= 200 &&
        sample.secondSpeedMmPerSecond <= 200))
    if (contactThisTick) {
      const previouslyPerceived = new Set(priorEpisodes.get(episode.id)?.perceivedBy ?? [])
      if (perceived.has(firstId) && !previouslyPerceived.has(firstId)) {
        experience(firstId, secondId, 'noticed')
      }
      if (perceived.has(secondId) && !previouslyPerceived.has(secondId)) {
        experience(secondId, firstId, 'noticed')
      }
    }
    if (!interactionsEnabled || !contactThisTick ||
      !perceived.has(firstId) || !perceived.has(secondId)) continue
    const initialDecision = priorDecisions.get(JSON.stringify([episode.id, 'initial']))
    const settledDecision = priorDecisions.get(JSON.stringify([episode.id, 'settled']))
    const phase = initialDecision === undefined ? 'initial' :
      terminalStationaryContact && tick > initialDecision.tick &&
        settledDecision === undefined ? 'settled' : null
    if (phase === null) continue
    const firstProfile = profiles.get(firstId)!
    const secondProfile = profiles.get(secondId)!
    const firstRelation = relationships.get(JSON.stringify([firstId, secondId]))
    const secondRelation = relationships.get(JSON.stringify([secondId, firstId]))
    const evaluation = evaluateMutualInteractionV1({ ...episode,
      contactThisTick, currentPerceivedBy: [...perceived] },
    actorInput(first, world, terminalStationaryContact),
    actorInput(second, world, terminalStationaryContact), firstProfile, secondProfile,
    tick, config, firstRelation, secondRelation, phase)
    const { decision, diagnostics } = evaluation
    newDecisions.push(decision)
    priorDecisions.set(JSON.stringify([episode.id, phase]), decision)
    if (config.diagnosticTraces) decisionTraces.push({
      episodeId: episode.id, tick, phase, participantIds: episode.participantIds,
      minDistanceMm: episode.minDistanceMm,
      contactSeconds: episode.contactSeconds,
      firstPerceived: perceived.has(firstId), secondPerceived: perceived.has(secondId),
      interactionDecisionId: decision.id,
      ...diagnostics,
      spatialRule: 'sameSurfaceOrOpenPortal',
      perceptionModel: 'surface-portal-blocker-heading',
    })
    const interaction = materializeInteractionV1(decision)
    if (interaction) {
      interactions.push(interaction)
      newInteractionEvents.push(interactionEvent(interaction, tick, 'Attempted'))
      if (interaction.type === 'greeting') {
        newInteractionEvents.push(interactionEvent(interaction, tick, 'Started'))
        newInteractionEvents.push(interactionEvent(interaction, tick, 'Completed'))
        applyCompleted(interaction)
      } else {
        for (const id of interaction.participantIds) {
          const citizen = citizenById.get(id)!
          const otherId = interaction.participantIds.find((participantId) => participantId !== id)!
          const other = citizenById.get(otherId)!
          const dx = other.position.x - citizen.position.x
          const dz = other.position.z - citizen.position.z
          const facingHeading = Math.hypot(dx, dz) >= 100 ? Math.atan2(dx, dz) :
            citizen.headingRadians
          citizenById.set(id, { ...citizen, engagement: {
            interactionId: interaction.id,
            resumeDecisionTick: citizen.nextDecisionTick + interaction.plannedEndTick -
              interaction.startTick,
          }, headingRadians: facingHeading })
        }
      }
    } else if (decision.firstAccepted || decision.secondAccepted) {
      const stub = { id: decision.id, participantIds: decision.participantIds }
      newInteractionEvents.push(interactionEvent(stub, tick, 'Attempted'))
      newInteractionEvents.push(interactionEvent(stub, tick, 'Rejected'))
    }
  }
  const flatten = <T>(source: Map<string, readonly T[]>): readonly T[] =>
    [...source.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, items]) => items)
  const interactionIdsByEncounter = new Map<string, string[]>()
  for (const interaction of interactions) {
    const ids = interactionIdsByEncounter.get(interaction.encounterId) ?? []
    ids.push(interaction.id)
    interactionIdsByEncounter.set(interaction.encounterId, ids)
  }
  const linkInteractions = (episode: SocialEncounterEpisode): SocialEncounterEpisode => {
    const ids = interactionIdsByEncounter.get(episode.id)
    if (!ids?.length) return episode
    const linked = [...new Set([...episode.interactionIds, ...ids])].sort()
    return linked.length === episode.interactionIds.length &&
      linked.every((id, index) => id === episode.interactionIds[index]) ? episode :
      { ...episode, interactionIds: linked }
  }
  const social: SocialStateV1 = {
    ...previous, encounters: { ...lifecycle,
      active: lifecycle.active.map(linkInteractions),
      completed: lifecycle.completed.map(linkInteractions) },
    encounterEvents: [...previous.encounterEvents, ...lifecycleEvents],
    interactions,
    interactionDecisions: [...previous.interactionDecisions, ...newDecisions],
    interactionEvents: [...previous.interactionEvents, ...newInteractionEvents],
    decisionTraces: config.diagnosticTraces ?
      [...previous.decisionTraces, ...decisionTraces]
        .slice(-config.diagnosticTraceCapacity) : previous.decisionTraces,
    relationships: [...relationships.values()].sort((a: DirectedRelationshipV1,
      b: DirectedRelationshipV1) => a.ownerAgentId.localeCompare(b.ownerAgentId) ||
        a.referentAgentId.localeCompare(b.referentAgentId)),
    memories: flatten(memories), knowledge: flatten(knowledge),
  }
  return { citizens: input.citizens.map((citizen) => citizenById.get(citizen.id)!), social }
}
