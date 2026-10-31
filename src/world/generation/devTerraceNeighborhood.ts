import type { Building, CityModel, CityBlock, Parcel } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'
import { rearHighlandFrontZmm } from '../terrain/devHighlandContour'

export const DEV_TERRACE_BLOCK_PREFIX = 'block-dev-terrace-'
export const DEV_TERRACE_BUILDING_PREFIX = 'building-parcel-dev-terrace-'
export const DEV_TERRACE_SITES = [
  { x: -4, width: 14 }, { x: 16, width: 14 },
  { x: 40, width: 8 }, { x: 54, width: 12 },
  { x: 70, width: 12 },
] as const

/** Small real parcels on the upper shelf, generated with the existing building language. */
export function addDevTerraceNeighborhood(city: CityModel): CityModel {
  const blocks: CityBlock[] = []
  const parcels: Parcel[] = []
  const buildings: Building[] = []
  for (const [index, site] of DEV_TERRACE_SITES.entries()) {
    const { x, width } = site
    const z = rearHighlandFrontZmm(x * 1000) / 1000 - 16.5
    const depth = 8.5
    const blockId = `${DEV_TERRACE_BLOCK_PREFIX}${index}`
    const parcelId = `parcel-dev-terrace-${index}`
    const block: CityBlock = { id: blockId, column: 90 + index, row: -2,
      x, z, width, depth, district: 'residential', isPlaza: false,
      isPark: false, boundaryRoadEdgeIds: [],
      footprintXZ: [
        { x: x - width / 2, z: z - depth / 2 },
        { x: x + width / 2, z: z - depth / 2 },
        { x: x + width / 2, z: z + depth / 2 },
        { x: x - width / 2, z: z + depth / 2 },
      ] }
    const parcel: Parcel = { id: parcelId, blockId, x, z,
      width: width - 1.2, depth: depth - 1.2 }
    blocks.push(block)
    parcels.push(parcel)
    buildings.push(createBuilding(parcel, 'residential', block.column,
      block.row, createRandom(`${city.seed}:${parcelId}`)))
  }
  return { ...city,
    blocks: [...city.blocks, ...blocks],
    parcels: [...city.parcels, ...parcels],
    buildings: [...city.buildings, ...buildings],
  }
}
