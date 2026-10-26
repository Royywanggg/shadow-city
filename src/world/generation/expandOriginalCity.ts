import type { CityBlock, CityModel, DistrictKind, Parcel, RoadEdge, RoadNode } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'
import { generateStreetFeatures } from '../../city/generation/streetFeatures'
import { derivePedestrianNetwork } from '../../city/pedestrian/derivePedestrianNetwork'

// The original eight road coordinates remain fixed. One connected ring grows around them.
export const EXPANDED_CITY_SIZE = 300
const OUTER_ROAD = 145

function roadWidth(index: number): number {
  return index === 3 || index === 4 ? 8.8 : index === 1 || index === 6 ? 5.5 : 4.5
}

function districtFor(column: number, row: number): DistrictKind {
  if (column < 0 && row <= 2 || row < 0 && column <= 1) return 'works'
  if (column >= 7 && row <= 2) return 'core'
  return 'residential'
}

/** Extends the existing graph, blocks and buildings without regenerating the old core. */
export function expandOriginalCity(original: CityModel): CityModel {
  const originalNode = new Map(original.roads.nodes.map((node) => [node.id, node]))
  const coordinate = (column: number, row: number): RoadNode => {
    const old = originalNode.get(`node-${column}-${row}`)
    if (old) return old
    const reference = originalNode.get(`node-${Math.max(0, Math.min(7, column))}-${Math.max(0, Math.min(7, row))}`)!
    return { id: `node-${column}-${row}`,
      x: column < 0 ? -OUTER_ROAD : column > 7 ? OUTER_ROAD : reference.x,
      z: row < 0 ? -OUTER_ROAD : row > 7 ? OUTER_ROAD : reference.z }
  }
  const nodes = [...original.roads.nodes]
  for (let row = -1; row <= 8; row += 1) for (let column = -1; column <= 8; column += 1) {
    if (column >= 0 && column <= 7 && row >= 0 && row <= 7) continue
    nodes.push(coordinate(column, row))
  }
  const edges: RoadEdge[] = [...original.roads.edges]
  for (let row = -1; row <= 8; row += 1) for (let column = -1; column <= 8; column += 1) {
    if (column > -1 && !(column >= 1 && column <= 7 && row >= 0 && row <= 7)) {
      edges.push({ id: `edge-x-${column - 1}-${row}`, from: `node-${column - 1}-${row}`,
        to: `node-${column}-${row}`, width: roadWidth(row),
        kind: row === 3 || row === 4 ? 'avenue' : 'street' })
    }
    if (row > -1 && !(row >= 1 && row <= 7 && column >= 0 && column <= 7)) {
      edges.push({ id: `edge-z-${column}-${row - 1}`, from: `node-${column}-${row - 1}`,
        to: `node-${column}-${row}`, width: roadWidth(column),
        kind: column === 3 || column === 4 ? 'avenue' : 'street' })
    }
  }
  const blocks: CityBlock[] = [...original.blocks]
  const parcels: Parcel[] = [...original.parcels]
  const buildings = [...original.buildings]
  for (let row = -1; row <= 7; row += 1) for (let column = -1; column <= 7; column += 1) {
    if (column >= 0 && column <= 6 && row >= 0 && row <= 6) continue
    const a = coordinate(column, row)
    const b = coordinate(column + 1, row + 1)
    const minX = a.x + roadWidth(column) / 2 + 1.25
    const maxX = b.x - roadWidth(column + 1) / 2 - 1.25
    const minZ = a.z + roadWidth(row) / 2 + 1.25
    const maxZ = b.z - roadWidth(row + 1) / 2 - 1.25
    const id = `block-${column}-${row}`
    const district = districtFor(column, row)
    const isPark = (column === -1 && row === 4) || (column === 7 && row === 6) ||
      (column === 5 && row === -1)
    const block: CityBlock = { id, column, row, x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ,
      district, isPlaza: false, isPark }
    blocks.push(block)
    if (isPark) continue
    const localRandom = createRandom(`${original.seed}:extension:${id}`)
    const divide = Math.max(block.width, block.depth) > 26 &&
      !(district === 'works' && localRandom() < 0.22)
    const splitX = divide && (block.width > block.depth * 1.2 ||
      block.width >= block.depth * 0.83 && localRandom() > 0.5)
    const splitZ = divide && !splitX
    for (let index = 0; index < (divide ? 2 : 1); index += 1) {
      const parcel: Parcel = { id: `${id}-${index}-0`, blockId: id,
        x: block.x + (splitX ? (index - 0.5) * block.width / 2 : 0),
        z: block.z + (splitZ ? (index - 0.5) * block.depth / 2 : 0),
        width: splitX ? block.width / 2 - 3.8 : block.width - 3.8,
        depth: splitZ ? block.depth / 2 - 3.8 : block.depth - 3.8 }
      parcels.push(parcel)
      buildings.push(createBuilding(parcel, district, column, row,
        createRandom(`${original.seed}:extension:${parcel.id}:building`)))
    }
  }
  const roads = { nodes, edges }
  const oldFeatures = new Set(original.streetFeatures.map((feature) => feature.id))
  const addedFeatures = generateStreetFeatures(original.seed, roads, blocks,
    original.blocks.find((block) => block.isPlaza)!).filter((feature) => !oldFeatures.has(feature.id))
  const city = { ...original, size: EXPANDED_CITY_SIZE, roads, blocks, parcels, buildings,
    streetFeatures: [...original.streetFeatures, ...addedFeatures] }
  return { ...city, pedestrian: derivePedestrianNetwork(city) }
}
