import type { CityModel, CityPointXZ, RoadNode } from '../../city/model'

const NORTH_EDGE_ID = 'edge-z-7-4'
const SOUTH_EDGE_ID = 'edge-z-7-5'
const MIDDLE_NODE_ID = 'node-7-5'
const LATERAL_SHIFT_M = 8
const SAMPLE_STEP_M = 2

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

/**
 * Defines the shared, smoothly joined road centreline before dev block fitting.
 * Adjacent parcels and pedestrian paths must be rebuilt by the caller.
 */
export function deriveDevRoadCorridor(city: CityModel): CityModel {
  if (city.size !== 300) throw new Error('Dev road corridor requires the expanded 300 m city')
  const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const north = city.roads.edges.find((edge) => edge.id === NORTH_EDGE_ID)
  const south = city.roads.edges.find((edge) => edge.id === SOUTH_EDGE_ID)
  if (!north || !south || north.to !== MIDDLE_NODE_ID ||
    south.from !== MIDDLE_NODE_ID) {
    throw new Error('Dev road corridor is missing its shared junction')
  }
  if (north.centerlineXZ || south.centerlineXZ) {
    if (north.centerlineXZ && south.centerlineXZ) return city
    throw new Error('Dev road corridor has only one curved edge')
  }
  const first = nodes.get(north.from)
  const middle = nodes.get(MIDDLE_NODE_ID)
  const last = nodes.get(south.to)
  if (!first || !middle || !last ||
    first.z >= middle.z || middle.z >= last.z ||
    Math.abs(middle.x - (first.x + last.x) / 2) > 5) {
    throw new Error('Dev road corridor nodes do not form the expected approach')
  }
  const movedMiddle = { ...middle, x: middle.x + LATERAL_SHIFT_M }
  return { ...city, roads: {
    nodes: city.roads.nodes.map((node) => node.id === MIDDLE_NODE_ID
      ? movedMiddle : node),
    edges: city.roads.edges.map((edge) => edge.id === NORTH_EDGE_ID
      ? { ...edge, centerlineXZ: centreline(first, movedMiddle) }
      : edge.id === SOUTH_EDGE_ID
        ? { ...edge, centerlineXZ: centreline(movedMiddle, last) }
        : edge),
  } }
}
