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

  it('keeps buildings inside parcels and leaves the civic square open', () => {
    const city = generateCity(HERO_SEED)
    const parcels = new Map(city.parcels.map((parcel) => [parcel.id, parcel]))
    const plazaBlock = city.blocks.find((block) => block.isPlaza)!
    expect(city.buildings.length).toBeGreaterThan(100)
    expect(new Set(city.buildings.map((building) => building.kind)).size).toBe(4)
    for (const building of city.buildings) {
      const parcel = parcels.get(building.parcelId)!
      expect(parcel.blockId).not.toBe(plazaBlock.id)
      expect(Math.abs(building.x - parcel.x) + building.width / 2).toBeLessThan(parcel.width / 2)
      expect(Math.abs(building.z - parcel.z) + building.depth / 2).toBeLessThan(parcel.depth / 2)
    }
  })
})
