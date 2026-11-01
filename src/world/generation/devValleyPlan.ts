import type { CityModel, CityPointXZ, RoadNode, StreetFeature } from '../../city/model'
import type { GroundPointMm } from '../model'
import { reprojectRoadFeature } from './devRoadCorridor'

const START_Z_M = 27
const END_Z_M = 81
const AMPLITUDE_M = 8
const ROAD_COLUMNS = [0, 1] as const
const ROAD_ROWS = [4, 5, 6] as const
const WEST_BANK_SHIFT_M = -14
const EAST_BANK_SHIFT_M = 4

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

export function valleyOffsetM(z: number): number {
  if (z <= START_Z_M || z >= END_Z_M) return 0
  const t = (z - START_Z_M) / (END_Z_M - START_Z_M)
  return AMPLITUDE_M * Math.sin(Math.PI * t) ** 2
}

export function westBankOffsetM(z: number): number {
  return WEST_BANK_SHIFT_M * smoothstep((z - START_Z_M) / 24) *
    smoothstep((100 - z) / 24)
}

export function eastBankOffsetM(z: number): number {
  return EAST_BANK_SHIFT_M * smoothstep((z - START_Z_M) / 24) *
    smoothstep((100 - z) / 24)
}

function roadPath(from: RoadNode, to: RoadNode): readonly CityPointXZ[] {
  const count = Math.max(2, Math.ceil((to.z - from.z) / 1.5))
  const westBank = from.id.startsWith('node-0-')
  const offsetAt = (z: number) => valleyOffsetM(z) +
    (westBank ? westBankOffsetM(z) : eastBankOffsetM(z))
  const baseX = from.x - offsetAt(from.z)
  const endBaseX = to.x - offsetAt(to.z)
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return { x: from.x, z: from.z }
    if (index === count) return { x: to.x, z: to.z }
    const z = from.z + (to.z - from.z) * index / count
    const t = smoothstep((z - from.z) / (to.z - from.z))
    return { x: baseX + (endBaseX - baseX) * t + offsetAt(z), z }
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
      ? { ...node, x: node.x + valleyOffsetM(node.z) +
        (node.id.startsWith('node-0-') ? westBankOffsetM(node.z) :
          eastBankOffsetM(node.z)) } : node)
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
  { x: -88_000, z: 84_000 }, { x: -88_000, z: 90_000 },
  { x: -88_000, z: 100_000 }, { x: -84_000, z: 112_000 },
  { x: -69_000, z: 128_000 }, { x: -63_000, z: 144_000 },
  { x: -62_000, z: 150_000 },
]

/** The channel samples the midpoint of the two authoritative road centrelines. */
export function createDevValleyChannel(city: CityModel): readonly GroundPointMm[] {
  const west = city.roads.edges.find((edge) => edge.id === 'edge-z-0-5')?.centerlineXZ
  const east = city.roads.edges.find((edge) => edge.id === 'edge-z-1-5')?.centerlineXZ
  if (!west && !east) return BASE_CHANNEL
  if (!west || !east) throw new Error('Valley roads must be planned together')
  const roadXAt = (column: number, zMm: number): number => {
    const path = ROAD_ROWS.flatMap((row) => {
      const edge = city.roads.edges.find((item) => item.id === `edge-z-${column}-${row}`)
      if (!edge?.centerlineXZ) throw new Error(`Missing valley road ${column}-${row}`)
      return edge.centerlineXZ
    })
    const afterIndex = path.findIndex((point) => point.z * 1000 >= zMm)
    if (afterIndex <= 0) return Math.round(path[0].x * 1000)
    const before = path[afterIndex - 1]
    const after = path[afterIndex]
    const t = (zMm / 1000 - before.z) / (after.z - before.z)
    return Math.round((before.x + (after.x - before.x) * t) * 1000)
  }
  const midpointXAt = (zMm: number) => Math.round((roadXAt(0, zMm) +
    roadXAt(1, zMm)) / 2)
  const points: GroundPointMm[] = []
  for (let z = 33_000; z <= 81_000; z += 1_500) {
    points.push({ x: midpointXAt(z), z })
  }
  const outletCorrection = midpointXAt(100_000) - BASE_CHANNEL[6].x
  return [...points, ...BASE_CHANNEL.slice(4).map((point) => ({ ...point,
    x: point.z <= 100_000 ? midpointXAt(point.z) : point.x +
      Math.round(outletCorrection * (1 - smoothstep((point.z - 100_000) / 50_000))) }))]
}
