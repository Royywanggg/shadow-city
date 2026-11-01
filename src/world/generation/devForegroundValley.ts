import type { CityModel, CityPointXZ, Parcel } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'
import { channelXAt } from '../terrain/devTerrain'
import { createDevValleyChannel } from './devValleyPlan'

const BANK_BLOCK_ID = 'block--1-7'
const BANK_CLEARANCE_MM = 13_000

/** Keeps an inhabited bank beside the extended river instead of clearing a square block. */
export function applyDevForegroundValley(city: CityModel): CityModel {
  const source = city.blocks.find((block) => block.id === BANK_BLOCK_ID)
  if (!source) throw new Error('Missing foreground valley block')
  const channel = createDevValleyChannel(city)
  const east = source.x + source.width / 2 - 0.5
  const north = source.z - source.depth / 2 + 12
  const south = source.z + source.depth / 2 - 1
  const bankZ = Array.from({ length: Math.ceil(south - north) + 1 }, (_, index) =>
    Math.min(south, north + index)).filter((z, index, list) =>
    index === 0 || z !== list[index - 1])
  const bank: CityPointXZ[] = bankZ.map((z) => ({
    x: (channelXAt(channel, Math.round(z * 1000)) + BANK_CLEARANCE_MM) / 1000,
    z,
  }))
  if (bank.some((point) => point.x >= east - 2)) {
    throw new Error('Foreground valley leaves no walkable east bank')
  }
  const footprintXZ: CityPointXZ[] = [bank[0], { x: east, z: north },
    { x: east, z: south }, ...bank.slice(1).reverse()]
  const west = Math.min(...bank.map((point) => point.x))
  const block = { ...source, footprintXZ,
    boundaryRoadEdgeIds: [
      'edge-x--1-7', 'edge-z-0-7', 'edge-x--1-8', 'edge-z--1-7',
    ],
    x: (west + east) / 2, z: (north + south) / 2,
    width: east - west, depth: south - north }
  const oldParcels = city.parcels.filter((parcel) => parcel.blockId === BANK_BLOCK_ID)
  if (oldParcels.length !== 2) throw new Error('Unexpected foreground parcel layout')
  const retainedId = oldParcels.at(-1)?.id
  if (!retainedId) throw new Error('Missing foreground east-bank parcel')
  const parcel: Parcel = { id: retainedId, blockId: BANK_BLOCK_ID,
    x: east - 8.2, z: south - 9.8, width: 13, depth: 12.5 }
  const building = createBuilding(parcel, source.district, source.column, source.row,
    createRandom(`${city.seed}:extension:${parcel.id}:building`), 'residential')
  const removedIds = new Set(oldParcels.map((item) => item.id))
  return { ...city,
    blocks: city.blocks.map((item) => item.id === BANK_BLOCK_ID ? block : item),
    parcels: [...city.parcels.filter((item) => !removedIds.has(item.id)), parcel],
    buildings: [...city.buildings.filter((item) => !removedIds.has(item.parcelId)), building],
  }
}
