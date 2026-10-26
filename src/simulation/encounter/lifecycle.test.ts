import { describe, expect, it } from 'vitest'
import { EMPTY_SOCIAL_ENCOUNTERS, updateSocialEncounterLifecycle,
  validateSocialEncounterConfig,
  type SocialEncounterLifecycleState } from './lifecycle'
import type { DirectedPerceptionSample, SpatialCandidateSample } from './spatialTypes'

const config = { enterDistanceMm: 2_400, exitDistanceMm: 3_200,
  minContactSeconds: 2, exitGraceSeconds: 6, cooldownSeconds: 2 }
const sample = (second: number, distanceMm = 1_000): SpatialCandidateSample => ({
  pairKey: '["a","b"]', participantIds: ['a', 'b'], second, distanceMm,
  relation: 'sameSurface', surfaceId: 'plaza', placeId: 'plaza',
  first: { agentId: 'a', second, position: { x: 0, y: 0, z: 0 }, surfaceId: 'plaza',
    placeId: 'plaza', edgeId: null },
  secondTrace: { agentId: 'b', second, position: { x: distanceMm, y: 0, z: 0 },
    surfaceId: 'plaza', placeId: 'plaza', edgeId: null },
  firstSpeedMmPerSecond: 0, secondSpeedMmPerSecond: 0 })
const noticed = (second: number): DirectedPerceptionSample => ({
  pairKey: '["a","b"]', second, observerAgentId: 'a', targetAgentId: 'b',
  distanceMm: 1_000, physicallyNear: true, potentiallyVisible: true,
  actuallyPerceived: true, approximation: 'surface-portal-blocker-heading' })
const step = (state: SocialEncounterLifecycleState, tick: number,
  samples: SpatialCandidateSample[], perceptions: DirectedPerceptionSample[] = []) =>
  updateSocialEncounterLifecycle(state, samples, perceptions, tick, 6, config)

describe('social encounter lifecycle', () => {
  it('requires sustained near contact and perception, then emits one start', () => {
    const one = step(EMPTY_SOCIAL_ENCOUNTERS, 1, [sample(1)], [noticed(1)])
    expect(one.events).toHaveLength(0)
    expect(one.state.pending).toHaveLength(1)
    const two = step(EMPTY_SOCIAL_ENCOUNTERS, 1, [sample(1), sample(2)], [noticed(1)])
    expect(two.events.map((event) => event.type)).toEqual(['EncounterStarted'])
    expect(two.state.active[0].contactSeconds).toBe(2)
    const noNotice = step(EMPTY_SOCIAL_ENCOUNTERS, 1, [sample(1), sample(2)])
    expect(noNotice.events).toHaveLength(0)
  })

  it('maintains one episode through exit hysteresis and creates a new one after cooldown', () => {
    const start = step(EMPTY_SOCIAL_ENCOUNTERS, 1, [sample(5), sample(6)], [noticed(5)])
    expect(start.events.map((event) => event.type)).toEqual(['EncounterStarted'])
    expect(start.state.active).toHaveLength(1)
    const continuation = step(start.state, 2, [sample(1, 3_000)], [])
    expect(continuation.events).toHaveLength(0)
    expect(continuation.state.active[0].contactSeconds).toBe(3)
    expect(continuation.state.active[0].proximityDurationTicks).toBe(2)
    const end = step(continuation.state, 3, [])
    expect(end.events.map((event) => event.type)).toEqual(['EncounterEnded'])
    const repeat = step(end.state, 4, [sample(1), sample(2)], [noticed(1)])
    expect(repeat.events.map((event) => event.type)).toEqual(['EncounterStarted'])
    expect(repeat.state.completed).toHaveLength(1)
    expect(repeat.state.active[0].id).not.toBe(repeat.state.completed[0].id)
  })

  it('does not start an encounter for an unperceived or one-second crossing', () => {
    expect(step(EMPTY_SOCIAL_ENCOUNTERS, 1, [sample(1)], [noticed(1)]).state.active)
      .toHaveLength(0)
    expect(step(EMPTY_SOCIAL_ENCOUNTERS, 1, [sample(1), sample(2)]).state.active)
      .toHaveLength(0)
  })

  it('enforces the exact cooldown boundary before a second episode may start', () => {
    const short = { ...config, exitGraceSeconds: 2, cooldownSeconds: 3 }
    const first = updateSocialEncounterLifecycle(EMPTY_SOCIAL_ENCOUNTERS,
      [sample(1), sample(2), sample(4), sample(5), sample(6)],
      [noticed(1), noticed(4), noticed(5), noticed(6)], 1, 6, short)
    expect(first.events.map((event) => event.type)).toEqual(['EncounterStarted', 'EncounterEnded'])
    expect(first.state.pending).toHaveLength(0)
    const secondEpisode = updateSocialEncounterLifecycle(first.state, [sample(1), sample(2)],
      [noticed(1)], 2, 6, short)
    expect(secondEpisode.events[0]?.type).toBe('EncounterStarted')
    expect(secondEpisode.state.completed[1].id).not.toBe(first.state.completed[0].id)
  })

  it('rejects impossible duration and hysteresis settings at environment creation', () => {
    expect(() => validateSocialEncounterConfig({ ...config,
      exitGraceSeconds: 1 }, 6)).toThrow('Invalid social encounter configuration')
  })
})
