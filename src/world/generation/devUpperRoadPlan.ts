import type { CityModel, CityPointXZ } from '../../city/model'
import { rearHighlandFrontZmm } from '../terrain/devHighlandContour'

export const DEV_UPPER_ROAD_EDGE_ID = 'edge-dev-upper-ridge'
export const DEV_UPPER_ROAD_NODE_ID = 'node-dev-upper-ridge'
export const DEV_UPPER_CONTOUR_ROAD_EDGE_ID = 'edge-dev-upper-contour'
export const DEV_UPPER_CONTOUR_WEST_NODE_ID = 'node-dev-upper-contour-west'
const START_NODE_ID = 'node-3-0'
const END_X_M = 86
const TURN_START_X_M = 74
const FRONT_OFFSET_M = 3
const STAIR_CLEARANCE_BULGE_M = 0.9
export const DEV_UPPER_CONTOUR_WEST_X_M = -126
const CONTOUR_FRONT_INSET_M = 11.1
const JUNCTION_LAND_INSET_M = 2
const CONTOUR_ROAD_WIDTH_M = 3.6

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

/** The sampled centreline shared by the road graph and visible street. */
export function upperContourCenterZmm(xMm: number): number {
  const x = xMm / 1000
  const frontZ = rearHighlandFrontZmm(xMm) / 1000
  const fromJunction = END_X_M - x
  const turnIn = fromJunction < 0 ? 0 :
    -0.6 * fromJunction * (1 - smoothstep(fromJunction / 12))
  const landInset = JUNCTION_LAND_INSET_M * smoothstep((x - 68) / 18)
  const homeCorner = 2 * smoothstep((x - 58) / 10) *
    smoothstep((86 - x) / 10)
  return Math.round((frontZ - CONTOUR_FRONT_INSET_M - landInset - homeCorner +
    turnIn) * 1000)
}

/** A single connected climb follows the front contour before entering the upper shelf. */
export function applyDevUpperRoadPlan(city: CityModel): CityModel {
  if (city.roads.edges.some((edge) => edge.id === DEV_UPPER_ROAD_EDGE_ID) ||
    city.roads.edges.some((edge) => edge.id === DEV_UPPER_CONTOUR_ROAD_EDGE_ID) ||
    city.roads.nodes.some((node) => node.id === DEV_UPPER_ROAD_NODE_ID ||
      node.id === DEV_UPPER_CONTOUR_WEST_NODE_ID)) {
    throw new Error('Duplicate dev upper road')
  }
  const start = city.roads.nodes.find((node) => node.id === START_NODE_ID)
  if (!start || start.x >= END_X_M) throw new Error('Missing upper road junction')
  const endZ = upperContourCenterZmm(END_X_M * 1000) / 1000
  const count = Math.ceil(TURN_START_X_M - start.x)
  const path: CityPointXZ[] = Array.from({ length: count + 1 }, (_, index) => {
    const x = start.x + (TURN_START_X_M - start.x) * index / count
    const cliffZ = rearHighlandFrontZmm(x * 1000) / 1000
    const frontZ = rearHighlandFrontZmm(-17_000) / 1000 + FRONT_OFFSET_M
    const z = x < -17
      ? start.z + (frontZ - start.z) * smoothstep((x - start.x) / (-17 - start.x))
      : cliffZ + FRONT_OFFSET_M + STAIR_CLEARANCE_BULGE_M *
        smoothstep((x - 14) / 10) * smoothstep((46 - x) / 10)
    return { x, z }
  })
  path[0] = { x: start.x, z: start.z }
  const bendStart = path.at(-1)!
  const control1 = { x: 83, z: bendStart.z }
  const control2 = { x: END_X_M + 4, z: endZ + 3 }
  const bendEnd = { x: END_X_M, z: endZ }
  for (let index = 1; index <= 48; index += 1) {
    const t = index / 48
    const u = 1 - t
    const weights = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3]
    path.push({
      x: weights[0] * bendStart.x + weights[1] * control1.x +
        weights[2] * control2.x + weights[3] * bendEnd.x,
      z: weights[0] * bendStart.z + weights[1] * control1.z +
        weights[2] * control2.z + weights[3] * bendEnd.z,
    })
  }
  path[path.length - 1] = bendEnd
  const contourWestToEast: CityPointXZ[] = Array.from(
    { length: END_X_M - DEV_UPPER_CONTOUR_WEST_X_M + 1 }, (_, index) => {
      const x = DEV_UPPER_CONTOUR_WEST_X_M + index
      return { x, z: upperContourCenterZmm(x * 1000) / 1000 }
    })
  contourWestToEast[contourWestToEast.length - 1] = { x: END_X_M, z: endZ }
  const westEnd = contourWestToEast[0]
  return { ...city, roads: { ...city.roads,
    nodes: [...city.roads.nodes, { id: DEV_UPPER_ROAD_NODE_ID,
      x: END_X_M, z: endZ }, { id: DEV_UPPER_CONTOUR_WEST_NODE_ID,
      ...westEnd }],
    edges: [...city.roads.edges, { id: DEV_UPPER_ROAD_EDGE_ID,
      from: START_NODE_ID, to: DEV_UPPER_ROAD_NODE_ID,
      width: 6.4, kind: 'street', centerlineXZ: path },
    { id: DEV_UPPER_CONTOUR_ROAD_EDGE_ID,
      from: DEV_UPPER_ROAD_NODE_ID, to: DEV_UPPER_CONTOUR_WEST_NODE_ID,
      width: CONTOUR_ROAD_WIDTH_M,
      taperAtStart: { width: 6.4, length: 8 }, kind: 'street',
      centerlineXZ: contourWestToEast.reverse() }],
  } }
}
