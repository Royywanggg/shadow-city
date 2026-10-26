import type { Building, CityBlock, CityModel, DistrictKind, Parcel, RoadEdge, RoadNode } from '../model'
import { between, createRandom } from './random'
import { createBuilding } from './buildings'
import { generateStreetFeatures } from './streetFeatures'
import { derivePedestrianNetwork } from '../pedestrian/derivePedestrianNetwork'

export const HERO_SEED = 'shadow-city-hero-01'

const baseCoordinates = [-100, -76, -51, -27, 27, 51, 76, 100]
const plazaIndex = 3
const tileSize = 212

function roadWidth(index: number): number {
  return index === 3 || index === 4 ? 8.8 : index === 1 || index === 6 ? 5.5 : 4.5
}

function districtFor(column: number, row: number): DistrictKind {
  if (column === plazaIndex && (row === plazaIndex || row === plazaIndex - 1)) return 'civic'
  if ((column <= 1 && row >= 4) || (column >= 5 && row <= 1)) return 'works'
  if (Math.abs(column - 3) + Math.abs(row - 3) <= 4) return 'core'
  return 'residential'
}

export function generateCity(seed = HERO_SEED): CityModel {
  const random = createRandom(seed)
  const coordinates = baseCoordinates.map((value, index) => {
    if (index === 0 || index === baseCoordinates.length - 1 || index === 3 || index === 4) return value
    return value + between(random, -3.4, 3.4)
  })
  const zCoordinates = baseCoordinates.map((value, index) => {
    if (index === 0 || index === baseCoordinates.length - 1 || index === 3 || index === 4) return value
    return value + between(random, -3.4, 3.4)
  })

  const nodes: RoadNode[] = []
  const edges: RoadEdge[] = []
  for (let row = 0; row < zCoordinates.length; row += 1) {
    for (let column = 0; column < coordinates.length; column += 1) {
      const id = `node-${column}-${row}`
      nodes.push({ id, x: coordinates[column], z: zCoordinates[row] })
      if (column > 0) {
        edges.push({
          id: `edge-x-${column - 1}-${row}`,
          from: `node-${column - 1}-${row}`,
          to: id,
          width: roadWidth(row),
          kind: row === 3 || row === 4 ? 'avenue' : 'street',
        })
      }
      if (row > 0) {
        edges.push({
          id: `edge-z-${column}-${row - 1}`,
          from: `node-${column}-${row - 1}`,
          to: id,
          width: roadWidth(column),
          kind: column === 3 || column === 4 ? 'avenue' : 'street',
        })
      }
    }
  }

  const blocks: CityBlock[] = []
  const parcels: Parcel[] = []
  const buildings: Building[] = []
  for (let row = 0; row < zCoordinates.length - 1; row += 1) {
    for (let column = 0; column < coordinates.length - 1; column += 1) {
      const minX = coordinates[column] + roadWidth(column) / 2 + 1.25
      const maxX = coordinates[column + 1] - roadWidth(column + 1) / 2 - 1.25
      const minZ = zCoordinates[row] + roadWidth(row) / 2 + 1.25
      const maxZ = zCoordinates[row + 1] - roadWidth(row + 1) / 2 - 1.25
      const id = `block-${column}-${row}`
      const district = districtFor(column, row)
      const isPlaza = column === plazaIndex && row === plazaIndex
      const isPark = (column === 4 && row === 4) || (column === 1 && row === 5)
      const block: CityBlock = {
        id,
        column,
        row,
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
        width: maxX - minX,
        depth: maxZ - minZ,
        district,
        isPlaza,
        isPark,
      }
      blocks.push(block)
      if (isPlaza || isPark) continue

      const plazaEdge = Math.abs(column - plazaIndex) + Math.abs(row - plazaIndex) === 1
      const broadWorksBlock = district === 'works' && (column + row) % 2 === 0
      const columns = district === 'civic' || plazaEdge || broadWorksBlock ? 1 : block.width > 25 ? 2 : 1
      const rows = district === 'civic' || plazaEdge || broadWorksBlock ? 1 : block.depth > 25 ? 2 : 1
      const gap = district === 'works' ? 1.7 : 1.25
      for (let parcelRow = 0; parcelRow < rows; parcelRow += 1) {
        for (let parcelColumn = 0; parcelColumn < columns; parcelColumn += 1) {
          const parcelWidth = block.width / columns - gap
          const parcelDepth = block.depth / rows - gap
          const parcel: Parcel = {
            id: `${id}-${parcelColumn}-${parcelRow}`,
            blockId: id,
            x: minX + (parcelColumn + 0.5) * (block.width / columns),
            z: minZ + (parcelRow + 0.5) * (block.depth / rows),
            width: parcelWidth,
            depth: parcelDepth,
          }
          parcels.push(parcel)
          buildings.push(createBuilding(parcel, district, column, row, createRandom(`${seed}:${parcel.id}`)))
        }
      }
    }
  }

  const centralBlock = blocks.find((block) => block.isPlaza)!
  const city = {
    seed,
    size: tileSize,
    roads: { nodes, edges },
    blocks,
    parcels,
    buildings,
    plaza: {
      x: centralBlock.x,
      z: centralBlock.z,
      width: centralBlock.width,
      depth: centralBlock.depth,
    },
    streetFeatures: generateStreetFeatures(seed, { nodes, edges }, blocks, centralBlock),
  }
  return { ...city, pedestrian: derivePedestrianNetwork(city) }
}
