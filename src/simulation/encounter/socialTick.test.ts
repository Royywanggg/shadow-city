import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import type { CitizenStateV5 } from '../v5Types'
import { createInitialSocialStateV1 } from './state'
import { advanceSocialTickV1 } from './socialTick'
import type { DirectedPerceptionSample, SpatialCandidateSample } from './spatialTypes'
import { canonicalPair } from './spatialTypes'
import type { SocialEncounterEpisode, SocialEncounterLifecycleState } from './lifecycle'
import { DEFAULT_SOCIAL_CONFIG_V1 } from './socialTypes'
import type { SocialInteractionV1 } from './socialTypes'

const world = generateIntegratedWorld()
const place = world.places.find((item) => item.kind === 'plaza' && item.slotNodeIds.length > 0)!
const node = world.navNodes.find((item) => item.id === place.slotNodeIds[0])!
const pair = canonicalPair('citizen-1', 'citizen-2')
const citizen = (id: string): CitizenStateV5 => ({ id,
  activity: 'atDestination', activityKind: 'leisure', movementMode: 'walk',
  position: node.position, surfaceId: node.surfaceId, placeId: place.id,
  currentNodeId: node.id, destinationPlaceId: null, destinationNodeId: null,
  reservedSlotNodeId: node.id, route: [], routeIndex: 0, distanceOnEdgeMm: 0,
  headingRadians: 0, tripOrdinal: 1, nextDecisionTick: 20,
  visitOrdinal: 1, arrivedTick: 0 })
const citizens = [citizen('citizen-1'), citizen('citizen-2')]
const episode: SocialEncounterEpisode = { id: 'social-encounter:pair:1',
  pairKey: pair.key, participantIds: pair.ids, startedTick: 1,
  startedSecond: 1, endedTick: null, endedSecond: null, status: 'active',
  contactSeconds: 2, proximityDurationTicks: 1, lastContactGlobalSecond: 2,
  minDistanceMm: 1000, surfaceId: node.surfaceId, placeId: place.id,
  perceivedBy: pair.ids, interactionIds: [] }
const lifecycle: SocialEncounterLifecycleState = { pending: [], active: [episode],
  completed: [], cooldownUntilSecond: {} }
const firstTrace = { agentId: pair.ids[0], second: 1, position: node.position,
  surfaceId: node.surfaceId, placeId: place.id, edgeId: null }
const secondTrace = { ...firstTrace, agentId: pair.ids[1] }
const sample: SpatialCandidateSample = { pairKey: pair.key, participantIds: pair.ids,
  second: 1, distanceMm: 1000, relation: 'sameSurface', surfaceId: node.surfaceId,
  placeId: place.id, first: firstTrace, secondTrace,
  firstSpeedMmPerSecond: 0, secondSpeedMmPerSecond: 0 }
const perception = (observerAgentId: string): DirectedPerceptionSample => ({
  pairKey: pair.key, second: 1, observerAgentId,
  targetAgentId: observerAgentId === pair.ids[0] ? pair.ids[1] : pair.ids[0],
  distanceMm: 1000, physicallyNear: true, potentiallyVisible: true,
  actuallyPerceived: true, approximation: 'surface-portal-blocker-heading',
})

describe('social Tick integration', () => {
  it('requires current contact and mutual perception; decision occurs only once per episode', () => {
    const base = { world, config: DEFAULT_SOCIAL_CONFIG_V1, tick: 1, citizens,
      previous: createInitialSocialStateV1(), lifecycle,
      lifecycleEvents: [{ id: 'start', type: 'EncounterStarted' as const,
        episodeId: episode.id, tick: 1, second: 2 }],
      interruptedInteractionIds: new Set<string>(), interactionsEnabled: true }
    const noContact = advanceSocialTickV1({ ...base, candidates: [],
      perceptions: [perception(pair.ids[0]), perception(pair.ids[1])] })
    expect(noContact.social.interactionDecisions).toHaveLength(0)
    const oneSided = advanceSocialTickV1({ ...base, candidates: [sample],
      perceptions: [perception(pair.ids[0])] })
    expect(oneSided.social.interactionDecisions).toHaveLength(0)
    expect(oneSided.social.relationships.map((item) => item.ownerAgentId))
      .toEqual([pair.ids[0]])
    const both = advanceSocialTickV1({ ...base, candidates: [sample],
      perceptions: [perception(pair.ids[0]), perception(pair.ids[1])] })
    expect(both.social.interactionDecisions).toHaveLength(1)
    const replay = advanceSocialTickV1({ ...base, candidates: [sample],
      perceptions: [perception(pair.ids[0]), perception(pair.ids[1])] })
    expect(replay).toEqual(both)
    const later = advanceSocialTickV1({ ...base, tick: 2, citizens: both.citizens,
      previous: both.social, lifecycleEvents: [], candidates: [sample],
      perceptions: [perception(pair.ids[0]), perception(pair.ids[1])] })
    expect(later.social.interactionDecisions).toHaveLength(1)
  })

  it('learns a claimed name only through a completed conversation, direction by direction', () => {
    const run = (interactionId: string, nameExchangeProbability: number) => {
      const conversation: SocialInteractionV1 = {
        id: interactionId, encounterId: 'prior-encounter', participantIds: pair.ids,
        type: 'conversation', status: 'active', decisionTick: 0,
        startTick: 1, plannedEndTick: 2, endTick: null,
        placeId: place.id, surfaceId: node.surfaceId,
      }
      return advanceSocialTickV1({ world,
        config: { ...DEFAULT_SOCIAL_CONFIG_V1, nameExchangeProbability },
        tick: 2, citizens, previous: { ...createInitialSocialStateV1(),
          interactions: [conversation] },
        lifecycle: { pending: [], active: [], completed: [], cooldownUntilSecond: {} },
        lifecycleEvents: [], candidates: [], perceptions: [],
        interruptedInteractionIds: new Set(), interactionsEnabled: true })
    }
    const unknown = run('conversation-no-name', 0)
    expect(unknown.social.interactionEvents.filter((item) => item.type === 'Completed'))
      .toHaveLength(1)
    expect(unknown.social.knowledge.some((item) => item.kind === 'identityBelief')).toBe(false)
    expect(unknown.social.relationships.every((item) => item.believedIdentity === null)).toBe(true)
    let asymmetric: ReturnType<typeof run> | null = null
    for (let number = 0; number < 100 && !asymmetric; number += 1) {
      const candidate = run(`conversation-${number}`, 1)
      if (candidate.social.knowledge.filter((item) => item.kind === 'identityBelief').length === 1) {
        asymmetric = candidate
      }
    }
    expect(asymmetric).not.toBeNull()
    const belief = asymmetric!.social.knowledge.find((item) => item.kind === 'identityBelief')!
    const otherOwner = pair.ids.find((id) => id !== belief.ownerAgentId)!
    expect(asymmetric!.social.knowledge.some((item) => item.kind === 'identityBelief' &&
      item.ownerAgentId === otherOwner)).toBe(false)
    expect(asymmetric!.social.relationships.find((item) =>
      item.ownerAgentId === belief.ownerAgentId)?.believedIdentity).toBe(belief.believedIdentity)
    expect(asymmetric!.social.relationships.find((item) =>
      item.ownerAgentId === otherOwner)?.believedIdentity).toBeNull()
    expect(run('conversation-no-name', 0)).toEqual(unknown)
  })

  it('interrupts a conversation without manufacturing a completed memory', () => {
    const active: SocialInteractionV1 = { id: 'conversation-interrupted',
      encounterId: 'prior-encounter', participantIds: pair.ids,
      type: 'conversation', status: 'active', decisionTick: 0,
      startTick: 1, plannedEndTick: 5, endTick: null,
      placeId: place.id, surfaceId: node.surfaceId }
    const result = advanceSocialTickV1({ world, config: DEFAULT_SOCIAL_CONFIG_V1,
      tick: 2, citizens, previous: { ...createInitialSocialStateV1(), interactions: [active] },
      lifecycle: { pending: [], active: [], completed: [], cooldownUntilSecond: {} },
      lifecycleEvents: [], candidates: [], perceptions: [],
      interruptedInteractionIds: new Set([active.id]), interactionsEnabled: true })
    expect(result.social.interactions[0].status).toBe('interrupted')
    expect(result.social.interactionEvents.map((item) => item.type)).toEqual(['Interrupted'])
    expect(result.social.memories).toHaveLength(0)
    expect(result.social.knowledge).toHaveLength(0)
  })

  it('does not convert an arrival during the Tick into a stationary conversation', () => {
    const socialConfig = { ...DEFAULT_SOCIAL_CONFIG_V1,
      conversationWillingness: 1, greetingWillingness: 0 }
    const stationarySamples = [5, 6].map((second): SpatialCandidateSample => ({
      ...sample, second,
      first: { ...sample.first, second, activity: 'atDestination' },
      secondTrace: { ...sample.secondTrace, second, activity: 'atDestination' },
    }))
    const perceptions = [perception(pair.ids[0]), perception(pair.ids[1])]
      .map((item) => ({ ...item, second: 6 }))
    const run = (id: string, samples: readonly SpatialCandidateSample[]) => {
      const currentLifecycle = { ...lifecycle, active: [{ ...episode, id }] }
      const first = advanceSocialTickV1({ world, config: socialConfig, tick: 1,
        citizens, previous: createInitialSocialStateV1(),
        lifecycle: currentLifecycle, lifecycleEvents: [],
        candidates: [{ ...sample, first: { ...sample.first, activity: 'travelling' } }],
        perceptions: [perception(pair.ids[0]), perception(pair.ids[1])],
        interruptedInteractionIds: new Set(), interactionsEnabled: true })
      const second = advanceSocialTickV1({ world, config: socialConfig, tick: 2,
        citizens: first.citizens, previous: first.social,
        lifecycle: currentLifecycle, lifecycleEvents: [],
        candidates: samples, perceptions,
        interruptedInteractionIds: new Set(), interactionsEnabled: true })
      return { first, second }
    }
    let eligibleId: string | null = null
    for (let number = 0; number < 500 && eligibleId === null; number += 1) {
      const id = `stationary-encounter-${number}`
      if (run(id, stationarySamples).second.social.interactions.some((item) =>
        item.type === 'conversation')) eligibleId = id
    }
    expect(eligibleId).not.toBeNull()
    const arrivalSamples = stationarySamples.map((item) => item.second === 5 ? {
      ...item, first: { ...item.first, activity: 'travelling' as const,
        edgeId: 'last-edge' }, firstSpeedMmPerSecond: 1200,
    } : item)
    const arrived = run(eligibleId!, arrivalSamples)
    expect(arrived.first.social.interactionDecisions.map((item) => item.phase))
      .toEqual(['initial'])
    expect(arrived.second.social.interactionDecisions.map((item) => item.phase))
      .toEqual(['initial'])
    expect(arrived.second.social.interactions.some((item) => item.type === 'conversation')).toBe(false)
    expect(arrived.second.citizens.every((item) => item.engagement === undefined)).toBe(true)
    const settled = run(eligibleId!, stationarySamples)
    expect(settled.second.social.interactionDecisions.map((item) => item.phase))
      .toEqual(['initial', 'settled'])
    expect(settled.second.citizens.every((item) => item.engagement !== undefined)).toBe(true)
    const repeated = advanceSocialTickV1({ world, config: socialConfig, tick: 3,
      citizens: settled.second.citizens, previous: settled.second.social,
      lifecycle: { ...lifecycle, active: [{ ...episode, id: eligibleId! }] },
      lifecycleEvents: [], candidates: stationarySamples, perceptions,
      interruptedInteractionIds: new Set(), interactionsEnabled: true })
    expect(repeated.social.interactionDecisions.map((item) => item.phase))
      .toEqual(['initial', 'settled'])
    expect(repeated.social.interactions.filter((item) => item.type === 'conversation'))
      .toHaveLength(1)

    const nodeById = new Map(world.navNodes.map((item) => [item.id, item]))
    let distinct: { placeId: string; firstNodeId: string; secondNodeId: string } | null = null
    for (const candidatePlace of world.places.filter((item) => item.kind === 'retail')) {
      for (let firstIndex = 0; firstIndex < candidatePlace.slotNodeIds.length && !distinct;
        firstIndex += 1) {
        for (let secondIndex = firstIndex + 1;
          secondIndex < candidatePlace.slotNodeIds.length; secondIndex += 1) {
          const a = nodeById.get(candidatePlace.slotNodeIds[firstIndex])!
          const b = nodeById.get(candidatePlace.slotNodeIds[secondIndex])!
          const gap = Math.hypot(a.position.x - b.position.x,
            a.position.y - b.position.y, a.position.z - b.position.z)
          if (a.surfaceId === b.surfaceId && gap >= 100 && gap <= 3_200) {
            distinct = { placeId: candidatePlace.id, firstNodeId: a.id, secondNodeId: b.id }
            break
          }
        }
      }
      if (distinct) break
    }
    expect(distinct).not.toBeNull()
    const chosen = distinct!
    const firstNode = nodeById.get(chosen.firstNodeId)!
    const secondNode = nodeById.get(chosen.secondNodeId)!
    const participants = [
      { ...citizens[0], placeId: chosen.placeId, surfaceId: firstNode.surfaceId,
        position: firstNode.position, currentNodeId: firstNode.id },
      { ...citizens[1], placeId: chosen.placeId, surfaceId: secondNode.surfaceId,
        position: secondNode.position, currentNodeId: secondNode.id },
    ]
    const retailEpisode = { ...episode, id: eligibleId!, placeId: chosen.placeId,
      surfaceId: firstNode.surfaceId }
    const pairSample = (second: number, moving: boolean): SpatialCandidateSample => ({
      ...sample, second, placeId: chosen.placeId, surfaceId: firstNode.surfaceId,
      first: { ...sample.first, second, position: firstNode.position,
        surfaceId: firstNode.surfaceId, placeId: chosen.placeId,
        activity: moving ? 'travelling' : 'atDestination' },
      secondTrace: { ...sample.secondTrace, second, position: secondNode.position,
        surfaceId: secondNode.surfaceId, placeId: chosen.placeId,
        activity: 'atDestination' },
    })
    const retailLifecycle = { ...lifecycle, active: [retailEpisode] }
    const before = advanceSocialTickV1({ world, config: socialConfig, tick: 1,
      citizens: participants, previous: createInitialSocialStateV1(),
      lifecycle: retailLifecycle, lifecycleEvents: [], candidates: [pairSample(1, true)],
      perceptions: [perception(pair.ids[0]), perception(pair.ids[1])],
      interruptedInteractionIds: new Set(), interactionsEnabled: true })
    const facing = advanceSocialTickV1({ world, config: socialConfig, tick: 2,
      citizens: before.citizens, previous: before.social,
      lifecycle: retailLifecycle, lifecycleEvents: [],
      candidates: [pairSample(5, false), pairSample(6, false)], perceptions,
      interruptedInteractionIds: new Set(), interactionsEnabled: true })
    const conversation = facing.social.interactions.find((item) => item.type === 'conversation')!
    expect(conversation).toBeDefined()
    expect(facing.social.encounters.active[0].interactionIds).toEqual([conversation.id])
    const endedEpisode = { ...facing.social.encounters.active[0],
      status: 'ended' as const, endedTick: 3, endedSecond: 1 }
    const ended = advanceSocialTickV1({ world, config: socialConfig, tick: 3,
      citizens: facing.citizens, previous: facing.social,
      lifecycle: { pending: [], active: [], completed: [endedEpisode],
        cooldownUntilSecond: {} }, lifecycleEvents: [], candidates: [], perceptions: [],
      interruptedInteractionIds: new Set(), interactionsEnabled: false })
    expect(ended.social.encounters.completed[0].interactionIds).toEqual([conversation.id])
    expect(facing.citizens.map((item) => item.position)).toEqual(participants.map((item) => item.position))
    const dx = secondNode.position.x - firstNode.position.x
    const dz = secondNode.position.z - firstNode.position.z
    expect(facing.citizens[0].headingRadians).toBeCloseTo(Math.atan2(dx, dz))
    expect(facing.citizens[1].headingRadians).toBeCloseTo(Math.atan2(-dx, -dz))
  })
})
