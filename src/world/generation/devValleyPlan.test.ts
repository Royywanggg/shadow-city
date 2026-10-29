import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { expandOriginalCity } from './expandOriginalCity'
import { createDevOrganicLayout } from './devOrganicLayout'
import { deriveDevRoadCorridor } from './devRoadCorridor'
import { applyDevValleyPlan, createDevValleyChannel, valleyOffsetM } from './devValleyPlan'
import { generateDevWorld } from './generateDevWorld'
import { createNavigationIndexV2, findRouteV2 } from '../navigation/routeV2'

const seeds = [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']

describe('shared dev valley plan', () => {
  it.each(seeds)('moves bridges, banks and road surfaces together for %s', (seed) => {
    const base = deriveDevRoadCorridor(createDevOrganicLayout(
      expandOriginalCity(generateCity(seed))))
    const planned = applyDevValleyPlan(base)
    const world = generateDevWorld(seed)
    const nodesBefore = new Map(base.roads.nodes.map((node) => [node.id, node]))
    const nodesAfter = new Map(planned.roads.nodes.map((node) => [node.id, node]))
    for (const column of [0, 1]) for (const row of [4, 5, 6, 7]) {
      const id = `node-${column}-${row}`
      const before = nodesBefore.get(id)!
      const after = nodesAfter.get(id)!
      expect(after.x - before.x).toBeCloseTo(valleyOffsetM(before.z), 7)
      expect(after.z).toBe(before.z)
    }
    const byId = new Map(world.baseCity!.roads.edges.map((edge) => [edge.id, edge]))
    const profiles = new Map(world.terrain!.roadProfiles.map((profile) =>
      [profile.edgeId, profile]))
    for (const column of [0, 1]) for (const row of [4, 5, 6]) {
      const id = `edge-z-${column}-${row}`
      const edge = byId.get(id)!
      const profile = profiles.get(id)!
      expect(edge.centerlineXZ!.length).toBeGreaterThan(10)
      expect(profile.path.map((point) => [point.x, point.z])).toEqual(
        edge.centerlineXZ!.map((point) => [Math.round(point.x * 1000),
          Math.round(point.z * 1000)]))
      const start = nodesAfter.get(edge.from)!
      const end = nodesAfter.get(edge.to)!
      expect(edge.centerlineXZ![0]).toEqual({ x: start.x, z: start.z })
      expect(edge.centerlineXZ!.at(-1)).toEqual({ x: end.x, z: end.z })
    }
    const channel = createDevValleyChannel(planned)
    expect(world.terrain!.channel.centerline).toEqual(channel)
    const peak = channel.find((point) => point.z === 54_000)!
    expect(peak.x - channel[0].x).toBeGreaterThan(5_000)
    expect(peak.x - channel[0].x).toBeLessThan(7_000)
    expect(channel.at(-1)).toEqual({ x: -150_000, z: 93_000 })
    for (const row of [5, 6]) {
      const bridge = byId.get(`edge-x-0-${row}`)!
      expect(bridge.centerlineXZ).toBeUndefined()
      const west = nodesAfter.get(bridge.from)!
      const east = nodesAfter.get(bridge.to)!
      expect(east.x - west.x).toBeCloseTo(
        nodesBefore.get(bridge.to)!.x - nodesBefore.get(bridge.from)!.x, 7)
      expect(west.z).toBe(east.z)
      expect(world.navEdges.filter((edge) =>
        edge.id.startsWith(`terrain-ped-bridge:${bridge.id}:`))).toHaveLength(2)
    }
    const index = createNavigationIndexV2(world)
    const cross = world.navEdges.find((edge) =>
      edge.id === 'terrain-ped-bridge:edge-x-0-5:north')!
    expect(findRouteV2(index, cross.fromNodeId, cross.toNodeId).status).toBe('ok')
  })

  it('keeps the 6 m bend gentler than the 9 m riverbank width', () => {
    // For x=A sin²(pi*z/L), |x''| <= 2*A*pi²/L². Curvature is at most |x''|.
    const maxCurvature = 2 * 6 * Math.PI ** 2 / 54 ** 2
    expect(1 / maxCurvature).toBeGreaterThan(9)
    expect(valleyOffsetM(27)).toBe(0)
    expect(valleyOffsetM(54)).toBe(6)
    expect(valleyOffsetM(81)).toBe(0)
  })
})
