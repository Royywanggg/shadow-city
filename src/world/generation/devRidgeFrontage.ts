import type { CityModel, CityPointXZ, RoadEdge, RoadNode } from '../../city/model'
import { reprojectRoadFeature } from './devRoadCorridor'

const FRONTAGE_COLUMNS = [1, 2, 3, 4, 5, 6] as const
const NODE_START = 'node-1-0'
const NODE_END = 'node-7-0'
const BOW_M = 5
const SAMPLE_STEP_M = 1.25
const PARCEL_ROAD_MARGIN_M = 1.25

function zAlongRidge(x: number, west: RoadNode, east: RoadNode): number {
  const t = (x - west.x) / (east.x - west.x)
  return west.z - BOW_M * Math.sin(Math.PI * t) ** 2
}

function pathBetween(from: RoadNode, to: RoadNode, west: RoadNode,
  east: RoadNode): readonly CityPointXZ[] {
  const count = Math.max(2, Math.ceil((to.x - from.x) / SAMPLE_STEP_M))
  return Array.from({ length: count + 1 }, (_, index) => {
    if (index === 0) return { x: from.x, z: from.z }
    if (index === count) return { x: to.x, z: to.z }
    const x = from.x + (to.x - from.x) * index / count
    return { x, z: zAlongRidge(x, west, east) }
  })
}

function zOnPath(path: readonly CityPointXZ[], x: number): number {
  for (let index = 1; index < path.length; index += 1) {
    if (x <= path[index].x) {
      const before = path[index - 1]
      const after = path[index]
      return before.z + (after.z - before.z) *
        (x - before.x) / (after.x - before.x)
    }
  }
  return path.at(-1)!.z
}

/** Curves one connected street along the cleared ridge without moving the main city. */
export function applyDevRidgeFrontage(city: CityModel): CityModel {
  const before = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const west = before.get(NODE_START)
  const east = before.get(NODE_END)
  if (!west || !east || Math.abs(west.z - east.z) > 0.001) {
    throw new Error('Dev ridge frontage needs a level east-west road')
  }
  const changedNodeIds = new Set(['node-2-0', 'node-3-0',
    'node-4-0', 'node-5-0', 'node-6-0'])
  const nodes = city.roads.nodes.map((node) => changedNodeIds.has(node.id)
    ? { ...node, z: zAlongRidge(node.x, west, east) } : node)
  const after = new Map(nodes.map((node) => [node.id, node]))
  const paths = new Map<string, readonly CityPointXZ[]>()
  for (const column of FRONTAGE_COLUMNS) {
    const id = `edge-x-${column}-0`
    const road = city.roads.edges.find((edge) => edge.id === id)
    if (!road || road.centerlineXZ) throw new Error(`Missing straight ridge road ${id}`)
    paths.set(id, pathBetween(after.get(road.from)!, after.get(road.to)!, west, east))
  }
  const edges = city.roads.edges.map((edge) => {
    const path = paths.get(edge.id)
    return path ? { ...edge, centerlineXZ: path } : edge
  })
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const blocks = city.blocks.map((block) => {
    if (block.row !== 0 || !FRONTAGE_COLUMNS.some((column) => column === block.column)) {
      return block
    }
    const road: RoadEdge = edgeById.get(`edge-x-${block.column}-0`)!
    const path = road.centerlineXZ!
    const minX = block.x - block.width / 2
    const maxX = block.x + block.width / 2
    const southZ = block.z + block.depth / 2
    const segments = Math.max(2, Math.ceil((maxX - minX) / SAMPLE_STEP_M))
    const north: CityPointXZ[] = Array.from({ length: segments + 1 }, (_, index) => {
      const x = minX + (maxX - minX) * index / segments
      return { x, z: zOnPath(path, x) + road.width / 2 + PARCEL_ROAD_MARGIN_M }
    })
    return { ...block, footprintXZ: [...north,
      { x: maxX, z: southZ }, { x: minX, z: southZ }] }
  })
  const streetFeatures = city.streetFeatures.map((feature) => {
    const road = city.roads.edges.find((edge) =>
      feature.id.startsWith(`lamp-${edge.id}-`) || feature.id === `bus-stop-${edge.id}`)
    if (!road) return feature
    const oldFrom = before.get(road.from)!
    const oldTo = before.get(road.to)!
    const newFrom = after.get(road.from)!
    const newTo = after.get(road.to)!
    const path = paths.get(road.id)
    if (!path && oldFrom === newFrom && oldTo === newTo) return feature
    return reprojectRoadFeature(feature, oldFrom, oldTo,
      path ?? [newFrom, newTo])
  })
  return { ...city, blocks, streetFeatures, roads: { nodes, edges } }
}
