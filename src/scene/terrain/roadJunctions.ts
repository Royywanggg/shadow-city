import type { CityModel, CityPointXZ, RoadEdge } from '../../city/model'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import type { WorldPointMm } from '../../world/model'

interface JunctionEnd {
  readonly edge: RoadEdge
  readonly atStart: boolean
  readonly direction: CityPointXZ
  readonly angle: number
}

export interface JunctionCorner {
  readonly first: JunctionEnd
  readonly second: JunctionEnd
  readonly point: CityPointXZ
}

export interface JunctionPlan {
  readonly cornersByNode: ReadonlyMap<string, readonly JunctionCorner[]>
  readonly trimsMm: ReadonlyMap<string, number>
}

export function junctionTrimKey(edgeId: string, atStart: boolean, side: number): string {
  return `${edgeId}:${atStart ? 'start' : 'end'}:${side}`
}

function cross(a: CityPointXZ, b: CityPointXZ): number {
  return a.x * b.z - a.z * b.x
}

function left(direction: CityPointXZ): CityPointXZ {
  return { x: -direction.z, z: direction.x }
}

/** Fits only four-way junctions touching explicitly curved dev road centrelines. */
export function planCurvedJunctions(city: CityModel,
  terrain: Pick<DevTerrainV1, 'roadProfiles'>): JunctionPlan {
  const profileById = new Map(terrain.roadProfiles.map((profile) =>
    [profile.edgeId, profile]))
  const curvedNodeIds = new Set(city.roads.edges.flatMap((edge) =>
    edge.centerlineXZ ? [edge.from, edge.to] : []))
  const cornersByNode = new Map<string, readonly JunctionCorner[]>()
  const trimsMm = new Map<string, number>()
  for (const node of city.roads.nodes.filter((item) => curvedNodeIds.has(item.id))) {
    const ends = city.roads.edges.flatMap((edge): JunctionEnd[] => {
      const atStart = edge.from === node.id
      if (!atStart && edge.to !== node.id) return []
      const profile = profileById.get(edge.id)
      if (!profile || profile.bridgeSpan || profile.culvertSpan) return []
      const path = profile.path
      const origin = atStart ? path[0] : path.at(-1)!
      const next = atStart ? path[1] : path.at(-2)!
      const length = Math.hypot(next.x - origin.x, next.z - origin.z)
      if (length < 1) return []
      const direction = { x: (next.x - origin.x) / length,
        z: (next.z - origin.z) / length }
      return [{ edge, atStart, direction,
        angle: Math.atan2(direction.z, direction.x) }]
    }).sort((a, b) => a.angle - b.angle)
    // Three-arm and bridge junctions retain their existing treatment.
    if (ends.length !== 4) continue
    const corners: JunctionCorner[] = []
    const pendingTrims = new Map<string, number>()
    for (let index = 0; index < ends.length; index += 1) {
      const first = ends[index]
      const second = ends[(index + 1) % ends.length]
      const firstNormal = left(first.direction)
      const right = left(second.direction)
      const secondNormal = { x: -right.x, z: -right.z }
      const firstHalf = first.edge.width / 2
      const secondHalf = second.edge.width / 2
      const firstOffset = { x: firstNormal.x * firstHalf,
        z: firstNormal.z * firstHalf }
      const secondOffset = { x: secondNormal.x * secondHalf,
        z: secondNormal.z * secondHalf }
      const delta = { x: secondOffset.x - firstOffset.x,
        z: secondOffset.z - firstOffset.z }
      const denominator = cross(first.direction, second.direction)
      if (denominator < 0.3) break
      const firstDistance = cross(delta, second.direction) / denominator
      const secondDistance = cross(delta, first.direction) / denominator
      if (firstDistance < 0.5 || secondDistance < 0.5 ||
        firstDistance > 12 || secondDistance > 12) break
      const point = { x: node.x + firstOffset.x + first.direction.x * firstDistance,
        z: node.z + firstOffset.z + first.direction.z * firstDistance }
      corners.push({ first, second, point })
      pendingTrims.set(junctionTrimKey(first.edge.id, first.atStart,
        first.atStart ? 1 : -1), Math.round(firstDistance * 1000))
      pendingTrims.set(junctionTrimKey(second.edge.id, second.atStart,
        second.atStart ? -1 : 1), Math.round(secondDistance * 1000))
    }
    if (corners.length !== ends.length) continue
    cornersByNode.set(node.id, corners)
    for (const [key, value] of pendingTrims) trimsMm.set(key, value)
  }
  return { cornersByNode, trimsMm }
}

export function trimRoadPath(path: readonly WorldPointMm[], startMm: number,
  endMm: number): readonly WorldPointMm[] {
  if (startMm <= 0 && endMm <= 0) return path
  const distances = [0]
  for (let index = 1; index < path.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(
      path[index].x - path[index - 1].x,
      path[index].z - path[index - 1].z))
  }
  const total = distances.at(-1) ?? 0
  if (total <= startMm + endMm + 500) {
    throw new Error('Curved junction lacks room for a connected sidewalk corner')
  }
  const sample = (distance: number): WorldPointMm => {
    let index = 1
    while (index < distances.length - 1 && distances[index] < distance) index += 1
    const before = path[index - 1]
    const after = path[index]
    const t = (distance - distances[index - 1]) /
      (distances[index] - distances[index - 1])
    return { x: Math.round(before.x + (after.x - before.x) * t),
      y: Math.round(before.y + (after.y - before.y) * t),
      z: Math.round(before.z + (after.z - before.z) * t) }
  }
  return [sample(startMm), ...path.slice(1, -1).filter((_, index) =>
    distances[index + 1] > startMm && distances[index + 1] < total - endMm),
  sample(total - endMm)]
}
