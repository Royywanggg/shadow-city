import { describe, expect, it } from 'vitest'
import type { PedestrianNetwork } from '../city/model'
import { createPedestrianLookup, interpolateAgentPose, type AgentMotionState } from './agentInterpolation'

const graph: PedestrianNetwork = {
  nodes: [
    { id: 'a', x: 0, z: 0, surfaceY: 0.24, kind: 'sidewalk' },
    { id: 'b', x: 10, z: 0, surfaceY: 0.24, kind: 'sidewalk' },
    { id: 'c', x: 10, z: 10, surfaceY: 0.24, kind: 'sidewalk' },
  ],
  edges: [
    { id: 'ab', from: 'a', to: 'b', length: 10, costMm: 10000, kind: 'sidewalk' },
    { id: 'bc', from: 'b', to: 'c', length: 10, costMm: 10000, kind: 'sidewalk' },
  ],
  anchors: [],
}
const route = [
  { edgeId: 'ab', fromNodeId: 'a', toNodeId: 'b', length: 10 },
  { edgeId: 'bc', fromNodeId: 'b', toNodeId: 'c', length: 10 },
]

function state(distanceAlongRoute: number, x: number, z: number): AgentMotionState {
  return {
    activity: 'travelling',
    position: { x, y: 0.24, z },
    route,
    routeId: 'route-a-c',
    distanceAlongRoute,
  }
}

describe('agent rendering interpolation', () => {
  it('samples the pedestrian polyline through a turn instead of cutting the corner', () => {
    const lookup = createPedestrianLookup(graph)
    const before = state(8, 8, 0)
    const after = state(12, 10, 2)
    const frozenBefore = JSON.stringify(before)
    const frozenAfter = JSON.stringify(after)
    expect(interpolateAgentPose(before, after, lookup, 0.25)).toMatchObject({ x: 9, z: 0 })
    expect(interpolateAgentPose(before, after, lookup, 0.5)).toMatchObject({ x: 10, z: 0 })
    expect(interpolateAgentPose(before, after, lookup, 0.75)).toMatchObject({ x: 10, z: 1 })
    expect(JSON.stringify(before)).toBe(frozenBefore)
    expect(JSON.stringify(after)).toBe(frozenAfter)
  })

  it('turns continuously around a corner and preserves stopped heading', () => {
    const lookup = createPedestrianLookup(graph)
    const before = state(9, 9, 0)
    const after = { ...state(11, 10, 1), headingRadians: 0 }
    const approach = interpolateAgentPose(before, after, lookup, 0.49)
    const corner = interpolateAgentPose(before, after, lookup, 0.5)
    const departure = interpolateAgentPose(before, after, lookup, 0.51)
    expect(Math.abs(approach.yaw - corner.yaw)).toBeLessThan(0.1)
    expect(Math.abs(departure.yaw - corner.yaw)).toBeLessThan(0.1)
    expect(corner.yaw).toBeCloseTo(Math.PI / 4)
    expect(interpolateAgentPose(null, { ...after, activity: 'atDestination', route: [] }, lookup, 1).yaw)
      .toBe(0)
  })

  it('snaps to authoritative state for pause, seek, reset, or route changes', () => {
    const lookup = createPedestrianLookup(graph)
    const before = state(8, 8, 0)
    const after = state(12, 10, 2)
    expect(interpolateAgentPose(null, after, lookup, 0.1)).toMatchObject({ x: 10, z: 2 })
    expect(interpolateAgentPose(before, after, lookup, 1)).toMatchObject({ x: 10, z: 2 })
    expect(interpolateAgentPose(before, { ...after, routeId: 'different' }, lookup, 0.5))
      .toMatchObject({ x: 10, z: 2 })
  })

  it('enters and leaves a route at valid anchors without a straight-line jump', () => {
    const lookup = createPedestrianLookup(graph)
    const atHome: AgentMotionState = {
      activity: 'atHome', position: { x: 0, y: 0.24, z: 0 }, route: [], routeId: null,
      distanceAlongRoute: 0,
    }
    const departing = state(2, 2, 0)
    expect(interpolateAgentPose(atHome, departing, lookup, 0.5)).toMatchObject({ x: 1, z: 0, visible: true })
    const arrived: AgentMotionState = {
      activity: 'atDestination', position: { x: 10, y: 0.24, z: 10 }, route: [], routeId: null,
      distanceAlongRoute: 0,
    }
    expect(interpolateAgentPose(state(18, 10, 8), arrived, lookup, 0.5))
      .toMatchObject({ x: 10, z: 9, visible: true })
  })
})
