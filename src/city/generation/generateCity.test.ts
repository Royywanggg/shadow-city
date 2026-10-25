import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from './generateCity'

describe('generateCity', () => {
  it('reproduces the same static city from a seed', () => {
    expect(generateCity(HERO_SEED)).toEqual(generateCity(HERO_SEED))
    expect(generateCity('another-city')).not.toEqual(generateCity(HERO_SEED))
  })

  it('provides a connected road graph with valid edge references', () => {
    const { roads } = generateCity(HERO_SEED)
    const adjacency = new Map(roads.nodes.map((node) => [node.id, new Set<string>()]))
    for (const edge of roads.edges) {
      expect(adjacency.has(edge.from)).toBe(true)
      expect(adjacency.has(edge.to)).toBe(true)
      adjacency.get(edge.from)!.add(edge.to)
      adjacency.get(edge.to)!.add(edge.from)
    }
    const seen = new Set<string>()
    const pending = [roads.nodes[0].id]
    while (pending.length > 0) {
      const id = pending.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      pending.push(...adjacency.get(id)!)
    }
    expect(seen.size).toBe(roads.nodes.length)
  })

  it('preserves road topology across visual seeds', () => {
    const topology = (seed: string) => generateCity(seed).roads.edges.map((edge) => (
      [edge.id, edge.from, edge.to, edge.kind, edge.width]
    ))
    expect(topology('shadow-city-variation-a')).toEqual(topology(HERO_SEED))
    expect(topology('shadow-city-variation-b')).toEqual(topology(HERO_SEED))
  })

  it('keeps buildings inside parcels and leaves the civic square open', () => {
    const city = generateCity(HERO_SEED)
    const parcels = new Map(city.parcels.map((parcel) => [parcel.id, parcel]))
    const plazaBlock = city.blocks.find((block) => block.isPlaza)!
    expect(city.buildings.length).toBeGreaterThan(40)
    expect(new Set(city.buildings.map((building) => building.kind)).size).toBe(9)
    for (const building of city.buildings) {
      const parcel = parcels.get(building.parcelId)!
      expect(parcel.blockId).not.toBe(plazaBlock.id)
      expect(city.blocks.find((block) => block.id === parcel.blockId)?.isPark).toBe(false)
      expect(Math.abs(building.x - parcel.x) + building.width / 2).toBeLessThan(parcel.width / 2)
      expect(Math.abs(building.z - parcel.z) + building.depth / 2).toBeLessThan(parcel.depth / 2)
      for (const mass of building.masses) {
        expect(Math.abs(building.x + mass.offsetX - parcel.x) + mass.width / 2).toBeLessThan(parcel.width / 2)
        expect(Math.abs(building.z + mass.offsetZ - parcel.z) + mass.depth / 2).toBeLessThan(parcel.depth / 2)
      }
    }
  })

  it('places deterministic street details in intended civic and park spaces', () => {
    const city = generateCity(HERO_SEED)
    const ids = city.streetFeatures.map((feature) => feature.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(city.streetFeatures.map((feature) => feature.kind))).toEqual(
      new Set(['lamp', 'tree', 'bench', 'planter', 'busStop']),
    )
    for (const feature of city.streetFeatures) {
      expect(Number.isFinite(feature.x)).toBe(true)
      expect(Number.isFinite(feature.z)).toBe(true)
      if (feature.kind === 'bench' || feature.kind === 'planter') {
        expect(Math.abs(feature.x - city.plaza.x)).toBeLessThan(city.plaza.width / 2)
        expect(Math.abs(feature.z - city.plaza.z)).toBeLessThan(city.plaza.depth / 2)
      }
      if (feature.kind === 'tree') {
        expect(city.blocks.some((block) => block.isPark
          && Math.abs(feature.x - block.x) < block.width / 2
          && Math.abs(feature.z - block.z) < block.depth / 2)).toBe(true)
      }
    }
  })
})
