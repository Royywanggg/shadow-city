import { expect, it } from 'vitest'
import { generateDevWorld } from './generateDevWorld'
import { DEV_UPPER_CONTOUR_ROAD_EDGE_ID, DEV_UPPER_ROAD_EDGE_ID } from './devUpperRoadPlan'
import type { WorldPointMm } from '../model'
import { hasClearSurfaceSegment } from '../../simulation/encounter/spatial'

function pathDistances(path: readonly WorldPointMm[]): number[] {
  const distances = [0]
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]
    const current = path[index]
    distances.push(distances[index - 1] + Math.hypot(
      current.x - previous.x, current.z - previous.z))
  }
  return distances
}

it('joins the upper bridge to the contour street without overlapping its approach', () => {
  for (const seed of ['shadow-city-hero-01', 'twilight-alt-01', 'twilight-alt-02']) {
    const world = generateDevWorld(seed)
    const upper = world.terrain!.roadProfiles.find((profile) =>
      profile.edgeId === DEV_UPPER_ROAD_EDGE_ID)!
    const contour = world.terrain!.roadProfiles.find((profile) =>
      profile.edgeId === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)!
    const end = upper.path.at(-1)!
    const start = contour.path[0]
    expect([end.x, end.z]).toEqual([start.x, start.z])
    expect(Math.abs(end.y - start.y)).toBeLessThanOrEqual(100)
    const taper = world.roadEdges.find((edge) =>
      edge.id === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)!.taperAtStart!
    expect(taper).toEqual({ widthMm: 6_400, lengthMm: 8_000 })
    expect(contour.widthsMm?.[0]).toBe(taper.widthMm)
    expect(contour.widthsMm?.at(-1)).toBe(3_600)
    const transitionEnd = pathDistances(contour.path).findIndex((distance) =>
      distance >= taper.lengthMm)
    expect(contour.widthsMm?.[transitionEnd]).toBe(3_600)

    const upperDistances = pathDistances(upper.path)
    const contourDistances = pathDistances(contour.path)
    const upperLength = upperDistances.at(-1)!
    let minimumClearanceMm = Infinity
    for (let i = 0; i < upper.path.length; i += 1) {
      if (upperLength - upperDistances[i] < 8_000) continue
      for (let j = 0; j < contour.path.length; j += 1) {
        if (contourDistances[j] < 8_000) continue
        minimumClearanceMm = Math.min(minimumClearanceMm, Math.hypot(
          upper.path[i].x - contour.path[j].x,
          upper.path[i].z - contour.path[j].z))
      }
    }
    // Beyond the shared corner, both roadbeds and their sidewalks fit side by side.
    expect(minimumClearanceMm).toBeGreaterThan(8_500)

    for (const edge of world.navEdges.filter((item) =>
      item.id.startsWith('terrain:upper-contour-walk-edge:') ||
      item.id.startsWith('terrain:upper-contour-north-walk-edge:') ||
      item.id.startsWith('terrain:upper-contour-crossing:'))) {
      for (let index = 1; index < edge.path.length; index += 1) {
        const from = edge.path[index - 1]
        const to = edge.path[index]
        expect(hasClearSurfaceSegment(world, edge.surfaceId!, from, to),
          `${seed}: ${edge.id}: ${index}`).toBe(true)
        if (edge.kind !== 'crossing') expect(Math.abs(to.y - from.y) /
          Math.hypot(to.x - from.x, to.z - from.z),
        `${seed}: ${edge.id}: ${index}`).toBeLessThan(0.18)
      }
    }
  }
})
