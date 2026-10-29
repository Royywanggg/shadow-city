import type { CityModel, CityPointXZ, RoadNode, StreetFeature } from '../../city/model'
import type { GroundPointMm } from '../model'
import { reprojectRoadFeature } from './devRoadCorridor'

const START_Z_M = 27
const END_Z_M = 81
const AMPLITUDE_M = 6
const ROAD_COLUMNS = [0, 1] as const
const ROAD_ROWS = [4, 5, 6] as const

export function valleyOffsetM(z: number): number {
  if (z <= START_Z_M || z >= END_Z_M) return 0
  const t = (z - START_Z_M) / (END_Z_M - START_Z_M)
  return AMPLITUDE_M * Math.sin(Math.PI * t) ** 2
}

function roadPath(from: RoadNode, to: RoadNode): readonly CityPointXZ[] {
  const count = Math.max(2, Math.ceil((to.z - from.z) / 1.5))
  const baseX = from.id.startsWith('node-0-') ? -100 :
    // The eastern road already has a small global organic displacement.
    from.x - valleyOffsetM(from.z)
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return { x: from.x, z: from.z }
    if (index === count) return { x: to.x, z: to.z }
    const z = from.z + (to.z - from.z) * index / count
    return { x: baseX + valleyOffsetM(z), z }
  })
}

function reprojectStraightFeature(feature: StreetFeature, beforeA: RoadNode,
  beforeB: RoadNode, afterA: RoadNode, afterB: RoadNode): StreetFeature {
  const dx = beforeB.x - beforeA.x
  const dz = beforeB.z - beforeA.z
  const length = Math.hypot(dx, dz)
  const t = ((feature.x - beforeA.x) * dx +
    (feature.z - beforeA.z) * dz) / (length * length)
  const lateral = ((feature.x - beforeA.x) * -dz +
    (feature.z - beforeA.z) * dx) / length
  const newDx = afterB.x - afterA.x
  const newDz = afterB.z - afterA.z
  const newLength = Math.hypot(newDx, newDz)
  return { ...feature,
    x: afterA.x + newDx * t - newDz / newLength * lateral,
    z: afterA.z + newDz * t + newDx / newLength * lateral,
    rotationY: Math.atan2(newDx, newDz) }
}

/** One shared dev-only road plan, including connected bridge junctions. */
export function applyDevValleyPlan(city: CityModel): CityModel {
  const before = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const nodes = city.roads.nodes.map((node) =>
    ROAD_COLUMNS.some((column) => ROAD_ROWS.some((row) =>
      row !== 4 && node.id === `node-${column}-${row}`))
      ? { ...node, x: node.x + valleyOffsetM(node.z) } : node)
  const after = new Map(nodes.map((node) => [node.id, node]))
  const pathByEdgeId = new Map<string, readonly CityPointXZ[]>()
  for (const column of ROAD_COLUMNS) for (const row of ROAD_ROWS) {
    const edgeId = `edge-z-${column}-${row}`
    const edge = city.roads.edges.find((item) => item.id === edgeId)
    if (!edge || edge.centerlineXZ) throw new Error(`Unexpected valley road ${edgeId}`)
    pathByEdgeId.set(edgeId, roadPath(after.get(edge.from)!, after.get(edge.to)!))
  }
  const features = city.streetFeatures.map((feature) => {
    const edge = city.roads.edges.find((item) =>
      feature.id.startsWith(`lamp-${item.id}-`) || feature.id === `bus-stop-${item.id}`)
    if (!edge) return feature
    const originalA = before.get(edge.from)!
    const originalB = before.get(edge.to)!
    const nextA = after.get(edge.from)!
    const nextB = after.get(edge.to)!
    const path = pathByEdgeId.get(edge.id)
    if (path) return reprojectRoadFeature(feature, originalA, originalB, path)
    if (originalA === nextA && originalB === nextB) return feature
    return reprojectStraightFeature(feature, originalA, originalB, nextA, nextB)
  })
  return { ...city, streetFeatures: features, roads: { ...city.roads,
    nodes, edges: city.roads.edges.map((edge) => {
      const centerlineXZ = pathByEdgeId.get(edge.id)
      return centerlineXZ ? { ...edge, centerlineXZ } : edge
    }) } }
}

const BASE_CHANNEL: readonly GroundPointMm[] = [
  { x: -88_000, z: 33_000 }, { x: -88_000, z: 51_000 },
  { x: -87_000, z: 76_000 }, { x: -88_000, z: 81_000 },
  { x: -110_000, z: 87_000 }, { x: -150_000, z: 93_000 },
]

function baseChannelX(zMm: number): number {
  for (let index = 1; index < BASE_CHANNEL.length; index += 1) {
    const from = BASE_CHANNEL[index - 1]
    const to = BASE_CHANNEL[index]
    if (zMm <= to.z) return Math.round(from.x +
      (to.x - from.x) * (zMm - from.z) / (to.z - from.z))
  }
  return BASE_CHANNEL.at(-1)!.x
}

/** The channel shares the analytical offset of the two road centrelines. */
export function createDevValleyChannel(city: CityModel): readonly GroundPointMm[] {
  const west = city.roads.edges.find((edge) => edge.id === 'edge-z-0-5')?.centerlineXZ
  const east = city.roads.edges.find((edge) => edge.id === 'edge-z-1-5')?.centerlineXZ
  if (!west && !east) return BASE_CHANNEL
  if (!west || !east) throw new Error('Valley roads must be planned together')
  const points: GroundPointMm[] = []
  for (let z = 33_000; z <= 81_000; z += 1_500) {
    points.push({ x: baseChannelX(z) + Math.round(valleyOffsetM(z / 1000) * 1000), z })
  }
  return [...points, ...BASE_CHANNEL.slice(4)]
}
