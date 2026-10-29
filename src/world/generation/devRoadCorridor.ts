import type { CityModel, CityPointXZ, RoadNode, StreetFeature } from '../../city/model'

const CORRIDORS = [
  { northEdgeId: 'edge-z-7-4', southEdgeId: 'edge-z-7-5',
    middleNodeId: 'node-7-5', lateralShiftM: 8 },
  { northEdgeId: 'edge-z-7-1', southEdgeId: 'edge-z-7-2',
    middleNodeId: 'node-7-2', lateralShiftM: 8 },
  { northEdgeId: 'edge-z-3-4', southEdgeId: 'edge-z-3-5',
    middleNodeId: 'node-3-5', lateralShiftM: 8 },
] as const
const SAMPLE_STEP_M = 1.5

function centreline(from: RoadNode, to: RoadNode): readonly CityPointXZ[] {
  if (to.z <= from.z) throw new Error('Dev corridor requires north-to-south road edges')
  const segments = Math.max(2, Math.ceil((to.z - from.z) / SAMPLE_STEP_M))
  return Array.from({ length: segments + 1 }, (_, index) => {
    if (index === 0) return { x: from.x, z: from.z }
    if (index === segments) return { x: to.x, z: to.z }
    const t = index / segments
    const eased = t * t * (3 - 2 * t)
    return { x: from.x + (to.x - from.x) * eased,
      z: from.z + (to.z - from.z) * t }
  })
}

function reprojectFeature(feature: StreetFeature, from: RoadNode, to: RoadNode,
  path: readonly CityPointXZ[]): StreetFeature {
  const oldDx = to.x - from.x
  const oldDz = to.z - from.z
  const oldLength = Math.hypot(oldDx, oldDz)
  if (oldLength <= 0) throw new Error('Dev road furniture has a zero-length source edge')
  const t = Math.max(0, Math.min(1,
    ((feature.x - from.x) * oldDx + (feature.z - from.z) * oldDz) /
      (oldLength * oldLength)))
  const lateral = ((feature.x - from.x) * -oldDz +
    (feature.z - from.z) * oldDx) / oldLength
  const cumulative = [0]
  for (let index = 1; index < path.length; index += 1) {
    cumulative.push(cumulative[index - 1] + Math.hypot(
      path[index].x - path[index - 1].x,
      path[index].z - path[index - 1].z))
  }
  const target = t * cumulative.at(-1)!
  let segment = 1
  while (segment < path.length - 1 && cumulative[segment] < target) segment += 1
  const before = path[segment - 1]
  const after = path[segment]
  const fraction = (target - cumulative[segment - 1]) /
    (cumulative[segment] - cumulative[segment - 1])
  const x = before.x + (after.x - before.x) * fraction
  const z = before.z + (after.z - before.z) * fraction
  const tangentAt = (index: number) => {
    const first = path[Math.max(0, index - 1)]
    const last = path[Math.min(path.length - 1, index + 1)]
    const dx = last.x - first.x
    const dz = last.z - first.z
    const length = Math.hypot(dx, dz)
    return { x: dx / length, z: dz / length }
  }
  const tangentA = tangentAt(segment - 1)
  const tangentB = tangentAt(segment)
  const tangentX = tangentA.x + (tangentB.x - tangentA.x) * fraction
  const tangentZ = tangentA.z + (tangentB.z - tangentA.z) * fraction
  const tangentLength = Math.hypot(tangentX, tangentZ)
  const dx = tangentX / tangentLength
  const dz = tangentZ / tangentLength
  return { ...feature, x: x - dz * lateral, z: z + dx * lateral,
    rotationY: Math.atan2(dx, dz) }
}

/**
 * Defines the shared, smoothly joined road centreline before dev block fitting.
 * Adjacent parcels and pedestrian paths must be rebuilt by the caller.
 */
export function deriveDevRoadCorridor(city: CityModel): CityModel {
  if (city.size !== 300) throw new Error('Dev road corridor requires the expanded 300 m city')
  return CORRIDORS.reduce((current, corridor) => {
    const nodes = new Map(current.roads.nodes.map((node) => [node.id, node]))
    const north = current.roads.edges.find((edge) => edge.id === corridor.northEdgeId)
    const south = current.roads.edges.find((edge) => edge.id === corridor.southEdgeId)
    if (!north || !south || north.to !== corridor.middleNodeId ||
      south.from !== corridor.middleNodeId) {
      throw new Error('Dev road corridor is missing its shared junction')
    }
    if (north.centerlineXZ || south.centerlineXZ) {
      if (north.centerlineXZ && south.centerlineXZ) return current
      throw new Error('Dev road corridor has only one curved edge')
    }
    const first = nodes.get(north.from)
    const middle = nodes.get(corridor.middleNodeId)
    const last = nodes.get(south.to)
    if (!first || !middle || !last ||
      first.z >= middle.z || middle.z >= last.z ||
      Math.abs(middle.x - (first.x + last.x) / 2) > 5) {
      throw new Error('Dev road corridor nodes do not form the expected approach')
    }
    const movedMiddle = { ...middle, x: middle.x + corridor.lateralShiftM }
    const northPath = centreline(first, movedMiddle)
    const southPath = centreline(movedMiddle, last)
    const streetFeatures = current.streetFeatures.map((feature) => {
      if (feature.id.startsWith(`lamp-${corridor.northEdgeId}-`) ||
        feature.id === `bus-stop-${corridor.northEdgeId}`) {
        return reprojectFeature(feature, first, middle, northPath)
      }
      if (feature.id.startsWith(`lamp-${corridor.southEdgeId}-`) ||
        feature.id === `bus-stop-${corridor.southEdgeId}`) {
        return reprojectFeature(feature, middle, last, southPath)
      }
      return feature
    })
    return { ...current, streetFeatures, roads: {
      nodes: current.roads.nodes.map((node) => node.id === corridor.middleNodeId
        ? movedMiddle : node),
      edges: current.roads.edges.map((edge) => edge.id === corridor.northEdgeId
        ? { ...edge, centerlineXZ: northPath }
        : edge.id === corridor.southEdgeId
          ? { ...edge, centerlineXZ: southPath }
          : edge),
    } }
  }, city)
}
