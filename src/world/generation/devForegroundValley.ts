import type { CityModel, CityPointXZ, Parcel } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'
import { channelXAt } from '../terrain/devTerrain'
import { createDevValleyChannel } from './devValleyPlan'

export const FOREGROUND_RIVER_CLOSED_ROAD_ID = 'edge-z-1-7'
const BANK_BLOCK_ID = 'block-1-7'
const BANK_CLEARANCE_MM = 13_000

/** Opens the foreground valley while retaining one accessible east-bank home. */
export function applyDevForegroundValley(city: CityModel): CityModel {
  const source = city.blocks.find((block) => block.id === BANK_BLOCK_ID)
  if (!source) throw new Error('Missing foreground east-bank block')
  if (!city.roads.edges.some((edge) => edge.id === FOREGROUND_RIVER_CLOSED_ROAD_ID)) {
    throw new Error('Missing foreground road across the dev river')
  }
  const channel = createDevValleyChannel(city)
  const west = source.x - source.width / 2
  const east = source.x + source.width / 2
  const north = source.z - source.depth / 2
  const south = 119
  const bank: CityPointXZ[] = Array.from({ length: Math.ceil(south - north) + 1 },
    (_, index) => {
      const z = Math.min(south, north + index)
      return { x: Math.max(west, (channelXAt(channel, Math.round(z * 1000)) +
        BANK_CLEARANCE_MM) / 1000), z }
    }).filter((point, index, points) =>
      index === 0 || point.z !== points[index - 1].z)
  if (bank.some((point) => point.x >= east - 5)) {
    throw new Error('Foreground valley leaves no accessible east-bank parcel')
  }
  const footprintXZ: CityPointXZ[] = [bank[0], { x: east, z: north },
    { x: east, z: south }, ...bank.slice(1).reverse()]
  const block = { ...source, footprintXZ,
    boundaryRoadEdgeIds: ['edge-x-1-7', 'edge-z-2-7'],
    x: (west + east) / 2, z: (north + south) / 2,
    width: east - west, depth: south - north }
  const sourceParcels = city.parcels.filter((parcel) => parcel.blockId === BANK_BLOCK_ID)
  if (sourceParcels.length !== 2) throw new Error('Unexpected east-bank parcel layout')
  const retainedId = sourceParcels[0].id
  const parcel: Parcel = { id: retainedId, blockId: BANK_BLOCK_ID,
    x: east - 5.8, z: north + 5.8, width: 9.4, depth: 10.2 }
  const building = createBuilding(parcel, source.district, source.column, source.row,
    createRandom(`${city.seed}:extension:${parcel.id}:building`), 'residential')
  const replacedIds = new Set(sourceParcels.map((item) => item.id))
  return { ...city,
    roads: { ...city.roads, edges: city.roads.edges.filter((edge) =>
      edge.id !== FOREGROUND_RIVER_CLOSED_ROAD_ID) },
    blocks: city.blocks.map((item) => item.id === BANK_BLOCK_ID ? block : item),
    parcels: [...city.parcels.filter((item) => !replacedIds.has(item.id)), parcel],
    buildings: [...city.buildings.filter((item) => !replacedIds.has(item.parcelId)), building],
    streetFeatures: city.streetFeatures.filter((feature) =>
      !feature.id.startsWith(`lamp-${FOREGROUND_RIVER_CLOSED_ROAD_ID}-`) &&
        feature.id !== `bus-stop-${FOREGROUND_RIVER_CLOSED_ROAD_ID}`),
  }
}
