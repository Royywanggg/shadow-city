import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { derivePedestrianNetwork } from '../../city/pedestrian/derivePedestrianNetwork'
import type { Building, CityModel, CityPointXZ } from '../../city/model'
import { DEV_ESCARPMENT_BLOCK_IDS, DEV_OPEN_CHANNEL_BLOCK_IDS } from
  '../terrain/devTerrain'
import { channelXAt } from '../terrain/devTerrain'
import { createDevOrganicLayout } from './devOrganicLayout'
import { deriveDevRoadCorridor } from './devRoadCorridor'
import { applyDevValleyPlan, createDevValleyChannel } from './devValleyPlan'
import { placeDevCorridorParcels } from './devParcelPlacement'
import { applyDevHighlandPlan } from './devHighlandPlan'
import { applyDevRidgeFrontage } from './devRidgeFrontage'
import { applyDevUpperRoadPlan } from './devUpperRoadPlan'
import { addDevTerraceNeighborhood } from './devTerraceNeighborhood'
import { applyDevForegroundValley } from './devForegroundValley'
import { expandOriginalCity } from './expandOriginalCity'
import { applyDevWestBankDistrict, DEV_WEST_BANK_BLOCK_ID,
  DEV_WEST_BANK_INFILL_PREFIX, DEV_WEST_BANK_ROAD_ID } from './devWestBankDistrict'

function beforeWestBank(seed: string): CityModel {
  const original = expandOriginalCity(generateCity(seed))
  const organic = createDevOrganicLayout(original)
  const valley = applyDevValleyPlan(deriveDevRoadCorridor(organic))
  return applyDevForegroundValley(addDevTerraceNeighborhood(applyDevUpperRoadPlan(
    applyDevHighlandPlan(applyDevRidgeFrontage(
      placeDevCorridorParcels(valley))))))
}

function inside(point: CityPointXZ, polygon: readonly CityPointXZ[]): boolean {
  let result = false
  for (let index = 0, prior = polygon.length - 1;
    index < polygon.length; prior = index, index += 1) {
    const a = polygon[index]
    const b = polygon[prior]
    if ((a.z > point.z) !== (b.z > point.z) &&
      point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) {
      result = !result
    }
  }
  return result
}

function corners(building: Building): CityPointXZ[] {
  return building.masses.filter((mass) => mass.baseY < 2).flatMap((mass) =>
    [-1, 1].flatMap((sideX) => [-1, 1].map((sideZ) => ({
      x: building.x + mass.offsetX + sideX * mass.width / 2,
      z: building.z + mass.offsetZ + sideZ * mass.depth / 2,
    }))))
}

function canReach(start: string, target: string,
  edges: readonly Readonly<{ from: string; to: string }>[]): boolean {
  const neighbours = new Map<string, string[]>()
  for (const edge of edges) {
    neighbours.set(edge.from, [...neighbours.get(edge.from) ?? [], edge.to])
    neighbours.set(edge.to, [...neighbours.get(edge.to) ?? [], edge.from])
  }
  const visited = new Set([start])
  const queue = [start]
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of neighbours.get(queue[index]) ?? []) {
      if (next === target) return true
      if (!visited.has(next)) { visited.add(next); queue.push(next) }
    }
  }
  return start === target
}

describe('dev west-bank district', () => {
  it('recomposes four buildings and a curved street without changing old identities', () => {
    for (const seed of [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']) {
      const source = beforeWestBank(seed)
      const snapshot = structuredClone(source)
      const city = applyDevWestBankDistrict(source)
      expect(source).toEqual(snapshot)
      expect(applyDevWestBankDistrict(source)).toEqual(city)
      const oldBuildings = source.buildings.filter((building) =>
        source.parcels.some((parcel) => parcel.id === building.parcelId &&
          parcel.blockId === DEV_WEST_BANK_BLOCK_ID))
      const buildings = city.buildings.filter((building) =>
        city.parcels.some((parcel) => parcel.id === building.parcelId &&
          parcel.blockId === DEV_WEST_BANK_BLOCK_ID))
      expect(oldBuildings).toHaveLength(2)
      expect(buildings).toHaveLength(4)
      expect(buildings.slice(0, 2).map((item) => item.id).sort())
        .toEqual(oldBuildings.map((item) => item.id).sort())
      expect(buildings.filter((item) =>
        item.parcelId.startsWith(DEV_WEST_BANK_INFILL_PREFIX))).toHaveLength(2)
      const road = city.roads.edges.find((edge) => edge.id === DEV_WEST_BANK_ROAD_ID)!
      expect(road.centerlineXZ?.length).toBeGreaterThan(40)
      expect(Math.max(...road.centerlineXZ!.map((point) => point.x)))
        .toBeGreaterThan(-95)
      expect(road.centerlineXZ![0]).toEqual({ x: -100, z: 100 })
      expect(road.centerlineXZ!.at(-1)).toEqual({ x: -100, z: 145 })
      expect(city.roads.nodes).toEqual(source.roads.nodes)
      expect(city.roads.edges.map((edge) => edge.id))
        .toEqual(source.roads.edges.map((edge) => edge.id))
      expect(() => applyDevWestBankDistrict(city)).toThrow('original southern river road')
    }
  })

  it('keeps all masses on a sampled polygon and the road outside the channel', () => {
    for (const seed of [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']) {
      const city = applyDevWestBankDistrict(beforeWestBank(seed))
      const block = city.blocks.find((item) => item.id === DEV_WEST_BANK_BLOCK_ID)!
      const polygon = block.footprintXZ!
      const buildings = city.buildings.filter((building) =>
        city.parcels.some((parcel) => parcel.id === building.parcelId &&
          parcel.blockId === block.id))
      for (const building of buildings) {
        expect(corners(building).every((point) => inside(point, polygon)),
          building.id).toBe(true)
        expect(inside(building.entrance, polygon), building.id).toBe(true)
      }
      const road = city.roads.edges.find((edge) => edge.id === DEV_WEST_BANK_ROAD_ID)!
      const channel = createDevValleyChannel(city)
      for (const point of road.centerlineXZ!) {
        expect(channelXAt(channel, Math.round(point.z * 1000)) / 1000 - point.x)
          .toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('connects each west-bank entrance to the original plaza via actual sidewalks', () => {
    for (const seed of [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']) {
      const city = applyDevWestBankDistrict(beforeWestBank(seed))
      const open = new Set<string>([
        ...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS])
      const parcels = city.parcels.filter((parcel) => !open.has(parcel.blockId))
      const retained = { ...city,
        blocks: city.blocks.filter((block) => !open.has(block.id)),
        parcels,
        buildings: city.buildings.filter((building) =>
          parcels.some((parcel) => parcel.id === building.parcelId)),
      }
      const pedestrians = derivePedestrianNetwork(retained,
        { curbPlacement: 'endpointVector' })
      const bankBuildings = retained.buildings.filter((building) =>
        retained.parcels.some((parcel) => parcel.id === building.parcelId &&
          parcel.blockId === DEV_WEST_BANK_BLOCK_ID))
      for (const building of bankBuildings) {
        expect(canReach(`ped-entrance-${building.id}`,
          'ped-place-block-3-3', pedestrians.edges), building.id).toBe(true)
      }
    }
  })
})
