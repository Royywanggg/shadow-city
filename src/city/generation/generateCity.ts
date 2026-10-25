import type {
  Building,
  BuildingKind,
  CityBlock,
  CityModel,
  DistrictKind,
  Parcel,
  RoadEdge,
  RoadNode,
} from '../model'
import { between, createRandom } from './random'

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

function makeWindowPattern(
  random: () => number,
  floors: number,
  baysX: number,
  baysZ: number,
  kind: BuildingKind,
): number[] {
  const pattern: number[] = []
  const count = floors * (baysX + baysZ)
  for (let index = 0; index < count; index += 1) {
    const roll = random()
    const litRate = kind === 'industrial' ? 0.18 : kind === 'tower' ? 0.36 : kind === 'civic' ? 0.2 : 0.28
    pattern.push(roll < litRate * 0.77 ? 1 : roll < litRate ? 2 : 0)
  }
  return pattern
}

function buildingKind(
  random: () => number,
  district: DistrictKind,
  column: number,
  row: number,
): BuildingKind {
  if (district === 'civic') return 'civic'
  const anchor = (column === 1 && row === 2) || (column === 2 && row === 1) || (column === 4 && row === 2)
  if (anchor && random() < 0.64) return 'tower'
  if (district === 'works') return random() < 0.7 ? 'industrial' : 'midrise'
  if (district === 'core') return random() < 0.62 ? 'midrise' : 'terrace'
  return random() < 0.75 ? 'terrace' : 'midrise'
}

function buildingHeight(
  random: () => number,
  kind: BuildingKind,
  column: number,
  row: number,
): number {
  const foreground = column >= 4 && row >= 4
  if (kind === 'civic') return 16
  if (kind === 'tower') return between(random, 34, 56)
  if (kind === 'industrial') return between(random, 5.5, 10)
  if (kind === 'terrace') return between(random, 6.5, foreground ? 10.5 : 13)
  const nearSquare = Math.abs(column - 3) + Math.abs(row - 3) <= 1
  return between(random, 14, nearSquare ? 21 : foreground ? 19 : 27)
}

function makeBuilding(
  parcel: Parcel,
  district: DistrictKind,
  column: number,
  row: number,
  random: () => number,
): Building {
  const kind = buildingKind(random, district, column, row)
  const insetX = between(random, 0.55, 1.35)
  const insetZ = between(random, 0.55, 1.35)
  const height = buildingHeight(random, kind, column, row)
  const floors = Math.max(2, Math.round(height / (kind === 'industrial' || kind === 'civic' ? 4.2 : 3.35)))
  const width = Math.max(4, parcel.width - insetX * 2)
  const depth = Math.max(4, parcel.depth - insetZ * 2)
  const baysX = Math.max(2, Math.min(6, Math.round(width / 3.2)))
  const baysZ = Math.max(2, Math.min(6, Math.round(depth / 3.2)))

  return {
    id: `building-${parcel.id}`,
    parcelId: parcel.id,
    kind,
    x: parcel.x + between(random, -0.18, 0.18),
    z: parcel.z + between(random, -0.18, 0.18),
    width,
    depth,
    height,
    floors,
    facadeTone: Math.floor(random() * 5),
    roofTone: Math.floor(random() * 4),
    accentTone: Math.floor(random() * 3),
    baysX,
    baysZ,
    windowPattern: makeWindowPattern(random, floors, baysX, baysZ, kind),
    roofDetail: Math.floor(random() * 4),
  }
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

      const columns = district === 'civic' ? 1 : block.width > 25 ? 2 : 1
      const rows = district === 'civic' ? 1 : block.depth > 25 ? 2 : 1
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
          if (district === 'residential' && random() < 0.08) continue
          if (district === 'works' && random() < 0.14) continue
          buildings.push(makeBuilding(parcel, district, column, row, random))
        }
      }
    }
  }

  const centralBlock = blocks.find((block) => block.isPlaza)!
  return {
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
  }
}
