import type { Building, CityBlock, CityModel, CityPointXZ, Parcel,
  RoadEdge, RoadNode, StreetFeature } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'
import { reprojectRoadFeature } from './devRoadCorridor'
import { channelXAt } from '../terrain/devTerrain'
import { createDevValleyChannel } from './devValleyPlan'

export const DEV_WEST_BANK_BLOCK_ID = 'block--1-7'
export const DEV_WEST_BANK_ROAD_ID = 'edge-z-0-7'
export const DEV_WEST_BANK_INFILL_PREFIX = 'parcel-dev-west-bank-'

const ROAD_BEND_M = 7
const CURB_AND_SIDEWALK_M = 3.5
const ROAD_SAMPLE_M = 1

function bendAt(z: number): number {
  if (z <= 108 || z >= 142) return 0
  return ROAD_BEND_M * Math.sin(Math.PI * (z - 108) / 34) ** 2
}

function roadXAt(z: number, from: RoadNode, to: RoadNode): number {
  const t = (z - from.z) / (to.z - from.z)
  return from.x + (to.x - from.x) * t + bendAt(z)
}

function curvedRoad(from: RoadNode, to: RoadNode): readonly CityPointXZ[] {
  const count = Math.ceil((to.z - from.z) / ROAD_SAMPLE_M)
  return Array.from({ length: count + 1 }, (_, index) => {
    const z = from.z + (to.z - from.z) * index / count
    return { x: roadXAt(z, from, to), z }
  })
}

function blockFrontage(road: RoadEdge, from: RoadNode, to: RoadNode,
  northZ: number, southZ: number): readonly CityPointXZ[] {
  const count = Math.ceil((southZ - northZ) / ROAD_SAMPLE_M)
  return Array.from({ length: count + 1 }, (_, index) => {
    const z = northZ + (southZ - northZ) * index / count
    const slope = (roadXAt(z + 0.05, from, to) -
      roadXAt(z - 0.05, from, to)) / 0.1
    const lateralOffset = (road.width / 2 + 1.25) * Math.hypot(1, slope)
    return { x: roadXAt(z, from, to) - lateralOffset, z }
  })
}

function groundCorners(building: Building): CityPointXZ[] {
  return building.masses.filter((mass) => mass.baseY < 2).flatMap((mass) =>
    [-1, 1].flatMap((sideX) => [-1, 1].map((sideZ) => ({
      x: building.x + mass.offsetX + sideX * mass.width / 2,
      z: building.z + mass.offsetZ + sideZ * mass.depth / 2,
    }))))
}

function contains(point: CityPointXZ, polygon: readonly CityPointXZ[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1;
    index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]
    const b = polygon[previous]
    if ((a.z > point.z) !== (b.z > point.z) &&
      point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function distanceToRoad(point: CityPointXZ,
  path: readonly CityPointXZ[]): number {
  return Math.min(...path.slice(1).map((end, index) => {
    const start = path[index]
    const dx = end.x - start.x
    const dz = end.z - start.z
    const t = Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) /
      (dx * dx + dz * dz || 1)))
    return Math.hypot(point.x - start.x - dx * t,
      point.z - start.z - dz * t)
  }))
}

function distanceToGroundMass(point: CityPointXZ, building: Building): number {
  return Math.min(...building.masses.filter((mass) => mass.baseY < 2).map((mass) =>
    Math.hypot(
      Math.max(0, Math.abs(point.x - building.x - mass.offsetX) - mass.width / 2),
      Math.max(0, Math.abs(point.z - building.z - mass.offsetZ) - mass.depth / 2))))
}

/** Shapes an inhabited riverfront block from the same curved road used by navigation. */
export function applyDevWestBankDistrict(city: CityModel): CityModel {
  const block = city.blocks.find((item) => item.id === DEV_WEST_BANK_BLOCK_ID)
  const road = city.roads.edges.find((item) => item.id === DEV_WEST_BANK_ROAD_ID)
  if (!block || !road || road.centerlineXZ) {
    throw new Error('West-bank district requires the original southern river road')
  }
  const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const from = nodes.get(road.from)
  const to = nodes.get(road.to)
  if (!from || !to || from.z >= to.z || to.z - from.z < 40) {
    throw new Error('West-bank road has invalid endpoints')
  }
  const path = curvedRoad(from, to)
  const channel = createDevValleyChannel(city)
  for (const point of path) {
    if (channelXAt(channel, Math.round(point.z * 1000)) / 1000 - point.x < 10) {
      throw new Error('West-bank road enters the river clearance strip')
    }
  }
  const westX = block.x - block.width / 2
  const northZ = block.z - block.depth / 2
  const southZ = block.z + block.depth / 2
  const frontage = blockFrontage(road, from, to, northZ, southZ)
  const polygon = [{ x: westX, z: northZ },
    { x: westX + 19, z: northZ }, ...frontage,
    { x: westX + 19, z: southZ }, { x: westX, z: southZ }]
  const maxX = Math.max(...polygon.map((point) => point.x))
  const nextBlock: CityBlock = { ...block, footprintXZ: polygon,
    boundaryRoadEdgeIds: [
      `edge-x-${block.column}-${block.row}`,
      `edge-x-${block.column}-${block.row + 1}`,
      `edge-z-${block.column}-${block.row}`,
      DEV_WEST_BANK_ROAD_ID,
    ],
    x: (westX + maxX) / 2, width: maxX - westX }

  const originals = city.parcels.filter((parcel) => parcel.blockId === block.id)
    .sort((a, b) => a.z - b.z)
  if (originals.length !== 2) throw new Error('Unexpected west-bank building layout')
  const sourceBuildings = originals.map((parcel) => city.buildings.find((building) =>
    building.parcelId === parcel.id))
  if (sourceBuildings.some((building) => !building)) {
    throw new Error('Missing west-bank building')
  }
  const sites: readonly Readonly<{ x: number; z: number; width: number;
    depth: number; kind: Building['kind'] }>[] = [
    { x: westX + 8.5, z: 115.5, width: 10, depth: 11,
      kind: sourceBuildings[0]!.kind },
    { x: westX + 20.5, z: 129.5, width: 10, depth: 11,
      kind: sourceBuildings[1]!.kind },
    { x: westX + 30.5, z: 116, width: 8, depth: 10,
      kind: 'residential' },
    { x: westX + 36.5, z: 130, width: 7, depth: 8,
      kind: 'residential' },
  ]
  const parcels: Parcel[] = sites.map((site, index) => ({
    id: originals[index]?.id ?? `${DEV_WEST_BANK_INFILL_PREFIX}${index - 2}`,
    blockId: block.id, x: site.x, z: site.z,
    width: site.width, depth: site.depth,
  }))
  const buildings = parcels.map((parcel, index) => createBuilding(parcel,
    block.district, block.column, block.row,
    createRandom(`${city.seed}:dev-west-bank:${parcel.id}:building`),
    sites[index].kind))
  buildings.forEach((building, index) => {
    if (!groundCorners(building).every((corner) => contains(corner, polygon)) ||
      !contains(building.entrance, polygon) ||
      path.some((point) => distanceToGroundMass(point, building) < road.width / 2 + 1.25) ||
      index < 2 && building.id !== sourceBuildings[index]!.id) {
      throw new Error(`West-bank building does not fit the curved frontage: ${building.id}`)
    }
  })
  const originalsSet = new Set(originals.map((parcel) => parcel.id))
  const roadFeatures = city.streetFeatures.map((feature) =>
    feature.id.startsWith(`lamp-${road.id}-`) ||
      feature.id === `bus-stop-${road.id}`
      ? reprojectRoadFeature(feature, from, to, path) : feature)
  const planting: StreetFeature[] = []
  for (const [index, x, z] of [
    [0, westX + 8, 107], [1, westX + 22, 108],
    [2, westX + 33, 109], [3, westX + 9, 136],
    [4, westX + 22, 137], [5, westX + 33, 137],
  ] as const) {
    const point = { x, z }
    if (!contains(point, polygon) ||
      buildings.some((building) => distanceToGroundMass(point, building) < 2.5) ||
      distanceToRoad(point, path) < road.width / 2 + CURB_AND_SIDEWALK_M) continue
    planting.push({ id: `tree-dev-west-bank-${index}`, kind: 'tree', x, z,
      rotationY: 0, scale: 0.7 + createRandom(`${city.seed}:west-bank-tree:${index}`)() * 0.16 })
  }
  return { ...city,
    roads: { ...city.roads, edges: city.roads.edges.map((edge) =>
      edge.id === road.id ? { ...edge, centerlineXZ: path } : edge) },
    blocks: city.blocks.map((item) => item.id === block.id ? nextBlock : item),
    parcels: [...city.parcels.filter((parcel) => !originalsSet.has(parcel.id)), ...parcels],
    buildings: [...city.buildings.filter((building) =>
      !originalsSet.has(building.parcelId)), ...buildings],
    streetFeatures: [...roadFeatures, ...planting],
  }
}
