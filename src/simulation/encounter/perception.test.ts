import { describe, expect, it } from 'vitest'
import type { CitizenStateV5 } from '../v5Types'
import { evaluatePerception, validatePerceptionConfig } from './perception'
import type { SpatialCandidateSample } from './spatialTypes'

const citizen = (id: string, headingRadians: number): CitizenStateV5 => ({ id,
  headingRadians, activity: 'atDestination' }) as CitizenStateV5

const sample: SpatialCandidateSample = { pairKey: '["a","b"]', participantIds: ['a', 'b'],
  second: 1, distanceMm: 1_500, relation: 'sameSurface', surfaceId: 'ground', placeId: 'plaza',
  first: { agentId: 'a', second: 1, position: { x: 0, y: 0, z: 0 }, surfaceId: 'ground',
    placeId: 'plaza', edgeId: null },
  secondTrace: { agentId: 'b', second: 1, position: { x: 0, y: 0, z: 1_500 },
    surfaceId: 'ground', placeId: 'plaza', edgeId: null },
  firstSpeedMmPerSecond: 0, secondSpeedMmPerSecond: 0 }

describe('directed perception', () => {
  it('distinguishes physical proximity, field of view, and actual attention', () => {
    const results = evaluatePerception([sample], [citizen('a', 0), citizen('b', 0)], 'seed', 1,
      { fieldOfViewDegrees: 180, closeAwarenessMm: 900,
        travellingAttention: 1, stationaryAttention: 1 })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ observerAgentId: 'a', physicallyNear: true,
      potentiallyVisible: true, actuallyPerceived: true })
    expect(results[1]).toMatchObject({ observerAgentId: 'b', physicallyNear: true,
      potentiallyVisible: false, actuallyPerceived: false })
  })

  it('is deterministic and can produce zero perceived contacts', () => {
    const config = { fieldOfViewDegrees: 360, closeAwarenessMm: 0,
      travellingAttention: 0, stationaryAttention: 0 }
    const agents = [citizen('a', 0), citizen('b', 0)]
    expect(evaluatePerception([sample], agents, 'seed', 3, config))
      .toEqual(evaluatePerception([sample], agents, 'seed', 3, config))
    expect(evaluatePerception([sample], agents, 'seed', 3, config)
      .every((item) => !item.actuallyPerceived)).toBe(true)
  })

  it('uses the within-second travel activity when no second-zero trace is supplied', () => {
    const moving = { ...sample, first: { ...sample.first, activity: 'travelling' as const } }
    const result = evaluatePerception([moving], [citizen('a', 0), citizen('b', Math.PI)],
      'seed', 3, { fieldOfViewDegrees: 360, closeAwarenessMm: 0,
        travellingAttention: 0, stationaryAttention: 1 })
    expect(result.find((item) => item.observerAgentId === 'a')?.actuallyPerceived).toBe(false)
    expect(result.find((item) => item.observerAgentId === 'b')?.actuallyPerceived).toBe(true)
  })

  it('rejects invalid perception parameters before a Tick runs', () => {
    expect(() => validatePerceptionConfig({ fieldOfViewDegrees: 0,
      travellingAttention: 0.5, stationaryAttention: 0.8,
      closeAwarenessMm: 900 })).toThrow('Invalid perception configuration')
  })
})
