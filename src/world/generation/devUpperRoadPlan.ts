import type { CityModel, CityPointXZ } from '../../city/model'
import { rearHighlandFrontZmm } from '../terrain/devHighlandContour'

export const DEV_UPPER_ROAD_EDGE_ID = 'edge-dev-upper-ridge'
export const DEV_UPPER_ROAD_NODE_ID = 'node-dev-upper-ridge'
const START_NODE_ID = 'node-3-0'
const END_X_M = 86
const TURN_START_X_M = 70
const FRONT_OFFSET_M = 3
const END_INSET_M = 18.2

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** A single connected climb follows the front contour before entering the upper shelf. */
export function applyDevUpperRoadPlan(city: CityModel): CityModel {
  if (city.roads.edges.some((edge) => edge.id === DEV_UPPER_ROAD_EDGE_ID) ||
    city.roads.nodes.some((node) => node.id === DEV_UPPER_ROAD_NODE_ID)) {
    throw new Error('Duplicate dev upper road')
  }
  const start = city.roads.nodes.find((node) => node.id === START_NODE_ID)
  if (!start || start.x >= END_X_M) throw new Error('Missing upper road junction')
  const endZ = rearHighlandFrontZmm(END_X_M * 1000) / 1000 - END_INSET_M
  const count = Math.ceil(END_X_M - start.x)
  const path: CityPointXZ[] = Array.from({ length: count + 1 }, (_, index) => {
    const x = start.x + (END_X_M - start.x) * index / count
    const cliffZ = rearHighlandFrontZmm(x * 1000) / 1000
    const frontZ = rearHighlandFrontZmm(-17_000) / 1000 + FRONT_OFFSET_M
    const z = x < -17
      ? start.z + (frontZ - start.z) * smoothstep((x - start.x) / (-17 - start.x))
      : cliffZ + FRONT_OFFSET_M -
        (FRONT_OFFSET_M + END_INSET_M) *
        smoothstep((x - TURN_START_X_M) / (END_X_M - TURN_START_X_M))
    return { x, z }
  })
  path[0] = { x: start.x, z: start.z }
  path[path.length - 1] = { x: END_X_M, z: endZ }
  return { ...city, roads: { ...city.roads,
    nodes: [...city.roads.nodes, { id: DEV_UPPER_ROAD_NODE_ID,
      x: END_X_M, z: endZ }],
    edges: [...city.roads.edges, { id: DEV_UPPER_ROAD_EDGE_ID,
      from: START_NODE_ID, to: DEV_UPPER_ROAD_NODE_ID,
      width: 6.4, kind: 'street', centerlineXZ: path }],
  } }
}
