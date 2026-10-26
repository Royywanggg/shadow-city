import { describe, expect, it } from 'vitest'
import { decideMutualInteractionV1, materializeInteractionV1,
  validateSocialConfigV1 } from './interaction'
import { createRecognitionTokenV1, decayMemoriesV1, rememberExperienceV1,
  upsertKnowledgeV1 } from './memory'
import { createSocialProfileV1 } from './socialProfiles'
import { relationshipCategoryV1, setRelationshipIdentityBeliefV1,
  updateDirectedRelationshipV1 } from './relationships'
import type { AgentKnowledgeV1, AgentMemoryV1, SocialActorInputV1,
  SocialConfigV1, SocialEncounterInputV1, SocialProfileV1 } from './socialTypes'
import { DEFAULT_SOCIAL_CONFIG_V1 } from './socialTypes'

const config: SocialConfigV1 = { ...DEFAULT_SOCIAL_CONFIG_V1,
  greetingWillingness: 1, conversationWillingness: 1 }
const episode: SocialEncounterInputV1 = { id: 'encounter-1',
  participantIds: ['citizen-1', 'citizen-2'], perceivedBy: ['citizen-1', 'citizen-2'],
  status: 'active', placeId: 'plaza', surfaceId: 'plaza-l0', interactionIds: [] }
const actor = (agentId: string, overrides: Partial<SocialActorInputV1> = {}): SocialActorInputV1 => ({
  agentId, activity: 'atDestination', placeId: 'plaza', surfaceId: 'plaza-l0',
  currentNodeId: `${agentId}-slot`, nextDecisionTick: 30,
  isStationaryPublic: true, hasActiveInteraction: false, ...overrides,
})
const profile = (agentId: string, sociability = 1): SocialProfileV1 => ({
  agentId, sociability, attention: 1, recognitionAcuity: 1, interactionPatience: 1,
})

describe('social interaction decisions', () => {
  it('rejects malformed replay configuration booleans', () => {
    expect(() => validateSocialConfigV1({ ...config,
      diagnosticTraces: 'true' as unknown as boolean })).toThrow()
  })
  it('requires bilateral willingness and saves a conversation lock for the next Tick', () => {
    const one = actor('citizen-1')
    const two = actor('citizen-2')
    const decision = decideMutualInteractionV1(episode, one, two,
      profile(one.agentId), profile(two.agentId), 10, config, null, null, 'settled')
    expect(decision.type).toBe('conversation')
    expect(decision.firstAccepted && decision.secondAccepted).toBe(true)
    const interaction = materializeInteractionV1(decision)
    expect(interaction?.startTick).toBe(11)
    expect(interaction?.plannedEndTick).toBe(11 + decision.durationTicks)
    expect(interaction?.status).toBe('active')
    const refused = decideMutualInteractionV1(episode, one, two,
      profile(one.agentId), profile(two.agentId, 0), 10, config,
      null, null, 'settled')
    expect(refused.type).toBe('none')
    expect(refused.secondAccepted).toBe(false)
  })

  it('never starts a conversation in motion, in private space, or from one-sided perception', () => {
    const first = actor('citizen-1', { activity: 'travelling', isStationaryPublic: false })
    const second = actor('citizen-2')
    expect(decideMutualInteractionV1(episode, first, second,
      profile(first.agentId), profile(second.agentId), 10, config).type).toBe('greeting')
    expect(decideMutualInteractionV1(episode,
      actor('citizen-1', { isStationaryPublic: false }), second,
      profile(first.agentId), profile(second.agentId), 10, config).type).toBe('greeting')
    expect(decideMutualInteractionV1({ ...episode, perceivedBy: ['citizen-1'] },
      actor('citizen-1'), second, profile(first.agentId), profile(second.agentId),
      10, config).type).toBe('none')
    expect(decideMutualInteractionV1({ ...episode, contactThisTick: false },
      actor('citizen-1'), second, profile(first.agentId), profile(second.agentId),
      10, config).type).toBe('none')
    expect(decideMutualInteractionV1({ ...episode, currentPerceivedBy: ['citizen-1'] },
      actor('citizen-1'), second, profile(first.agentId), profile(second.agentId),
      10, config).type).toBe('none')
  })

  it('uses an independent social seed and stable episode keyed draws', () => {
    expect(createSocialProfileV1('citizen-1', 'social-a'))
      .toEqual(createSocialProfileV1('citizen-1', 'social-a'))
    expect(createSocialProfileV1('citizen-1', 'social-a'))
      .not.toEqual(createSocialProfileV1('citizen-1', 'social-b'))
    const decide = () => decideMutualInteractionV1(episode,
      actor('citizen-1'), actor('citizen-2'),
      profile('citizen-1'), profile('citizen-2'), 10, config)
    expect(decide()).toEqual(decide())
    expect(decide().phase).toBe('initial')
  })
})

describe('subjective social state', () => {
  it('keeps relationships directed and refuses to infer friendship from passing', () => {
    const abToken = createRecognitionTokenV1(config.seed, 'citizen-1', 'citizen-2')
    const baToken = createRecognitionTokenV1(config.seed, 'citizen-2', 'citizen-1')
    expect(abToken).not.toBe(baToken)
    expect(abToken).not.toContain('citizen-2')
    let ab = updateDirectedRelationshipV1(null, 'citizen-1', 'citizen-2',
      abToken, 1, 'noticed', config, 1)
    for (let tick = 2; tick <= 100; tick += 1) {
      ab = updateDirectedRelationshipV1(ab, 'citizen-1', 'citizen-2',
        abToken, tick, 'noticed', config, 1)
    }
    expect(relationshipCategoryV1(ab)).toBe('stranger')
    const ba = updateDirectedRelationshipV1(null, 'citizen-2', 'citizen-1',
      baToken, 1, 'disagreement', config, 0)
    expect(ab.trust).not.toBe(ba.trust)
    expect(ba.believedIdentity).toBeNull()
    expect(setRelationshipIdentityBeliefV1(ab, 'Claimed Name', 100).believedIdentity)
      .toBe('Claimed Name')
  })

  it('bounds memory and knowledge and replays decay identically', () => {
    const shortConfig = { ...config, memoryCapacity: 2, knowledgeCapacity: 2,
      memoryHalfLifeTicks: 10 }
    const subjectToken = createRecognitionTokenV1(config.seed, 'citizen-1', 'citizen-2')
    const makeMemory = (number: number): AgentMemoryV1 => ({
      id: `memory-${number}`, ownerAgentId: 'citizen-1', category: 'interaction',
      subjectToken, placeId: 'plaza', surfaceId: 'plaza-l0',
      createdTick: number, lastUpdatedTick: number, source: 'interaction',
      provenanceId: `interaction-${number}`, observationCode: 'greeting',
      confidence: 0.9, salience: number / 10,
    })
    const replay = () => {
      let memories: readonly AgentMemoryV1[] = []
      for (let number = 1; number <= 3; number += 1) {
        memories = rememberExperienceV1(memories, makeMemory(number), shortConfig, number)
      }
      return decayMemoriesV1(memories, 10, shortConfig)
    }
    expect(replay()).toEqual(replay())
    expect(replay()).toHaveLength(2)
    const makeKnowledge = (number: number): AgentKnowledgeV1 => ({
      id: `knowledge-${number}`, ownerAgentId: 'citizen-1', kind: 'visualRecognition',
      subjectToken, acquiredTick: number, source: 'direct', provenanceId: null,
      confidence: 0.8, believedIdentity: null, expiresTick: null,
    })
    let knowledge: readonly AgentKnowledgeV1[] = []
    for (let number = 1; number <= 3; number += 1) {
      knowledge = upsertKnowledgeV1(knowledge, makeKnowledge(number), shortConfig, number)
    }
    expect(knowledge).toHaveLength(2)
    expect(knowledge.every((item) => item.believedIdentity === null)).toBe(true)
  })
})
