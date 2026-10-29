import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import type { Building, CityModel, CityPointXZ } from '../../city/model'
import { createDevOrganicLayout } from './devOrganicLayout'
import { deriveDevRoadCorridor } from './devRoadCorridor'
import { expandOriginalCity } from './expandOriginalCity'
import { placeDevCorridorParcels } from './devParcelPlacement'

const AFFECTED = ['block-6-4', 'block-6-5', 'block-7-4', 'block-7-5'] as const

function base(seed: string): CityModel {
  return createDevOrganicLayout(expandOriginalCity(generateCity(seed)))
}

function groundCorners(building: Building): CityPointXZ[] {
  return building.masses.filter((mass) => mass.baseY < 2).flatMap((mass) =>
    [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({
      x: building.x + mass.offsetX + sx * mass.width / 2,
      z: building.z + mass.offsetZ + sz * mass.depth / 2,
    }))))
}

function inConvexPolygon(point: CityPointXZ, polygon: readonly CityPointXZ[]): boolean {
  return polygon.every((a, index) => {
    const b = polygon[(index + 1) % polygon.length]
    return (b.x - a.x) * (point.z - a.z) -
      (b.z - a.z) * (point.x - a.x) >= -1e-5
  })
}

function roadClearance(city: CityModel, blockId: string, point: CityPointXZ): number {
  const block = city.blocks.find((item) => item.id === blockId)!
  const ids = [
    `edge-x-${block.column}-${block.row}`,
    `edge-x-${block.column}-${block.row + 1}`,
    `edge-z-${block.column}-${block.row}`,
    `edge-z-${block.column + 1}-${block.row}`,
  ]
  const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  return Math.min(...ids.flatMap((id) => {
    const edge = city.roads.edges.find((item) => item.id === id)!
    const path = edge.centerlineXZ ?? [nodes.get(edge.from)!, nodes.get(edge.to)!]
    return path.slice(1).map((to, index) => {
      const from = path[index]
      const dx = to.x - from.x
      const dz = to.z - from.z
      const t = Math.max(0, Math.min(1,
        ((point.x - from.x) * dx + (point.z - from.z) * dz) / (dx * dx + dz * dz)))
      return Math.hypot(point.x - from.x - dx * t,
        point.z - from.z - dz * t) - edge.width / 2
    })
  }))
}

describe('dev corridor parcel placement', () => {
  it('keeps every existing building identity, mesh and entrance attached to its parcel', () => {
    for (const seed of [HERO_SEED, 'alternate-city-seed', 'dev-layout-second-seed']) {
      const before = base(seed)
      const placed = placeDevCorridorParcels(deriveDevRoadCorridor(before))
      expect(placed.buildings.map((building) => building.id)).toEqual(
        before.buildings.map((building) => building.id))
      expect(placed.parcels.map((parcel) => parcel.id)).toEqual(
        before.parcels.map((parcel) => parcel.id))
      expect(placed.buildings).toHaveLength(before.buildings.length)
      for (const building of placed.buildings) {
        const original = before.buildings.find((item) => item.id === building.id)!
        expect(building.masses).toEqual(original.masses)
        expect(building.windows).toEqual(original.windows)
        expect(building.entrance.x - original.entrance.x).toBeCloseTo(
          building.x - original.x, 8)
        expect(building.entrance.z - original.entrance.z).toBeCloseTo(
          building.z - original.z, 8)
        const parcel = placed.parcels.find((item) => item.id === building.parcelId)!
        for (const corner of groundCorners(building)) {
          expect(Math.abs(corner.x - parcel.x)).toBeLessThanOrEqual(parcel.width / 2 + 1e-5)
          expect(Math.abs(corner.z - parcel.z)).toBeLessThanOrEqual(parcel.depth / 2 + 1e-5)
        }
      }
      expect(placeDevCorridorParcels(deriveDevRoadCorridor(base(seed)))).toEqual(placed)
    }
  })

  it('packs all four blocks inside road-safe polygons with legal south entrances', () => {
    const placed = placeDevCorridorParcels(deriveDevRoadCorridor(base(HERO_SEED)))
    for (const id of AFFECTED) {
      const block = placed.blocks.find((item) => item.id === id)!
      const polygon = block.footprintXZ!
      expect(polygon.length).toBeGreaterThanOrEqual(4)
      const parcels = placed.parcels.filter((parcel) => parcel.blockId === id)
        .sort((a, b) => a.x - b.x)
      expect(parcels).toHaveLength(id.startsWith('block-6-') ? 1 : 2)
      if (parcels.length === 2) {
        expect(parcels[0].x + parcels[0].width / 2 + 0.249).toBeLessThanOrEqual(
          parcels[1].x - parcels[1].width / 2)
      }
      for (const parcel of parcels) {
        const building = placed.buildings.find((item) => item.parcelId === parcel.id)!
        const corners = groundCorners(building)
        for (const point of corners) {
          expect(inConvexPolygon(point, polygon)).toBe(true)
          expect(roadClearance(placed, id, point)).toBeGreaterThanOrEqual(0.3)
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          expect(inConvexPolygon({ x: parcel.x + sx * parcel.width / 2,
            z: parcel.z + sz * parcel.depth / 2 }, polygon)).toBe(true)
        }
        expect(roadClearance(placed, id, building.entrance)).toBeGreaterThanOrEqual(0.25)
        expect(building.entrance.z).toBeLessThan(Math.max(...polygon.map((p) => p.z)))
      }
    }
  })

  it('leaves the original city and untouched dev blocks exactly where they were', () => {
    const original = base(HERO_SEED)
    const placed = placeDevCorridorParcels(deriveDevRoadCorridor(original))
    expect(original.roads.nodes.find((node) => node.id === 'node-7-5')?.x).toBe(100)
    expect(placed.roads.nodes.find((node) => node.id === 'node-7-5')?.x).toBe(108)
    for (const block of original.blocks.filter((item) => !AFFECTED.includes(item.id as typeof AFFECTED[number]))) {
      expect(placed.blocks.find((item) => item.id === block.id)).toEqual(block)
    }
  })
})
