import type { Building, CityBlock, CityModel, CityPointXZ, Parcel,
  RoadEdge, RoadNode, StreetFeature } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'

export const DEV_NORTH_ANNEX_BLOCK_PREFIX = 'block-dev-north-'
export const DEV_NORTH_ANNEX_ROAD_Z_M = -180
export const DEV_NORTH_ANNEX_MIN_Z_M = -190

const NORTH_ROW = -2
const NORTH_ROAD_WIDTH_M = 4.6
const LINK_ROAD_WIDTH_M = 4.5
const WALKWAY_CLEARANCE_M = 1.55
// Five wider blocks give this ridge a different grain from the original grid.
const BLOCK_BOUNDS = [-1, 1, 3, 5, 7, 8] as const
const PARK_INDEX = 1

function northRoadZ(x: number, westX: number, eastX: number): number {
  const t = (x - westX) / (eastX - westX)
  const envelope = Math.sin(Math.PI * t)
  return DEV_NORTH_ANNEX_ROAD_Z_M + envelope * (
    1.35 * Math.sin(2 * Math.PI * t - 0.3) +
    0.85 * envelope * Math.sin(4 * Math.PI * t + 0.2))
}

function roadPath(from: RoadNode, to: RoadNode, westX: number,
  eastX: number): readonly CityPointXZ[] {
  const segments = Math.max(2, Math.ceil((to.x - from.x) / 1.5))
  return Array.from({ length: segments + 1 }, (_, index) => {
    if (index === 0) return { x: from.x, z: from.z }
    if (index === segments) return { x: to.x, z: to.z }
    const x = from.x + (to.x - from.x) * index / segments
    return { x, z: northRoadZ(x, westX, eastX) }
  })
}

function blockBounds(city: CityModel, roadEdges: readonly RoadEdge[],
  westColumn: number, eastColumn: number,
  nodeById: ReadonlyMap<string, RoadNode>): Readonly<{
  minX: number; maxX: number; minZ: number; maxZ: number }> {
  const west = nodeById.get(`node-${westColumn}--1`)
  const east = nodeById.get(`node-${eastColumn}--1`)
  if (!west || !east) throw new Error('Missing northern perimeter node')
  const northPoints = roadEdges.filter((edge) => {
    if (!edge.id.startsWith('edge-x-') || !edge.id.endsWith('--2')) return false
    const column = Number(edge.id.slice('edge-x-'.length, -'--2'.length))
    return column >= westColumn && column < eastColumn
  }).flatMap((edge) => edge.centerlineXZ ?? [])
  const southPoints = city.roads.edges.filter((edge) => {
    if (!edge.id.startsWith('edge-x-') || !edge.id.endsWith('--1')) return false
    const column = Number(edge.id.slice('edge-x-'.length, -'--1'.length))
    return column >= westColumn && column < eastColumn
  }).flatMap((edge) => edge.centerlineXZ ?? [
    nodeById.get(edge.from)!, nodeById.get(edge.to)!,
  ])
  if (!northPoints.length || !southPoints.length) {
    throw new Error('Incomplete north annex road boundary')
  }
  const sideInset = LINK_ROAD_WIDTH_M / 2 + WALKWAY_CLEARANCE_M + 0.5
  return {
    minX: west.x + sideInset,
    maxX: east.x - sideInset,
    minZ: Math.max(...northPoints.map((point) => point.z)) +
      NORTH_ROAD_WIDTH_M / 2 + WALKWAY_CLEARANCE_M,
    maxZ: Math.min(...southPoints.map((point) => point.z)) -
      4.5 / 2 - WALKWAY_CLEARANCE_M,
  }
}

function buildingCount(index: number): number {
  return index === 0 || index === 2 ? 3 : 2
}

/** Adds an inhabited northern shelf to the dev city without regenerating old IDs. */
export function applyDevNorthAnnex(city: CityModel): CityModel {
  if (city.size !== 300) throw new Error('North annex requires the dev 300 m base city')
  const nodeById = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const west = nodeById.get('node--1--1')
  const east = nodeById.get('node-8--1')
  if (!west || !east || west.x >= east.x) {
    throw new Error('Missing northern perimeter road')
  }
  const nodes: RoadNode[] = []
  for (let column = -1; column <= 8; column += 1) {
    const parent = nodeById.get(`node-${column}--1`)
    if (!parent) throw new Error(`Missing northern perimeter node ${column}`)
    const id = `node-${column}--2`
    if (nodeById.has(id)) throw new Error(`Duplicate north annex node ${id}`)
    nodes.push({ id, x: parent.x, z: northRoadZ(parent.x, west.x, east.x) })
  }
  const annexNodes = new Map(nodes.map((node) => [node.id, node]))
  const edges: RoadEdge[] = []
  for (let column = -1; column < 8; column += 1) {
    const id = `edge-x-${column}--2`
    if (city.roads.edges.some((edge) => edge.id === id)) {
      throw new Error(`Duplicate north annex edge ${id}`)
    }
    const from = annexNodes.get(`node-${column}--2`)!
    const to = annexNodes.get(`node-${column + 1}--2`)!
    edges.push({ id, from: from.id, to: to.id,
      width: NORTH_ROAD_WIDTH_M, kind: 'street',
      centerlineXZ: roadPath(from, to, west.x, east.x) })
  }
  for (const column of BLOCK_BOUNDS) {
    const id = `edge-z-${column}--2`
    if (city.roads.edges.some((edge) => edge.id === id)) {
      throw new Error(`Duplicate north annex edge ${id}`)
    }
    edges.push({ id, from: `node-${column}--2`, to: `node-${column}--1`,
      width: LINK_ROAD_WIDTH_M, kind: 'street' })
  }

  const blocks: CityBlock[] = []
  const parcels: Parcel[] = []
  const buildings: Building[] = []
  const features: StreetFeature[] = []
  for (let index = 0; index < BLOCK_BOUNDS.length - 1; index += 1) {
    const westColumn = BLOCK_BOUNDS[index]
    const eastColumn = BLOCK_BOUNDS[index + 1]
    const bounds = blockBounds(city, edges, westColumn, eastColumn, nodeById)
    const width = bounds.maxX - bounds.minX
    const depth = bounds.maxZ - bounds.minZ
    if (width < 20 || depth < 18 || bounds.minZ <= DEV_NORTH_ANNEX_MIN_Z_M + 2) {
      throw new Error(`North annex block ${index} lacks safe frontage`)
    }
    const id = `${DEV_NORTH_ANNEX_BLOCK_PREFIX}${index}`
    if (city.blocks.some((block) => block.id === id)) {
      throw new Error(`Duplicate north annex block ${id}`)
    }
    const isPark = index === PARK_INDEX
    const block: CityBlock = {
      id, column: 110 + index, row: NORTH_ROW,
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
      width, depth, district: 'residential', isPlaza: false, isPark,
      boundaryRoadEdgeIds: [
        ...Array.from({ length: eastColumn - westColumn }, (_, offset) =>
          `edge-x-${westColumn + offset}--2`),
        ...Array.from({ length: eastColumn - westColumn }, (_, offset) =>
          `edge-x-${westColumn + offset}--1`),
        `edge-z-${westColumn}--2`, `edge-z-${eastColumn}--2`,
      ],
    }
    blocks.push(block)
    if (isPark) {
      for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
        features.push({ id: `tree-${id}-${sideX}-${sideZ}`, kind: 'tree',
          x: block.x + sideX * width * 0.31,
          z: block.z + sideZ * depth * 0.28,
          rotationY: 0,
          scale: 0.9 + createRandom(`${city.seed}:${id}:${sideX}:${sideZ}`)() * 0.2 })
      }
      continue
    }
    const count = buildingCount(index)
    for (let parcelIndex = 0; parcelIndex < count; parcelIndex += 1) {
      const parcelId = `parcel-dev-north-${index}-${parcelIndex}`
      const parcel: Parcel = { id: parcelId, blockId: id,
        x: bounds.minX + width * (parcelIndex + 0.5) / count,
        z: block.z,
        width: width / count - 2.2,
        depth: depth - 3.2 }
      if (parcel.width < 10 || parcel.depth < 14) {
        throw new Error(`North annex parcel ${parcelId} is too small`)
      }
      parcels.push(parcel)
      const kind = index === 4 && parcelIndex === 1 ? 'commercial' :
        index === 2 && parcelIndex === 1 ? 'apartment' :
          index === 3 && parcelIndex === 0 ? 'apartment' : 'residential'
      buildings.push(createBuilding(parcel, block.district, block.column,
        block.row, createRandom(`${city.seed}:dev-north:${parcelId}:building`), kind))
    }
  }
  for (const column of [-1, 1, 3, 5, 7]) {
    const from = annexNodes.get(`node-${column}--2`)!
    const to = annexNodes.get(`node-${column + 1}--2`)!
    const x = (from.x + to.x) / 2
    features.push({ id: `lamp-dev-north-${column}`, kind: 'lamp',
      x, z: northRoadZ(x, west.x, east.x) + NORTH_ROAD_WIDTH_M / 2 + 0.65,
      rotationY: Math.PI / 2, scale: 0.9 })
  }
  return { ...city,
    roads: { nodes: [...city.roads.nodes, ...nodes],
      edges: [...city.roads.edges, ...edges] },
    blocks: [...city.blocks, ...blocks],
    parcels: [...city.parcels, ...parcels],
    buildings: [...city.buildings, ...buildings],
    streetFeatures: [...city.streetFeatures, ...features],
  }
}
